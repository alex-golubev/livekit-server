import { fileURLToPath } from 'node:url'
import { cli, defineAgent, type JobContext, ServerOptions } from '@livekit/agents'
import type * as google from '@livekit/agents-plugin-google'
import { Effect, Layer, Logger, LogLevel, Schedule } from 'effect'
import { ModelConfigLive, makeTutorConfigLive, TutorConfig } from './config.js'
import { ConnectionError, isRetriable, ParticipantError, TimeoutError } from './errors.js'
import { GeminiModel, GeminiModelLive } from './gemini.js'
import { LiveKitSession, LiveKitSessionLive } from './session.js'

/** Timeout durations for async pipeline steps. */
// TODO(metrics): The @livekit/agents SDK supports OpenTelemetry via
// metrics.AgentMetrics/RealtimeModelMetrics and telemetry.setTracerProvider().
// To enable: add an OTLP collector (e.g. Grafana Alloy) to compose.yaml,
// configure telemetry.setTracerProvider() here, and set up Prometheus remote-write.

const TIMEOUTS = {
  connect: '5 seconds',
  waitForParticipant: '30 seconds',
  pipeline: '120 seconds'
} as const

/** 1 retry, exponential backoff (1s + jitter). 2 total attempts. */
const connectSchedule = Schedule.exponential('1 second').pipe(Schedule.intersect(Schedule.recurs(1)), Schedule.jittered)

/** 1 retry, exponential backoff (2s + jitter). 2 total attempts. */
const sessionSchedule = Schedule.exponential('2 seconds').pipe(
  Schedule.intersect(Schedule.recurs(1)),
  Schedule.jittered
)

/** Logs a typed error and re-throws it as a defect, so the LiveKit SDK sees the failure. */
const logAndDie = <E extends { readonly _tag: string; readonly message: string }>(e: E) =>
  Effect.logError(`${e._tag}: ${e.message}`).pipe(Effect.andThen(Effect.die(e)))

/** Connect to the LiveKit room. */
const connectToRoom = (ctx: JobContext) =>
  Effect.tryPromise({
    try: () => ctx.connect(),
    catch: (cause) => new ConnectionError({ message: 'Failed to connect to room', cause })
  }).pipe(
    Effect.timeoutFail({
      duration: TIMEOUTS.connect,
      onTimeout: () => new TimeoutError({ message: 'Connect timed out', operation: 'connect' })
    }),
    Effect.retry(connectSchedule)
  )

/** Wait for a participant to join the room. */
const waitForParticipant = (ctx: JobContext) =>
  Effect.tryPromise({
    try: () => ctx.waitForParticipant(),
    catch: (cause) => new ParticipantError({ message: 'Failed to wait for participant', cause })
  }).pipe(
    Effect.timeoutFail({
      duration: TIMEOUTS.waitForParticipant,
      onTimeout: () =>
        new TimeoutError({
          message: 'Wait for participant timed out',
          operation: 'waitForParticipant'
        })
    })
  )

/** Resolve the Gemini RealtimeModel from env-based config. */
const resolveModel = GeminiModel.pipe(
  Effect.provide(GeminiModelLive),
  Effect.provide(ModelConfigLive),
  Effect.retry(connectSchedule)
)

/** Start the voice session with a pre-resolved model and participant config outside retry scope. */
const startSession = (ctx: JobContext, attributes: Record<string, string>, model: google.beta.realtime.RealtimeModel) =>
  TutorConfig.pipe(
    Effect.provide(makeTutorConfigLive(attributes)),
    Effect.flatMap((config) =>
      LiveKitSession.pipe(
        Effect.flatMap((session) => session.start(ctx)),
        Effect.provide(LiveKitSessionLive),
        Effect.provide(Layer.succeed(GeminiModel, model)),
        Effect.provide(Layer.succeed(TutorConfig, config)),
        Effect.retry({ schedule: sessionSchedule, while: isRetriable })
      )
    )
  )

/**
 * Builds the main Effect program for a single agent job.
 *
 * Orchestrates: {@link connectToRoom} → ({@link waitForParticipant} ‖ {@link resolveModel}) → {@link startSession}.
 */
export const makeProgram = (ctx: JobContext) =>
  connectToRoom(ctx).pipe(
    Effect.andThen(
      Effect.all({ participant: waitForParticipant(ctx), model: resolveModel }, { concurrency: 'unbounded' })
    ),
    Effect.flatMap(({ participant, model }) => startSession(ctx, participant.attributes, model))
  )

// noinspection JSUnusedGlobalSymbols
/**
 * LiveKit Agent entry point.
 *
 * Bridges {@link defineAgent} with the Effect runtime —
 * runs the declarative pipeline and converts every typed error into a defect.
 */
export default defineAgent({
  entry: (ctx: JobContext) =>
    makeProgram(ctx).pipe(
      Effect.timeoutFail({
        duration: TIMEOUTS.pipeline,
        onTimeout: () => new TimeoutError({ message: 'Agent pipeline timed out', operation: 'pipeline' })
      }),
      Effect.catchAll(logAndDie),
      Logger.withMinimumLogLevel(LogLevel.Debug),
      Effect.runPromise
    )
})

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }))

import type { JobContext } from '@livekit/agents'
import { type llm, voice } from '@livekit/agents'
import type * as google from '@livekit/agents-plugin-google'
import { Cause, Context, Effect, Layer, Option, Ref, Runtime } from 'effect'
import { TutorConfig, type TutorConfigShape } from './config.js'
import { SessionStartError, TimeoutError } from './errors.js'
import { FeedbackSink, makeFeedbackTools } from './feedback.js'
import { GeminiModel } from './gemini.js'

/** Timeout for the full session start pipeline (connect to Gemini and initial greeting). */
const SESSION_START_TIMEOUT = '20 seconds' as const

/** Timeout for best-effort resource close operations (AgentSession, RealtimeModel). */
const CLOSE_TIMEOUT = '5 seconds' as const

/** Best-effort close of AgentSession. Idempotent (guards on `this.started`). */
const closeAgentSession = (session: voice.AgentSession) =>
  Effect.tryPromise(() => session.close()).pipe(
    Effect.timeoutFail({
      duration: CLOSE_TIMEOUT,
      onTimeout: () =>
        new TimeoutError({
          message: 'AgentSession.close() timed out',
          operation: 'closeAgentSession'
        })
    }),
    Effect.tapError((error) => Effect.logWarning('Failed to close AgentSession during cleanup', { error })),
    Effect.ignore
  )

/** Best-effort close of RealtimeModel. close() is idempotent per RealtimeModel contract. */
const closeRealtimeModel = (model: google.beta.realtime.RealtimeModel) =>
  Effect.tryPromise(() => model.close()).pipe(
    Effect.timeoutFail({
      duration: CLOSE_TIMEOUT,
      onTimeout: () =>
        new TimeoutError({
          message: 'RealtimeModel.close() timed out',
          operation: 'closeRealtimeModel'
        })
    }),
    Effect.tapError((error) => Effect.logWarning('Failed to close RealtimeModel during cleanup', { error })),
    Effect.ignore
  )

/**
 * Effect Service orchestrating the LiveKit voice session lifecycle.
 *
 * {@link start} connects to the room, starts the {@link voice.AgentSession},
 * and triggers the initial greeting.
 *
 * Resource cleanup:
 * - **Success**: SDK closes AgentSession via `ctx._primaryAgentSession`.
 *   RealtimeModel is closed via {@link JobContext.addShutdownCallback}.
 * - **Failure**: Both resources are closed immediately via
 *   {@link Effect.tapErrorCause}.
 */
export class LiveKitSession extends Context.Tag('LiveKitSession')<
  LiveKitSession,
  {
    readonly start: (ctx: JobContext) => Effect.Effect<void, SessionStartError | TimeoutError>
  }
>() {}

/**
 * Starts the LiveKit AgentSession and connects it to the room.
 */
const startAgentSession = (
  session: voice.AgentSession,
  ctx: JobContext,
  systemPrompt: string,
  tools: llm.ToolContext
) =>
  Effect.tryPromise({
    try: () =>
      session.start({
        room: ctx.room,
        agent: new voice.Agent({
          instructions: systemPrompt,
          tools
        })
      }),
    catch: (cause) => new SessionStartError({ message: 'Failed to start AgentSession', cause })
  })

/**
 * Triggers the agent to speak the initial greeting.
 */
const generateInitialGreeting = (session: voice.AgentSession, greetingPrompt: string) =>
  Effect.try({
    try: () =>
      session.generateReply({
        instructions: greetingPrompt
      }),
    catch: (cause) => new SessionStartError({ message: 'Failed to generate greeting', cause })
  })

/** Unwraps the inner Error from SDK error wrappers ({ error: Error }), returns as-is otherwise. */
const unwrapSdkError = (err: NonNullable<unknown>): unknown =>
  typeof err === 'object' && 'error' in err && err.error instanceof Error ? err.error : err

/** Extracts a human-readable message from SDK error wrappers or plain Errors. */
const describeError = (err: unknown): string | null =>
  Option.fromNullable(err).pipe(
    Option.map(unwrapSdkError),
    Option.map((e) => (e instanceof Error ? e.message : String(e))),
    Option.getOrNull
  )

/**
 * Registers event listeners on the AgentSession for observability.
 *
 * Uses the provided Effect {@link Runtime} so that logs from event handlers
 * (which run outside the Effect pipeline) inherit the configured logger.
 */
const registerSessionMonitoring = (session: voice.AgentSession, rt: Runtime.Runtime<never>) =>
  Effect.sync(() => {
    const runFork = Runtime.runFork(rt)

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      runFork(
        Effect.logWarning('AgentSession error (SDK handling internally)', {
          error: describeError(ev.error),
          source: ev.source?.constructor?.name ?? 'unknown'
        })
      )
    })

    session.on(voice.AgentSessionEventTypes.Close, (ev) => {
      runFork(
        Effect.logInfo('AgentSession closed', {
          reason: ev.reason,
          error: describeError(ev.error)
        })
      )
    })
  })

/** Creates a {@link FeedbackSink} that publishes feedback JSON via the room data channel. */
const makeFeedbackSinkLive = (room: JobContext['room']): Context.Tag.Service<typeof FeedbackSink> => ({
  publish: (data) =>
    Option.fromNullable(room.localParticipant).pipe(
      Option.match({
        onNone: () => Effect.logWarning('Cannot publish feedback: no localParticipant'),
        onSome: (lp) =>
          Effect.tryPromise(() => {
            const payload = new TextEncoder().encode(JSON.stringify({ type: 'feedback', data }))
            return lp.publishData(payload, { reliable: true, topic: 'feedback' })
          }).pipe(
            Effect.tapError((error) => Effect.logWarning('Failed to publish feedback', { error })),
            Effect.ignore
          )
      })
    )
})

/**
 * Happy-path startup: connect to a room, generate greeting, register shutdown callback.
 *
 * Pure business logic — no resource tracking, no timeout, no error recovery.
 * Captures the Effect {@link Runtime} once for both monitoring, shutdown, and feedback tools.
 */
const runStartup =
  (config: TutorConfigShape, realtimeModel: google.beta.realtime.RealtimeModel, ctx: JobContext) =>
  (session: voice.AgentSession) =>
    Effect.runtime<FeedbackSink>().pipe(
      Effect.flatMap((rt) => {
        const tools = makeFeedbackTools(rt)
        return startAgentSession(session, ctx, config.systemPrompt, tools).pipe(
          Effect.andThen(registerSessionMonitoring(session, rt)),
          Effect.andThen(generateInitialGreeting(session, config.greetingPrompt)),
          // Register model cleanup for a graceful shutdown.
          // SDK closes AgentSession via ctx._primaryAgentSession
          // but never closes RealtimeModel. close() is idempotent.
          Effect.andThen(
            Effect.sync(() => ctx.addShutdownCallback(() => Runtime.runPromise(rt)(closeRealtimeModel(realtimeModel))))
          )
        )
      })
    )

/** Closes both resources on startup failure. Logs the cause, ignores close() errors. */
const cleanupResources =
  (sessionRef: Ref.Ref<voice.AgentSession | undefined>, realtimeModel: google.beta.realtime.RealtimeModel) =>
  (cause: Cause.Cause<unknown>) =>
    Ref.get(sessionRef).pipe(
      Effect.flatMap((session) =>
        Effect.logWarning('Startup failed, cleaning up resources', {
          cause: Cause.pretty(cause)
        }).pipe(
          Effect.andThen(
            Effect.all([session ? closeAgentSession(session) : Effect.void, closeRealtimeModel(realtimeModel)], {
              concurrency: 'unbounded'
            })
          )
        )
      ),
      Effect.ignore
    )

/**
 * Orchestrates session startup with resource safety.
 *
 * Combines {@link runStartup} (business logic) with {@link cleanupResources}
 * (error recovery), adding timeout and Ref-based session tracking.
 */
const makeStart =
  (config: TutorConfigShape, realtimeModel: google.beta.realtime.RealtimeModel) =>
  (ctx: JobContext): Effect.Effect<void, SessionStartError | TimeoutError> =>
    Ref.make<voice.AgentSession | undefined>(undefined).pipe(
      Effect.flatMap((sessionRef) =>
        Effect.try({
          try: () => new voice.AgentSession({ llm: realtimeModel }),
          catch: (cause) => new SessionStartError({ message: 'Failed to create AgentSession', cause })
        }).pipe(
          Effect.tap((session) => Ref.set(sessionRef, session)),
          Effect.tap(runStartup(config, realtimeModel, ctx)),
          Effect.asVoid,
          Effect.timeoutFail({
            duration: SESSION_START_TIMEOUT,
            onTimeout: () =>
              new TimeoutError({
                message: 'Session start timed out',
                operation: 'sessionStart'
              })
          }),
          Effect.tapErrorCause(cleanupResources(sessionRef, realtimeModel)),
          Effect.provide(Layer.succeed(FeedbackSink, makeFeedbackSinkLive(ctx.room)))
        )
      )
    )

/**
 * Live Layer for {@link LiveKitSession}.
 *
 * Resolves {@link TutorConfig} and {@link GeminiModel}, then delegates
 * to {@link makeStart} for the actual session pipeline.
 */
export const LiveKitSessionLive: Layer.Layer<LiveKitSession, never, TutorConfig | GeminiModel> = Layer.effect(
  LiveKitSession,
  Effect.all({
    config: TutorConfig,
    realtimeModel: GeminiModel
  }).pipe(Effect.map(({ config, realtimeModel }) => ({ start: makeStart(config, realtimeModel) })))
)

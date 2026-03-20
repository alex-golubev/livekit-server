import { beforeEach, describe, expect, type MockInstance, vi } from 'vitest'
import { it as effectIt } from '@effect/vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import type { JobContext } from '@livekit/agents'
import type * as google from '@livekit/agents-plugin-google'
import { TutorConfig, type TutorConfigShape } from './config.js'
import { GeminiModel } from './gemini.js'
import { LiveKitSession, LiveKitSessionLive } from './session.js'

// --- Hoisted mocks (vi.mock is hoisted above imports) ---

const { AgentSessionMock, AgentMock } = vi.hoisted(() => {
  const proto = {
    start: vi.fn().mockResolvedValue(undefined),
    generateReply: vi.fn().mockReturnValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  }
  const AgentSessionMock = Object.assign(
    vi.fn(() => Object.create(proto)),
    { proto }
  )
  const AgentMock = vi.fn()
  return { AgentSessionMock, AgentMock }
})

vi.mock('@livekit/agents', () => ({
  voice: {
    AgentSession: AgentSessionMock,
    Agent: AgentMock,
    AgentSessionEventTypes: { Error: 'error', Close: 'close' }
  }
}))

// --- Test fixtures ---

const testConfig: TutorConfigShape = {
  targetLanguage: 'French',
  nativeLanguage: undefined,
  studentLevel: 'beginner',
  systemPrompt: 'test system prompt',
  greetingPrompt: 'test greeting prompt'
}

const TestTutorConfig = Layer.succeed(TutorConfig, testConfig)

const mockRealtimeModel = () =>
  ({ close: vi.fn().mockResolvedValue(undefined) }) as unknown as google.beta.realtime.RealtimeModel

const mockJobContext = () =>
  ({
    room: { name: 'test-room' },
    addShutdownCallback: vi.fn()
  }) as unknown as JobContext

/** Resolve LiveKitSession and call start(ctx) with provided mock layers. */
const runSession = (ctx: JobContext, realtimeModel: google.beta.realtime.RealtimeModel) =>
  LiveKitSession.pipe(
    Effect.flatMap((session) => session.start(ctx)),
    Effect.provide(LiveKitSessionLive),
    Effect.provide(TestTutorConfig),
    Effect.provide(Layer.succeed(GeminiModel, realtimeModel as google.beta.realtime.RealtimeModel)),
    Logger.withMinimumLogLevel(LogLevel.None)
  )

describe('LiveKitSessionLive', () => {
  let ctx: ReturnType<typeof mockJobContext>
  let model: ReturnType<typeof mockRealtimeModel>

  beforeEach(() => {
    ctx = mockJobContext()
    model = mockRealtimeModel()
    vi.clearAllMocks()
    // Restore default happy-path behavior after clearAllMocks
    AgentSessionMock.proto.start.mockResolvedValue(undefined)
    AgentSessionMock.proto.generateReply.mockReturnValue(undefined)
    AgentSessionMock.proto.close.mockResolvedValue(undefined)
  })

  describe('happy path', () => {
    effectIt.effect('calls AgentSession.start with room and system prompt', () =>
      Effect.gen(function* () {
        yield* runSession(ctx, model)

        const startCall = AgentSessionMock.proto.start.mock.calls[0]![0]
        expect(startCall.room).toBe(ctx.room)
        expect(AgentMock).toHaveBeenCalledWith({ instructions: 'test system prompt' })
      })
    )

    effectIt.effect('calls generateReply with greeting prompt', () =>
      Effect.gen(function* () {
        yield* runSession(ctx, model)

        expect(AgentSessionMock.proto.generateReply).toHaveBeenCalledWith({
          instructions: 'test greeting prompt'
        })
      })
    )

    effectIt.effect('registers shutdown callback', () =>
      Effect.gen(function* () {
        yield* runSession(ctx, model)

        expect(ctx.addShutdownCallback).toHaveBeenCalledTimes(1)
      })
    )

    effectIt.effect('registers event listeners for Error and Close', () =>
      Effect.gen(function* () {
        yield* runSession(ctx, model)

        const onCalls: unknown[][] = AgentSessionMock.proto.on.mock.calls
        const eventNames = onCalls.map((c) => c[0])
        expect(eventNames).toContain('error')
        expect(eventNames).toContain('close')
      })
    )
  })

  describe('startup failure', () => {
    effectIt.effect('session.start() rejects → SessionStartError + cleanup', () =>
      Effect.gen(function* () {
        AgentSessionMock.proto.start.mockRejectedValue(new Error('start failed'))

        const error = yield* runSession(ctx, model).pipe(Effect.flip)

        expect(error._tag).toBe('SessionStartError')
        expect(AgentSessionMock.proto.close).toHaveBeenCalled()
        expect((model as unknown as { close: MockInstance }).close).toHaveBeenCalled()
      })
    )

    effectIt.effect('generateReply() throws → SessionStartError + cleanup', () =>
      Effect.gen(function* () {
        AgentSessionMock.proto.generateReply.mockImplementation(() => {
          throw new Error('reply failed')
        })

        const error = yield* runSession(ctx, model).pipe(Effect.flip)

        expect(error._tag).toBe('SessionStartError')
        expect(AgentSessionMock.proto.close).toHaveBeenCalled()
        expect((model as unknown as { close: MockInstance }).close).toHaveBeenCalled()
      })
    )

    effectIt.effect('AgentSession constructor throws → cleanup model only', () =>
      Effect.gen(function* () {
        AgentSessionMock.mockImplementationOnce(() => {
          throw new Error('constructor failed')
        })

        const error = yield* runSession(ctx, model).pipe(Effect.flip)

        expect(error._tag).toBe('SessionStartError')
        // Session was never created, so close should NOT be called on it
        expect(AgentSessionMock.proto.close).not.toHaveBeenCalled()
        // Model should still be cleaned up
        expect((model as unknown as { close: MockInstance }).close).toHaveBeenCalled()
      })
    )
  })
})

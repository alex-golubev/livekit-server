import { it as effectIt } from '@effect/vitest'
import type { JobContext } from '@livekit/agents'
import { Cause, Effect, Exit, Fiber, Logger, LogLevel, Option, TestClock } from 'effect'
import { beforeEach, describe, expect, vi } from 'vitest'

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>()
  return {
    ...actual,
    defineAgent: vi.fn((config: unknown) => config),
    cli: { runApp: vi.fn() },
    ServerOptions: vi.fn(),
    isAPIError: vi.fn(() => false),
    voice: {
      AgentSession: vi.fn(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        generateReply: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn()
      })),
      Agent: vi.fn(),
      AgentSessionEventTypes: { Error: 'error', Close: 'close' }
    }
  }
})

vi.mock('@livekit/agents-plugin-google', () => ({
  beta: {
    realtime: {
      RealtimeModel: vi.fn(() => ({
        close: vi.fn().mockResolvedValue(undefined)
      }))
    }
  }
}))

import { makeProgram } from './agent.js'

const mockJobContext = (attrs: Record<string, string> = { 'lesson.language': 'Spanish' }) =>
  ({
    room: { name: 'test-room' },
    connect: vi.fn().mockResolvedValue(undefined),
    waitForParticipant: vi.fn().mockResolvedValue({ attributes: attrs }),
    addShutdownCallback: vi.fn()
  }) as unknown as JobContext

describe('makeProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  effectIt.effect('runs the full pipeline on happy path', () =>
    Effect.gen(function* () {
      const ctx = mockJobContext()
      yield* makeProgram(ctx).pipe(Logger.withMinimumLogLevel(LogLevel.None))

      expect(ctx.connect).toHaveBeenCalledTimes(1)
      expect(ctx.waitForParticipant).toHaveBeenCalledTimes(1)
      expect(ctx.addShutdownCallback).toHaveBeenCalledTimes(1)
    })
  )

  effectIt.effect('fails with ConfigError when participant attributes are invalid', () =>
    Effect.gen(function* () {
      const ctx = mockJobContext({})

      const error = yield* makeProgram(ctx).pipe(Logger.withMinimumLogLevel(LogLevel.None), Effect.flip)

      expect(error._tag).toBe('ConfigError')
    })
  )

  effectIt.effect('fails with ConnectionError after retry exhaustion', () =>
    Effect.gen(function* () {
      const ctx = mockJobContext()
      ;(ctx.connect as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))

      const fiber = yield* makeProgram(ctx).pipe(Logger.withMinimumLogLevel(LogLevel.None), Effect.fork)
      yield* TestClock.adjust('5 seconds')
      const exit = yield* Fiber.await(fiber)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause).pipe(Option.getOrNull)
        expect(error?._tag).toBe('ConnectionError')
      }
    })
  )
})

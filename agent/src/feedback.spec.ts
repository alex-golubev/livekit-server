import { it as effectIt } from '@effect/vitest'
import { Effect, Layer, Runtime } from 'effect'
import { describe, expect, it } from 'vitest'
import { FeedbackSink, makeFeedbackTools } from './feedback.js'

describe('FeedbackSink', () => {
  it('is a tagged service', () => {
    expect(FeedbackSink.key).toBe('FeedbackSink')
  })
})

describe('makeFeedbackTools', () => {
  const mockSinkLayer = (published: unknown[]) =>
    Layer.succeed(FeedbackSink, {
      publish: (data) => {
        published.push(data)
        return Effect.void
      }
    })

  it('creates a provide_feedback function tool', () => {
    const tools = makeFeedbackTools(Runtime.defaultRuntime as Runtime.Runtime<FeedbackSink>)
    expect(tools).toHaveProperty('provide_feedback')
    expect(tools.provide_feedback.type).toBe('function')
    expect(tools.provide_feedback.description).toBeTruthy()
  })

  effectIt.effect('execute publishes feedback via FeedbackSink', () =>
    Effect.gen(function* () {
      const published: unknown[] = []
      const rt = yield* Effect.runtime<FeedbackSink>().pipe(Effect.provide(mockSinkLayer(published)))
      const tools = makeFeedbackTools(rt)

      const feedbackData = { grammar: 4, vocabulary: 3, fluency: 4, feedback: 'Bon travail!' }
      yield* Effect.promise(() =>
        tools.provide_feedback.execute(feedbackData as never, {
          ctx: {} as never,
          toolCallId: 'test-call-id'
        })
      )

      expect(published).toHaveLength(1)
      expect(published[0]).toEqual(feedbackData)
    })
  )
})

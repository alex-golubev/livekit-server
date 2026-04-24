import { it as effectIt } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { describe, expect, vi } from 'vitest'
import { ModelConfig, type ModelConfigShape } from './config.js'
import { GeminiModel, GeminiModelLive } from './gemini.js'

const { RealtimeModelMock } = vi.hoisted(() => ({
  RealtimeModelMock: vi.fn()
}))

vi.mock('@livekit/agents-plugin-google', () => ({
  beta: {
    realtime: {
      RealtimeModel: RealtimeModelMock
    }
  }
}))

const testModelConfig: ModelConfigShape = {
  model: 'test-model',
  voice: 'TestVoice',
  temperature: 0.5,
  project: 'test-project',
  location: 'us-central1',
  language: 'he-IL',
  transcriptionLanguageCodes: ['he-IL']
}

const TestModelConfig = Layer.succeed(ModelConfig, testModelConfig)

const resolveModel = GeminiModel.pipe(Effect.provide(GeminiModelLive), Effect.provide(TestModelConfig))

describe('GeminiModelLive', () => {
  effectIt.effect('constructs RealtimeModel with correct config', () =>
    Effect.gen(function* () {
      RealtimeModelMock.mockReturnValue({ fake: true })
      yield* resolveModel

      expect(RealtimeModelMock).toHaveBeenCalledWith({
        model: 'test-model',
        voice: 'TestVoice',
        language: 'he-IL',
        temperature: 0.5,
        vertexai: true,
        project: 'test-project',
        location: 'us-central1',
        enableAffectiveDialog: true,
        apiVersion: 'v1beta1',
        inputAudioTranscription: { languageCodes: ['he-IL'] },
        outputAudioTranscription: { languageCodes: ['he-IL'] }
      })
    })
  )

  effectIt.effect('maps constructor throw to GeminiConnectionError', () =>
    Effect.gen(function* () {
      const cause = new Error('API key invalid')
      RealtimeModelMock.mockImplementation(() => {
        throw cause
      })

      const error = yield* resolveModel.pipe(Effect.flip)

      expect(error._tag).toBe('GeminiConnectionError')
      expect(error.cause).toBe(cause)
    })
  )
})

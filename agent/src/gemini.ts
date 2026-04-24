import * as google from '@livekit/agents-plugin-google'
import { Context, Effect, Layer } from 'effect'
import { ModelConfig } from './config.js'
import { GeminiConnectionError } from './errors.js'

/**
 * Effect Service wrapping the Gemini Realtime model instance.
 *
 * Provides a pre-configured {@link google.beta.realtime}
 * for Speech-to-Speech conversations.
 */
export class GeminiModel extends Context.Tag('GeminiModel')<GeminiModel, google.beta.realtime.RealtimeModel>() {}

/** Temporary experiment: force Hebrew language/script hints for Live API transcription. */
const FORCED_TRANSCRIPTION_LANGUAGE = 'he-IL' as const

/**
 * Live Layer for {@link GeminiModel}.
 *
 * Depends on {@link ModelConfig} for model parameters.
 * Fails with {@link GeminiConnectionError} if model creation throws.
 */
export const GeminiModelLive: Layer.Layer<GeminiModel, GeminiConnectionError, ModelConfig> = Layer.effect(
  GeminiModel,
  ModelConfig.pipe(
    Effect.flatMap((config) =>
      Effect.try({
        try: () =>
          new google.beta.realtime.RealtimeModel({
            model: config.model,
            voice: config.voice,
            language: FORCED_TRANSCRIPTION_LANGUAGE,
            temperature: config.temperature,
            vertexai: true,
            project: config.project,
            location: config.location,
            enableAffectiveDialog: true,
            apiVersion: 'v1beta1',
            inputAudioTranscription: { languageCodes: [FORCED_TRANSCRIPTION_LANGUAGE] },
            outputAudioTranscription: { languageCodes: [FORCED_TRANSCRIPTION_LANGUAGE] }
          }),
        catch: (cause) =>
          new GeminiConnectionError({
            message: 'Failed to create Gemini RealtimeModel',
            cause
          })
      })
    )
  )
)

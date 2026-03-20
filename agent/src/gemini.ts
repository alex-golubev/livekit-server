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
            temperature: config.temperature,
            enableAffectiveDialog: true,
            inputAudioTranscription: {},
            outputAudioTranscription: {}
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

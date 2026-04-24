import { it as effectIt } from '@effect/vitest'
import { Effect } from 'effect'
import { afterEach, describe, expect, vi } from 'vitest'
import { ModelConfig, ModelConfigLive, makeTutorConfigLive, TutorConfig } from './config.js'
import { ConfigError } from './errors.js'

/** Resolve ModelConfig from env. */
const runModelConfig = ModelConfig.pipe(Effect.provide(ModelConfigLive))

/** Resolve ModelConfig and extract a single field. */
const modelConfigField = <K extends keyof ModelConfig['Type']>(field: K) =>
  runModelConfig.pipe(Effect.map((c) => c[field]))

/** Resolve TutorConfig from participant attributes. */
const runConfig = (attrs: Record<string, string>) => TutorConfig.pipe(Effect.provide(makeTutorConfigLive(attrs)))

/** Resolve TutorConfig and extract a single field. */
const configField = <K extends keyof TutorConfig['Type']>(attrs: Record<string, string>, field: K) =>
  runConfig(attrs).pipe(Effect.map((c) => c[field]))

/** Resolve TutorConfig expecting a ConfigError. */
const runConfigError = (attrs: Record<string, string>) => runConfig(attrs).pipe(Effect.flip)

/** Minimal valid attributes. */
const validAttrs = { 'lesson.language': 'Spanish' }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('makeTutorConfigLive', () => {
  describe('language extraction', () => {
    effectIt.effect('succeeds with lesson.language present', () =>
      Effect.gen(function* () {
        const config = yield* runConfig(validAttrs)
        expect(config.targetLanguage).toBe('Spanish')
      })
    )

    effectIt.effect('fails with ConfigError when lesson.language is missing', () =>
      Effect.gen(function* () {
        const error = yield* runConfigError({})
        expect(error).toBeInstanceOf(ConfigError)
        expect(error._tag).toBe('ConfigError')
      })
    )

    effectIt.effect('fails with ConfigError when lesson.language is empty', () =>
      Effect.gen(function* () {
        const error = yield* runConfigError({ 'lesson.language': '' })
        expect(error._tag).toBe('ConfigError')
      })
    )
  })

  describe('level parsing', () => {
    effectIt.effect('parses beginner', () =>
      configField({ ...validAttrs, 'lesson.level': 'beginner' }, 'studentLevel').pipe(
        Effect.tap((level) => expect(level).toBe('beginner'))
      )
    )

    effectIt.effect('parses intermediate', () =>
      configField({ ...validAttrs, 'lesson.level': 'intermediate' }, 'studentLevel').pipe(
        Effect.tap((level) => expect(level).toBe('intermediate'))
      )
    )

    effectIt.effect('parses advanced', () =>
      configField({ ...validAttrs, 'lesson.level': 'advanced' }, 'studentLevel').pipe(
        Effect.tap((level) => expect(level).toBe('advanced'))
      )
    )

    effectIt.effect('defaults to beginner when level is missing', () =>
      configField(validAttrs, 'studentLevel').pipe(Effect.tap((level) => expect(level).toBe('beginner')))
    )

    effectIt.effect('defaults to beginner for unknown level', () =>
      configField({ ...validAttrs, 'lesson.level': 'expert' }, 'studentLevel').pipe(
        Effect.tap((level) => expect(level).toBe('beginner'))
      )
    )
  })

  describe('nativeLanguage', () => {
    effectIt.effect('uses attribute value when present', () =>
      configField({ ...validAttrs, 'lesson.nativeLanguage': 'Russian' }, 'nativeLanguage').pipe(
        Effect.tap((lang) => expect(lang).toBe('Russian'))
      )
    )

    effectIt.effect('is undefined when attribute is missing', () =>
      configField(validAttrs, 'nativeLanguage').pipe(Effect.tap((lang) => expect(lang).toBeUndefined()))
    )

    effectIt.effect('is undefined when attribute is empty string', () =>
      configField({ ...validAttrs, 'lesson.nativeLanguage': '' }, 'nativeLanguage').pipe(
        Effect.tap((lang) => expect(lang).toBeUndefined())
      )
    )
  })

  describe('systemPrompt', () => {
    effectIt.effect('contains the target language', () =>
      configField(validAttrs, 'systemPrompt').pipe(Effect.tap((prompt) => expect(prompt).toContain('Spanish')))
    )

    effectIt.effect('contains beginner guidance for beginner level', () =>
      configField({ ...validAttrs, 'lesson.level': 'beginner' }, 'systemPrompt').pipe(
        Effect.tap((prompt) => expect(prompt).toContain('short, simple sentences'))
      )
    )

    effectIt.effect('contains advanced guidance for advanced level', () =>
      configField({ ...validAttrs, 'lesson.level': 'advanced' }, 'systemPrompt').pipe(
        Effect.tap((prompt) => expect(prompt).toContain('idioms, slang'))
      )
    )

    effectIt.effect('includes native language clause when nativeLanguage is set', () =>
      configField({ ...validAttrs, 'lesson.nativeLanguage': 'Russian' }, 'systemPrompt').pipe(
        Effect.tap((prompt) => {
          expect(prompt).toContain('Russian')
          expect(prompt).toContain('native language')
        })
      )
    )

    effectIt.effect('omits native language clause when nativeLanguage is absent', () =>
      configField(validAttrs, 'systemPrompt').pipe(
        Effect.tap((prompt) => expect(prompt).not.toContain('native language'))
      )
    )
  })

  describe('greetingPrompt', () => {
    effectIt.effect('contains the target language', () =>
      configField(validAttrs, 'greetingPrompt').pipe(Effect.tap((prompt) => expect(prompt).toContain('Spanish')))
    )
  })
})

describe('ModelConfigLive', () => {
  describe('model and voice from env', () => {
    effectIt.effect('defaults model when GEMINI_MODEL is unset', () =>
      modelConfigField('model').pipe(Effect.tap((model) => expect(model).toBe('gemini-live-2.5-flash-native-audio')))
    )

    effectIt.effect('reads model from GEMINI_MODEL env', () => {
      vi.stubEnv('GEMINI_MODEL', 'custom-model')
      return modelConfigField('model').pipe(Effect.tap((model) => expect(model).toBe('custom-model')))
    })

    effectIt.effect('defaults voice when GEMINI_VOICE is unset', () =>
      modelConfigField('voice').pipe(Effect.tap((voice) => expect(voice).toBe('Kore')))
    )

    effectIt.effect('reads voice from GEMINI_VOICE env', () => {
      vi.stubEnv('GEMINI_VOICE', 'Puck')
      return modelConfigField('voice').pipe(Effect.tap((voice) => expect(voice).toBe('Puck')))
    })
  })

  describe('temperature parsing', () => {
    effectIt.effect('defaults to 0.8 when GEMINI_TEMPERATURE is unset', () =>
      modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0.8)))
    )

    effectIt.effect('parses valid temperature', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '1.5')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(1.5)))
    })

    effectIt.effect('defaults for empty string', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0.8)))
    })

    effectIt.effect('defaults for non-numeric string', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', 'abc')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0.8)))
    })

    effectIt.effect('defaults for negative value', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '-0.5')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0.8)))
    })

    effectIt.effect('defaults for value > 2', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '2.5')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0.8)))
    })

    effectIt.effect('accepts boundary value 0', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '0')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(0)))
    })

    effectIt.effect('accepts boundary value 2', () => {
      vi.stubEnv('GEMINI_TEMPERATURE', '2')
      return modelConfigField('temperature').pipe(Effect.tap((t) => expect(t).toBe(2)))
    })
  })

  describe('project and location from env', () => {
    effectIt.effect('reads project from GOOGLE_CLOUD_PROJECT', () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-project')
      return modelConfigField('project').pipe(Effect.tap((p) => expect(p).toBe('my-project')))
    })

    effectIt.effect('defaults project to empty string when unset', () =>
      modelConfigField('project').pipe(Effect.tap((p) => expect(p).toBe('')))
    )

    effectIt.effect('defaults location to us-central1 when unset', () =>
      modelConfigField('location').pipe(Effect.tap((l) => expect(l).toBe('us-central1')))
    )

    effectIt.effect('reads location from GOOGLE_CLOUD_LOCATION', () => {
      vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'europe-west1')
      return modelConfigField('location').pipe(Effect.tap((l) => expect(l).toBe('europe-west1')))
    })
  })

  describe('language and transcription language codes', () => {
    effectIt.effect('defaults language to undefined when GEMINI_LANGUAGE is unset', () =>
      modelConfigField('language').pipe(Effect.tap((value) => expect(value).toBeUndefined()))
    )

    effectIt.effect('reads GEMINI_LANGUAGE', () => {
      vi.stubEnv('GEMINI_LANGUAGE', 'he-IL')
      return modelConfigField('language').pipe(Effect.tap((value) => expect(value).toBe('he-IL')))
    })

    effectIt.effect('defaults transcriptionLanguageCodes to undefined when language is unset', () =>
      modelConfigField('transcriptionLanguageCodes').pipe(Effect.tap((value) => expect(value).toBeUndefined()))
    )

    effectIt.effect('uses GEMINI_LANGUAGE as fallback transcriptionLanguageCodes', () => {
      vi.stubEnv('GEMINI_LANGUAGE', 'he-IL')
      return modelConfigField('transcriptionLanguageCodes').pipe(
        Effect.tap((value) => expect(value).toEqual(['he-IL']))
      )
    })

    effectIt.effect('parses comma-separated GEMINI_TRANSCRIPTION_LANGUAGE_CODES', () => {
      vi.stubEnv('GEMINI_TRANSCRIPTION_LANGUAGE_CODES', 'he-IL, en-US ,fr-FR')
      return modelConfigField('transcriptionLanguageCodes').pipe(
        Effect.tap((value) => expect(value).toEqual(['he-IL', 'en-US', 'fr-FR']))
      )
    })
  })
})

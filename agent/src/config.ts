import { Context, Effect, Layer, Option } from 'effect'
import { ConfigError } from './errors.js'
import { buildGreetingPrompt, buildSystemPrompt } from './prompt.js'

/** Student proficiency levels for language tutoring. */
export const StudentLevel = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
  Advanced: 'advanced'
} as const

export type StudentLevel = (typeof StudentLevel)[keyof typeof StudentLevel]

/** Shape of the ModelConfig service — env-based model parameters. */
export interface ModelConfigShape {
  readonly model: string
  readonly voice: string
  readonly temperature: number
  readonly project: string
  readonly location: string
  readonly language: string | undefined
  readonly transcriptionLanguageCodes: ReadonlyArray<string> | undefined
}

/** Effect Service providing Gemini model parameters from environment variables. */
export class ModelConfig extends Context.Tag('ModelConfig')<ModelConfig, ModelConfigShape>() {}

/** Shape of the TutorConfig service — participant-dependent session parameters. */
export interface TutorConfigShape {
  readonly targetLanguage: string
  readonly nativeLanguage: string | undefined
  readonly studentLevel: StudentLevel
  readonly systemPrompt: string
  readonly greetingPrompt: string
}

/**
 * Effect Service providing session configuration.
 *
 * Built at runtime from participant attributes via {@link makeTutorConfigLive}.
 */
export class TutorConfig extends Context.Tag('TutorConfig')<TutorConfig, TutorConfigShape>() {}

const DEFAULTS = {
  model: 'gemini-live-2.5-flash-native-audio',
  voice: 'Kore',
  temperature: 0.8,
  location: 'us-central1'
} as const

/** Pre-computed set for O(1) level validation. */
const studentLevelValues: ReadonlySet<string> = new Set(Object.values(StudentLevel))

/** Type guard for valid {@link StudentLevel} values. */
const isStudentLevel = (value: string): value is StudentLevel => studentLevelValues.has(value)

/** Parses a raw level string, falling back to {@link StudentLevel.Beginner} with a warning. */
const parseLevel = (raw: string | undefined): Effect.Effect<StudentLevel> =>
  Option.fromNullable(raw).pipe(
    Option.filter(isStudentLevel),
    Option.match({
      onNone: () =>
        Effect.logWarning(`Unknown student level "${raw}", defaulting to "${StudentLevel.Beginner}"`).pipe(
          Effect.as(StudentLevel.Beginner)
        ),
      onSome: Effect.succeed
    })
  )

/** Reads an env variable, treating empty strings as missing. */
const envOrDefault = (key: string, fallback: string): string =>
  Option.fromNullable(process.env[key]).pipe(
    Option.filter((s) => s !== ''),
    Option.getOrElse(() => fallback)
  )

/**
 * Parses a temperature string from env, falling back to {@link DEFAULTS.temperature}.
 * Returns the default if the value is missing, empty, not a number, or out of range [0, 2].
 */
const parseTemperature = (raw: string | undefined): number =>
  Option.fromNullable(raw).pipe(
    Option.filter((s) => s !== ''),
    Option.map(Number),
    Option.filter((n) => !Number.isNaN(n) && n >= 0 && n <= 2),
    Option.getOrElse(() => DEFAULTS.temperature)
  )

/** Parses an optional BCP-47 language code from env. */
const parseLanguage = (raw: string | undefined): string | undefined =>
  Option.fromNullable(raw).pipe(
    Option.map((s) => s.trim()),
    Option.filter((s) => s !== ''),
    Option.getOrUndefined
  )

/**
 * Parses comma-separated BCP-47 language codes from env.
 * Falls back to `[language]` when explicit codes are not provided.
 */
const parseTranscriptionLanguageCodes = (
  raw: string | undefined,
  language: string | undefined
): ReadonlyArray<string> | undefined => {
  const parsed = Option.fromNullable(raw).pipe(
    Option.map((value) =>
      value
        .split(',')
        .map((code) => code.trim())
        .filter((code) => code !== '')
    ),
    Option.filter((codes) => codes.length > 0),
    Option.getOrUndefined
  )

  return parsed ?? (language ? [language] : undefined)
}

/**
 * Extracts target language from attributes or fails with ConfigError.
 */
const extractLanguage = (attributes: Record<string, string>) =>
  Option.fromNullable(attributes['lesson.language']).pipe(
    Option.filter((s) => s !== ''),
    Option.match({
      onNone: () =>
        Effect.fail(
          new ConfigError({
            message: 'Missing required attribute: lesson.language',
            field: 'lesson.language'
          })
        ),
      onSome: Effect.succeed
    })
  )

/**
 * Live Layer for {@link ModelConfig}.
 *
 * Reads Gemini model parameters from environment variables.
 * Uses {@link Effect.sync} to defer env access to layer evaluation time.
 */
export const ModelConfigLive: Layer.Layer<ModelConfig> = Layer.effect(
  ModelConfig,
  Effect.sync(() => {
    const language = parseLanguage(process.env.GEMINI_LANGUAGE)
    return {
      model: envOrDefault('GEMINI_MODEL', DEFAULTS.model),
      voice: envOrDefault('GEMINI_VOICE', DEFAULTS.voice),
      temperature: parseTemperature(process.env.GEMINI_TEMPERATURE),
      project: process.env.GOOGLE_CLOUD_PROJECT ?? '',
      location: envOrDefault('GOOGLE_CLOUD_LOCATION', DEFAULTS.location),
      language,
      transcriptionLanguageCodes: parseTranscriptionLanguageCodes(
        process.env.GEMINI_TRANSCRIPTION_LANGUAGE_CODES,
        language
      )
    }
  })
)

/**
 * Creates a {@link TutorConfig} Layer from participant attributes.
 *
 * @param attributes - Key-value map from `participant.attributes`.
 *   Required: `lesson.language`. Optional: `lesson.level`.
 * @returns Layer that provides TutorConfig or fails with {@link ConfigError}.
 */
export const makeTutorConfigLive = (attributes: Record<string, string>): Layer.Layer<TutorConfig, ConfigError> =>
  Layer.effect(
    TutorConfig,
    Effect.all({
      targetLanguage: extractLanguage(attributes),
      studentLevel: parseLevel(attributes['lesson.level'])
    }).pipe(
      Effect.map(({ targetLanguage, studentLevel }) => {
        const nativeLanguage = attributes['lesson.nativeLanguage'] || undefined
        return {
          targetLanguage,
          nativeLanguage,
          studentLevel,
          systemPrompt: buildSystemPrompt(targetLanguage, studentLevel, nativeLanguage),
          greetingPrompt: buildGreetingPrompt(targetLanguage, studentLevel)
        }
      })
    )
  )

import { Data } from 'effect'

/** Invalid or missing participant attributes. */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string
  readonly field?: string
}> {}

/** Gemini RealtimeModel creation or connection failure. */
export class GeminiConnectionError extends Data.TaggedError('GeminiConnectionError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/** AgentSession.start() or generateReply() failure. */
export class SessionStartError extends Data.TaggedError('SessionStartError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/** waitForParticipant() failure. */
export class ParticipantError extends Data.TaggedError('ParticipantError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/** ctx.connect() failure (LiveKit room connection). */
export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/** An async operation exceeded its time limit. */
export class TimeoutError extends Data.TaggedError('TimeoutError')<{
  readonly message: string
  readonly operation: string
}> {}

/** All typed errors the agent pipeline can produce. */
export type AgentError =
  | ConfigError
  | GeminiConnectionError
  | SessionStartError
  | ParticipantError
  | ConnectionError
  | TimeoutError

/** Errors caused by transient conditions (network, API availability). */
export type TransientError =
  | GeminiConnectionError
  | SessionStartError
  | ParticipantError
  | ConnectionError
  | TimeoutError

/** Type guard: true for errors worth retrying. */
export const isRetriable = (error: AgentError): error is TransientError => error._tag !== 'ConfigError'

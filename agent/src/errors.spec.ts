import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  ConnectionError,
  GeminiConnectionError,
  isRetriable,
  ParticipantError,
  SessionStartError,
  TimeoutError
} from './errors.js'

describe('error constructors', () => {
  it('ConfigError has correct _tag and fields', () => {
    const error = new ConfigError({ message: 'bad config', field: 'lesson.language' })
    expect(error._tag).toBe('ConfigError')
    expect(error.message).toBe('bad config')
    expect(error.field).toBe('lesson.language')
  })

  it('GeminiConnectionError preserves cause', () => {
    const cause = new Error('network')
    const error = new GeminiConnectionError({ message: 'failed', cause })
    expect(error._tag).toBe('GeminiConnectionError')
    expect(error.cause).toBe(cause)
  })

  it('SessionStartError has correct _tag', () => {
    expect(new SessionStartError({ message: 'x' })._tag).toBe('SessionStartError')
  })

  it('ParticipantError has correct _tag', () => {
    expect(new ParticipantError({ message: 'x' })._tag).toBe('ParticipantError')
  })

  it('ConnectionError has correct _tag', () => {
    expect(new ConnectionError({ message: 'x' })._tag).toBe('ConnectionError')
  })

  it('TimeoutError has correct _tag and operation', () => {
    const error = new TimeoutError({ message: 'timed out', operation: 'connect' })
    expect(error._tag).toBe('TimeoutError')
    expect(error.operation).toBe('connect')
  })
})

describe('isRetriable', () => {
  it('returns false for ConfigError', () => {
    expect(isRetriable(new ConfigError({ message: 'x' }))).toBe(false)
  })

  it.each([
    { name: 'GeminiConnectionError', error: new GeminiConnectionError({ message: 'x' }) },
    { name: 'SessionStartError', error: new SessionStartError({ message: 'x' }) },
    { name: 'ParticipantError', error: new ParticipantError({ message: 'x' }) },
    { name: 'ConnectionError', error: new ConnectionError({ message: 'x' }) },
    { name: 'TimeoutError', error: new TimeoutError({ message: 'x', operation: 'op' }) }
  ])('returns true for $name', ({ error }) => {
    expect(isRetriable(error)).toBe(true)
  })
})

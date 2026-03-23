import { describe, expect, it } from 'vitest'
import { buildGreetingPrompt, buildSystemPrompt } from './prompt.js'

describe('buildSystemPrompt', () => {
  it('includes the target language', () => {
    const result = buildSystemPrompt('Korean', 'beginner', undefined)
    expect(result).toContain('Korean')
  })

  it('includes beginner guidance for beginner level', () => {
    const result = buildSystemPrompt('French', 'beginner', undefined)
    expect(result).toContain('short, simple sentences')
    expect(result).toContain('1-2 sentences per turn')
  })

  it('includes intermediate guidance for intermediate level', () => {
    const result = buildSystemPrompt('French', 'intermediate', undefined)
    expect(result).toContain('Varied sentence structures')
    expect(result).toContain('2-3 sentences per turn')
  })

  it('includes advanced guidance for advanced level', () => {
    const result = buildSystemPrompt('French', 'advanced', undefined)
    expect(result).toContain('idioms, slang, complex structures')
  })

  it('appends native language clause when nativeLanguage is provided', () => {
    const result = buildSystemPrompt('French', 'beginner', 'Russian')
    expect(result).toContain('native language is Russian')
  })

  it('omits native language clause when nativeLanguage is undefined', () => {
    const result = buildSystemPrompt('French', 'beginner', undefined)
    expect(result).not.toContain('native language')
  })

  it('includes feedback tool instruction', () => {
    const result = buildSystemPrompt('French', 'beginner', undefined)
    expect(result).toContain('provide_feedback')
  })

  it('returns a multi-line string', () => {
    const result = buildSystemPrompt('French', 'beginner', undefined)
    expect(result).toContain('\n')
  })
})

describe('buildGreetingPrompt', () => {
  it('includes the target language', () => {
    expect(buildGreetingPrompt('Spanish', 'beginner')).toContain('Spanish')
  })

  it('uses "one short sentence" for beginner level', () => {
    expect(buildGreetingPrompt('Spanish', 'beginner')).toContain('one short sentence')
  })

  it('uses "1-2 sentences" for intermediate level', () => {
    expect(buildGreetingPrompt('Spanish', 'intermediate')).toContain('1-2 sentences')
  })

  it('uses "1-2 sentences" for advanced level', () => {
    expect(buildGreetingPrompt('Spanish', 'advanced')).toContain('1-2 sentences')
  })
})

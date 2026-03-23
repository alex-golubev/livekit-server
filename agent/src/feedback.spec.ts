import { describe, expect, it } from 'vitest'
import { feedbackTools } from './feedback.js'

describe('feedbackTools', () => {
  it('exports a provide_feedback function tool', () => {
    expect(feedbackTools).toHaveProperty('provide_feedback')
    expect(feedbackTools.provide_feedback.type).toBe('function')
  })

  it('has a description', () => {
    expect(feedbackTools.provide_feedback.description).toBeTruthy()
  })

  it('execute returns acknowledged', async () => {
    const result = await feedbackTools.provide_feedback.execute(
      { grammar: 4, vocabulary: 3, fluency: 4, feedback: 'Bon travail!' } as never,
      { ctx: {} as never, toolCallId: 'test-call-id' }
    )

    expect(result).toBe('')
  })
})

import { llm } from '@livekit/agents'
import { JSONSchema, Schema } from 'effect'

/** Score from 1 (poor) to 5 (excellent). */
const Score = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(5))

/** Structured feedback parameters for speech evaluation. */
export const FeedbackParams = Schema.Struct({
  grammar: Score.annotations({ description: 'Grammar accuracy score from 1 (many errors) to 5 (no errors)' }),
  vocabulary: Score.annotations({
    description: 'Vocabulary range and appropriateness for the student level, from 1 (poor) to 5 (excellent)'
  }),
  fluency: Score.annotations({ description: 'Speech fluency and natural flow, from 1 (poor) to 5 (excellent)' }),
  feedback: Schema.String.annotations({
    description: "Brief constructive note about this utterance (1-2 sentences, in the student's target language)"
  }),
  correction: Schema.optional(
    Schema.String.annotations({
      description: 'If there was a grammar or vocabulary mistake, the corrected form. Omit if no correction needed.'
    })
  )
})

/** JSON Schema derived from FeedbackParams for the LiveKit tool registration. */
const feedbackJsonSchema = JSONSchema.make(FeedbackParams)

/** Feedback tool for silent speech evaluation via Gemini function calling. */
const provideFeedback = llm.tool({
  description:
    "Silently evaluate the student's most recent speech. " +
    'Call this after each student response to track their progress. ' +
    'Do NOT mention the evaluation to the student.',
  parameters: feedbackJsonSchema,
  execute: async () => {
    return ''
  }
})

/** Tool context for the voice agent session. */
export const feedbackTools: llm.ToolContext = {
  provide_feedback: provideFeedback
}

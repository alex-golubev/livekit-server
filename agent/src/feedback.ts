import { llm } from '@livekit/agents'
import { Context, Effect, JSONSchema, Runtime, Schema } from 'effect'

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

/**
 * Effect Service for publishing feedback data to a consumer (e.g. client via data channel).
 *
 * Decouples the feedback tool from the transport mechanism — the tool calls
 * {@link publish}, and the concrete implementation decides how to deliver.
 */
export class FeedbackSink extends Context.Tag('FeedbackSink')<
  FeedbackSink,
  { readonly publish: (data: typeof FeedbackParams.Type) => Effect.Effect<void> }
>() {}

/** Creates feedback tools wired to a {@link FeedbackSink} via the provided runtime. */
export const makeFeedbackTools = (rt: Runtime.Runtime<FeedbackSink>): llm.ToolContext => ({
  provide_feedback: llm.tool({
    description:
      "Silently evaluate the student's most recent speech. " +
      'Call this after each student response to track their progress. ' +
      'Do NOT mention the evaluation to the student.',
    parameters: feedbackJsonSchema,
    execute: (params) =>
      Runtime.runPromise(rt)(
        Schema.decodeUnknown(FeedbackParams)(params).pipe(
          Effect.flatMap((data) => FeedbackSink.pipe(Effect.flatMap((sink) => sink.publish(data)))),
          Effect.asVoid
        )
      )
  })
})

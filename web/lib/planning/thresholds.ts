// Tunable constants for the Planning Hub (spec 038). Kept separate from the pure
// engine so the thresholds are easy to find and adjust without touching the math.

export const PLANNING = {
  /** Max categories shown in the at-risk budget list (a summary, not a dump). */
  topN: 4,
  /** spent/limit ≥ elapsedFraction × attentionRatio ⇒ "attention" (ahead of pace). */
  attentionRatio: 1.0,
} as const

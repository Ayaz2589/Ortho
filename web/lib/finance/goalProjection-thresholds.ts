/**
 * Numeric cutoffs for the savings/debt projection engine (`goalProjection.ts`),
 * named in one place — the `INSIGHT_THRESHOLDS` / `GOAL_THRESHOLDS` idiom. Tuning
 * a rule means editing one labelled field here, not a bare number mid-function.
 *
 * Deliberately separate from `goals-thresholds.ts`: that file tunes the vectored
 * target-date pacing model, this one tunes the contribution-driven projection.
 * The two models coexist on purpose (spec 059 research R1) and must not be merged
 * by anyone tidying up later — `goals.ts` is pinned by shared/test-vectors/goals.json.
 */
export const GOAL_PROJECTION_THRESHOLDS = {
  /** A month counts as "on plan" when its total is within this fraction of the
   *  cadence amount. Floored at 1 cent in the engine so a cadence small enough
   *  that 2% rounds to zero doesn't make every month off-plan by rounding alone. */
  onPlanTolerance: 0.02,
  /** Below this many contributions the engine refuses to project at all. A finish
   *  date extrapolated from one payment is a guess wearing a date's clothes. */
  minContributionsToProject: 3,
  /** How many recent contributions the fallback pace averages, once a goal is no
   *  longer paying its cadence exactly. */
  recentAverageWindow: 3,
  /** The what-if table's "pay more" rows, as fractions above the current pace.
   *  +25% and +67% — chosen so the rounded figures read as round numbers
   *  ($600 → $750 and $1,000), which is what makes them feel like real levers. */
  increaseSteps: [0.25, 0.67],
  /** What-if amounts are rounded to this many cents ($50) so the table offers
   *  "pay $750/mo", never "pay $751.34/mo". */
  cleanAmountStepCents: 5_000,
} as const

/**
 * Numeric cutoffs for the savings-goal engine (`goals.ts`), named in one place —
 * the `INSIGHT_THRESHOLDS` idiom from spec 025. Tuning the off-track rule means
 * editing one labelled field here, not a bare number mid-function.
 */
export const GOAL_THRESHOLDS = {
  /** Off-track rule: a dated, unreached goal is flagged only once it is behind
   *  the steady-pace expectation by at least this fraction of the target — a
   *  grace band so a goal only marginally behind is not nagged. (A goal already
   *  past its target date and unreached is always off-track, tolerance aside.) */
  offTrackToleranceFraction: 0.05,
  /** Days-per-month used to size the suggested monthly contribution. */
  daysPerMonth: 30,
} as const

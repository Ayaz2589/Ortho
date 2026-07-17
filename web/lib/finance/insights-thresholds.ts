/**
 * Every numeric cutoff the insight rules (`insights.ts`) use, named in one place.
 *
 * Extracted verbatim from the inline literals in `insights.ts` (spec 025) — the
 * values are unchanged, so `insights.json` (and thus observable behavior) is
 * identical; this is a readability/testability refactor only. Tuning a rule now
 * means editing one labelled field here instead of hunting a bare number
 * mid-function. Each field notes the rule it belongs to.
 */
export const INSIGHT_THRESHOLDS = {
  // Rule 2 — month-over-month category delta.
  /** A category must exceed this in BOTH months to be compared (avoids noise on tiny categories). */
  momMinCents: 2000,
  /** Minimum relative change (|Δ|) to surface a month-over-month insight. */
  momDeltaFloor: 0.25,

  // Rule 3 — budget status.
  /** spent ÷ limit at or above this ⇒ "over budget" (critical). */
  budgetOverFraction: 1.0,
  /** …at or above this (but under over) ⇒ "approaching limit" (warning). */
  budgetNearFraction: 0.85,
  /** …at or below this ⇒ eligible for "under budget" (positive)… */
  budgetUnderFraction: 0.5,
  /** …but only once the month is at least this far elapsed. */
  budgetUnderProgress: 0.7,

  // Rule 4 — cashflow / savings rate.
  /** net ÷ income at or above this ⇒ "saving X%" (positive). */
  savingsRateFloor: 0.2,

  // Rule 5 — recurring subscription detection.
  /** Trailing window (months) scanned for recurring charges. */
  recurringWindowMonths: 6,
  /** Minimum charges from one merchant to be considered recurring. */
  recurringMinCount: 3,
  /** Inter-charge gap (days) counted as a monthly cadence: [min, max]. */
  recurringCadenceMinDays: 28,
  recurringCadenceMaxDays: 35,
  /** Fraction of gaps that must fall in the cadence band. */
  recurringHitRatio: 0.8,

  // Rule 6 — outlier transaction.
  /** A category needs at least this many trailing txs to have a usable median. */
  outlierMedianMinCount: 5,
  /** A charge at or above this multiple of the category median is an outlier. */
  outlierMultiple: 2.0,
  /** An outlier at or above this amount is a warning (else info). */
  outlierWarnCents: 50_000,

  // Rule 7 — 30-day spend trend.
  /** Length (days) of the recent window; the prior window is the same length before it. */
  trendWindowDays: 30,
  /** The prior window must total at least this for a trend to be meaningful. */
  trendMinPriorCents: 10_000,
  /** Minimum relative change (|Δ|) between the two windows to report. */
  trendDeltaFloor: 0.2,

  // Rule 8 — mortgage affordability (payment ÷ monthly income).
  /** Below this ratio ⇒ comfortable (positive). */
  mortgageComfortableRatio: 0.28,
  /** At or below this ⇒ info; above ⇒ "high" (warning). */
  mortgageHighRatio: 0.35,
} as const

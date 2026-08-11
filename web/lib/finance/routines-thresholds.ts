// Financial Routines detection constants (spec 044). Isolated so calibration is a data edit, not a
// logic change — mirrors insights-thresholds.ts / financial-health-thresholds.ts. Tuning precedent:
// insights.ts's existing "Rule 5: Recurring subscriptions" (research.md §4) — same statistical
// shape, generalized into a richer, persistently-trackable engine (routines.ts).
// See specs/044-financial-routines/contracts/routines-engine.md.

export const ROUTINE_THRESHOLDS = {
  // --- recurring_charge (FR-001/FR-002) ---
  /** Trailing window (months) scanned for recurring-charge candidates. */
  recurringWindowMonths: 6,
  /** Minimum occurrences from one merchant to be considered a candidate. */
  recurringMinCount: 3,
  /** Amount must stay within ±this fraction of the median for most occurrences. */
  recurringAmountTolerance: 0.08,
  /** Cadence gap-days band (wider than insights.ts's 28-35 to tolerate short-month/weekend drift). */
  recurringCadenceMinDays: 21,
  recurringCadenceMaxDays: 40,
  /** Fraction of occurrences/gaps that must satisfy the amount/cadence bands. */
  recurringHitRatio: 0.75,
  /** Missed expected cycles before a recurring_charge routine reads as lapsed. */
  lapseAfterMissedCycles: 2,

  // --- behavioral_habit (FR-003) ---
  /** Trailing window (weeks) scanned for behavioral-habit candidates. */
  behavioralWindowWeeks: 8,
  /** Minimum occurrences to be considered a candidate. */
  behavioralMinCount: 4,
  /** Reserved for a future real-time-capture enhancement — unused today, since no transaction
   *  source carries a genuine time-of-day (research.md §6b); hourBucket is always null. */
  behavioralHourBucketSizeHours: 2,
  /** Fraction of eligible weeks in the window that must contain a matching occurrence. */
  behavioralHitRatio: 0.6,
  /** Days since the last matching occurrence before a behavioral_habit reads as lapsed. */
  behavioralLapseAfterDays: 14,

  // --- normalizeMerchantKey ---
  /** Trailing POS/store-location numeric suffix length range treated as a store code, not part of
   *  the brand name (so "7 Eleven"'s leading "7" is untouched, but "Dunkin #4521" is stripped). */
  merchantStoreCodeMinDigits: 3,
  merchantStoreCodeMaxDigits: 6,
} as const

import { describe, expect, it } from 'vitest'
import { INSIGHT_THRESHOLDS as T } from '@/lib/finance/insights-thresholds'

// spec 025 — US3: every numeric cutoff the insight rules use is named and
// centralized. These values MUST equal the literals previously inlined in
// insights.ts, so the refactor is behavior-preserving (insights.json unchanged).
// Written test-first.

describe('INSIGHT_THRESHOLDS pins every insight cutoff to its current value', () => {
  it('rule 2 — month-over-month category delta', () => {
    expect(T.momMinCents).toBe(2000) // $20 floor in both months
    expect(T.momDeltaFloor).toBe(0.25) // ≥ 25% change to report
  })
  it('rule 3 — budget status fractions', () => {
    expect(T.budgetOverFraction).toBe(1.0)
    expect(T.budgetNearFraction).toBe(0.85)
    expect(T.budgetUnderFraction).toBe(0.5)
    expect(T.budgetUnderProgress).toBe(0.7) // month must be this far elapsed
  })
  it('rule 4 — savings rate', () => {
    expect(T.savingsRateFloor).toBe(0.2)
  })
  it('rule 5 — recurring subscription detection', () => {
    expect(T.recurringWindowMonths).toBe(6)
    expect(T.recurringMinCount).toBe(3)
    expect(T.recurringCadenceMinDays).toBe(28)
    expect(T.recurringCadenceMaxDays).toBe(35)
    expect(T.recurringHitRatio).toBe(0.8)
  })
  it('rule 6 — outlier transaction', () => {
    expect(T.outlierMedianMinCount).toBe(5)
    expect(T.outlierMultiple).toBe(2.0)
    expect(T.outlierWarnCents).toBe(50_000) // ≥ $500 → warning
  })
  it('rule 7 — 30-day spend trend', () => {
    expect(T.trendWindowDays).toBe(30)
    expect(T.trendMinPriorCents).toBe(10_000) // $100 floor on the prior window
    expect(T.trendDeltaFloor).toBe(0.2)
  })
  it('rule 8 — mortgage affordability ratios', () => {
    expect(T.mortgageComfortableRatio).toBe(0.28)
    expect(T.mortgageHighRatio).toBe(0.35)
  })
})

import { describe, it, expect } from 'vitest'
import { computeSpendingPace, budgetPaceCents } from '@/lib/finance/spendingPace'
import type { Transaction } from '@/lib/types'

// Spec 057 US4 redesign: the spending-pace panel replaces its trailing-30-vs-
// prior-30 model with a period-relative one — "period" is the active scope's own
// interval, "last period" the immediately preceding window of equal length.

let seq = 0
function expense(category: string, dateIso: string, cents: number): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: `Merchant ${seq}`,
    category: category as Transaction['category'],
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date: dateIso,
    created_by: 'u',
    created_at: dateIso,
    updated_at: dateIso,
    owner_ids: [],
    shares: {},
  }
}

// August 2026 has 31 days; today is Aug 23 (day 23 of 31 — mirrors the design brief's sample).
const AUGUST = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }
const TODAY = new Date(2026, 7, 23, 12)

describe('computeSpendingPace', () => {
  it('computes days-in-period and days-elapsed from the scope interval', () => {
    const s = computeSpendingPace([], AUGUST, TODAY)
    expect(s.daysInPeriod).toBe(31)
    expect(s.daysElapsed).toBe(23)
  })

  it('sums month-to-date spend and derives the linear projection', () => {
    const txns = [
      expense('groceries', '2026-08-01T12:00:00.000Z', 20000),
      expense('dining', '2026-08-10T12:00:00.000Z', 30000),
      expense('coffee', '2026-08-20T12:00:00.000Z', 10000),
    ]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.mtdCents).toBe(60000)
    expect(s.avgPerDayCents).toBeCloseTo(60000 / 23)
    expect(s.projectedCents).toBe(Math.round((60000 / 23) * 31))
  })

  it('excludes spend after the anchor day (future dates within the period)', () => {
    const txns = [
      expense('groceries', '2026-08-01T12:00:00.000Z', 20000),
      expense('dining', '2026-08-30T12:00:00.000Z', 99999), // after today (Aug 23)
    ]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.mtdCents).toBe(20000)
  })

  it('compares against the immediately preceding period of equal length', () => {
    const txns = [
      // Prior period (July, 31 days before Aug 1): total 31000
      expense('rent', '2026-07-15T12:00:00.000Z', 31000),
      // Current period (23 days elapsed): total 23000 -> same per-day rate as prior
      expense('rent', '2026-08-05T12:00:00.000Z', 23000),
    ]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.priorTotalCents).toBe(31000)
    expect(s.hasPriorPeriod).toBe(true)
    // prior avg/day = 31000/31 = 1000; current avg/day = 23000/23 = 1000 -> unchanged pace
    expect(s.deltaPct).toBeCloseTo(0, 5)
    // prior rate at the same day position (day 23): 1000 * 23 = 23000
    expect(s.priorRateAtTodayCents).toBe(23000)
  })

  it('reports faster/slower pace correctly via deltaPct sign', () => {
    const faster = computeSpendingPace(
      [expense('rent', '2026-07-15T12:00:00.000Z', 31000), expense('rent', '2026-08-05T12:00:00.000Z', 46000)],
      AUGUST,
      TODAY
    )
    // current avg/day = 46000/23 = 2000; prior avg/day = 1000 -> +100%
    expect(faster.deltaPct).toBeCloseTo(1, 5)

    const slower = computeSpendingPace(
      [expense('rent', '2026-07-15T12:00:00.000Z', 31000), expense('rent', '2026-08-05T12:00:00.000Z', 11500)],
      AUGUST,
      TODAY
    )
    // current avg/day = 11500/23 = 500; prior avg/day = 1000 -> -50%
    expect(slower.deltaPct).toBeCloseTo(-0.5, 5)
  })

  it('has no prior period when there is no spend before the period start', () => {
    const txns = [expense('groceries', '2026-08-05T12:00:00.000Z', 20000)]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.hasPriorPeriod).toBe(false)
    expect(s.deltaPct).toBeNull()
  })

  it('ranks categories by current-period amount and carries the delta vs the prior period', () => {
    const txns = [
      expense('groceries', '2026-07-05T12:00:00.000Z', 20000),
      expense('groceries', '2026-08-05T12:00:00.000Z', 50000),
      expense('dining', '2026-08-10T12:00:00.000Z', 70000),
      // Coffee only in the prior period -> zero current spend -> excluded from "where it's going".
      expense('coffee', '2026-07-08T12:00:00.000Z', 5000),
    ]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.categoryRows.map((r) => r.category)).toEqual(['dining', 'groceries'])
    expect(s.categoryRows[0]).toEqual({ category: 'dining', cents: 70000, deltaCents: 70000 })
    expect(s.categoryRows[1]).toEqual({ category: 'groceries', cents: 50000, deltaCents: 30000 })
  })

  it('produces a current cumulative series bounded to days elapsed, and a full-length prior series', () => {
    const txns = [
      expense('groceries', '2026-08-01T12:00:00.000Z', 10000),
      expense('groceries', '2026-08-02T12:00:00.000Z', 10000),
    ]
    const s = computeSpendingPace(txns, AUGUST, TODAY)
    expect(s.cumulative.length).toBe(23)
    expect(s.cumulative[0]).toBe(10000)
    expect(s.cumulative[1]).toBe(20000)
    expect(s.cumulative[s.cumulative.length - 1]).toBe(20000)
    expect(s.priorCumulative.length).toBe(31)
  })

  it('treats a fully-elapsed past period (now is after period end) as complete', () => {
    const JULY = { start: new Date(2026, 6, 1), end: new Date(2026, 7, 1) }
    const s = computeSpendingPace([expense('rent', '2026-07-15T12:00:00.000Z', 10000)], JULY, TODAY)
    expect(s.daysInPeriod).toBe(31)
    expect(s.daysElapsed).toBe(31)
    expect(s.mtdCents).toBe(10000)
  })
})

describe('budgetPaceCents', () => {
  it('prorates a total budget to the elapsed share of the period', () => {
    expect(budgetPaceCents(31000, 23, 31)).toBe(Math.round((31000 * 23) / 31))
  })

  it('returns 0 for a zero-length period', () => {
    expect(budgetPaceCents(1000, 0, 0)).toBe(0)
  })
})

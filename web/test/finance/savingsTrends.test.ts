import { describe, it, expect } from 'vitest'
import { computeSavingsTrends, shiftMonthKey } from '@/lib/finance/savingsTrends'
import type { Transaction } from '@/lib/types'

// Spec 057 US5 redesign: the savings-trends panel replaces its unbounded
// per-month block list with verdict → chart → three bounded reconciled cards.
// This engine buckets scoped transactions into calendar months across an
// interval and summarizes the window — reused for both the panel's own scope
// window and a synthetic trailing window built for the single-month "in
// context" view, so one function serves both call sites.

let seq = 0
function tx(kind: Transaction['kind'], dateIso: string, cents: number): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: `Merchant ${seq}`,
    category: 'groceries',
    kind,
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

const JAN_MAR = { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }

describe('computeSavingsTrends', () => {
  it('buckets each month to its income, expense and saved amount', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-01-10T12:00:00.000Z', 40000),
        tx('income', '2026-02-05T12:00:00.000Z', 100000),
        tx('expense', '2026-02-10T12:00:00.000Z', 90000),
        tx('income', '2026-03-05T12:00:00.000Z', 100000),
        tx('expense', '2026-03-10T12:00:00.000Z', 20000),
      ],
      JAN_MAR
    )

    expect(s.months.map((m) => m.yyyymm)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(s.months[0]).toMatchObject({ incomeCents: 100000, expenseCents: 40000, savedCents: 60000 })
    expect(s.months[1]).toMatchObject({ incomeCents: 100000, expenseCents: 90000, savedCents: 10000 })
    expect(s.months[2]).toMatchObject({ incomeCents: 100000, expenseCents: 20000, savedCents: 80000 })
  })

  it('sums the window totals and derives the window rate', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-01-10T12:00:00.000Z', 40000),
        tx('income', '2026-02-05T12:00:00.000Z', 100000),
        tx('expense', '2026-02-10T12:00:00.000Z', 90000),
      ],
      { start: new Date(2026, 0, 1), end: new Date(2026, 2, 1) }
    )

    expect(s.windowIncomeCents).toBe(200000)
    expect(s.windowExpenseCents).toBe(130000)
    expect(s.windowSavedCents).toBe(70000)
    expect(s.windowRate).toBeCloseTo(0.35)
  })

  it('identifies the best and leanest months in a multi-month window', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-01-10T12:00:00.000Z', 50000), // 50% — middle
        tx('income', '2026-02-05T12:00:00.000Z', 100000),
        tx('expense', '2026-02-10T12:00:00.000Z', 90000), // 10% — leanest
        tx('income', '2026-03-05T12:00:00.000Z', 100000),
        tx('expense', '2026-03-10T12:00:00.000Z', 20000), // 80% — best
      ],
      JAN_MAR
    )

    expect(s.bestKey).toBe('2026-03')
    expect(s.leanestKey).toBe('2026-02')
  })

  it('declares no best/leanest for a single-month window', () => {
    const s = computeSavingsTrends(
      [tx('income', '2026-01-05T12:00:00.000Z', 100000), tx('expense', '2026-01-10T12:00:00.000Z', 30000)],
      { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }
    )

    expect(s.bestKey).toBeNull()
    expect(s.leanestKey).toBeNull()
  })

  it('declares no best/leanest when every month ties', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-01-10T12:00:00.000Z', 50000),
        tx('income', '2026-02-05T12:00:00.000Z', 100000),
        tx('expense', '2026-02-10T12:00:00.000Z', 50000),
      ],
      { start: new Date(2026, 0, 1), end: new Date(2026, 2, 1) }
    )

    expect(s.bestKey).toBeNull()
    expect(s.leanestKey).toBeNull()
  })

  it('gives a month with no income a null rate, excluded from best/leanest', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-01-10T12:00:00.000Z', 50000),
        // February: expense only, no income — rate is undefined, not 0 or -Infinity.
        tx('expense', '2026-02-10T12:00:00.000Z', 20000),
        tx('income', '2026-03-05T12:00:00.000Z', 100000),
        tx('expense', '2026-03-10T12:00:00.000Z', 30000),
      ],
      JAN_MAR
    )

    expect(s.months[1].rate).toBeNull()
    expect(s.bestKey).toBe('2026-03')
    expect(s.leanestKey).toBe('2026-01')
  })

  it('returns a null window rate when the window has no income at all', () => {
    const s = computeSavingsTrends(
      [tx('expense', '2026-01-10T12:00:00.000Z', 20000)],
      { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }
    )
    expect(s.windowRate).toBeNull()
    expect(s.windowExpenseCents).toBe(20000)
  })

  it('ignores transactions outside the interval', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2025-12-31T12:00:00.000Z', 500000),
        tx('income', '2026-01-05T12:00:00.000Z', 100000),
        tx('expense', '2026-04-01T12:00:00.000Z', 900000),
      ],
      { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }
    )
    expect(s.windowIncomeCents).toBe(100000)
    expect(s.windowExpenseCents).toBe(0)
  })

  it('reads a shortfall month through its sign, not a special value', () => {
    const s = computeSavingsTrends(
      [tx('income', '2026-01-05T12:00:00.000Z', 30000), tx('expense', '2026-01-10T12:00:00.000Z', 50000)],
      { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }
    )
    expect(s.months[0].savedCents).toBe(-20000)
    expect(s.months[0].rate).toBeCloseTo(-2 / 3)
  })
})

describe('shiftMonthKey', () => {
  it('shifts within a year', () => {
    expect(shiftMonthKey('2026-08', -1)).toBe('2026-07')
    expect(shiftMonthKey('2026-08', 1)).toBe('2026-09')
  })

  it('rolls over a year boundary in both directions', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
  })

  it('walks back several months across a year boundary', () => {
    expect(shiftMonthKey('2026-02', -5)).toBe('2025-09')
  })

  it('is a no-op at delta 0', () => {
    expect(shiftMonthKey('2026-08', 0)).toBe('2026-08')
  })
})

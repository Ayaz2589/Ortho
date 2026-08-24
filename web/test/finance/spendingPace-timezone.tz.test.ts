import { describe, it, expect } from 'vitest'
import { computeSpendingPace } from '@/lib/finance/spendingPace'
import { monthBoundsInterval } from '@/lib/useDashboardRange'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24, major B1 — spending-pace under a selected month in a
// negative-UTC timezone. Runs under vitest.tz.config.ts (TZ=America/New_York).
//
// THE BUG (pre-fix): a selected month's interval comes from monthBounds — UTC
// instants ('2026-08-01T00:00:00.000Z') — but computeSpendingPace floored both
// bounds AND transaction dates with LOCAL startOfDay. In New York that turned
// a selected August into [Jul 31, Aug 31) local: a Jul 31 transaction was
// counted inside August, an Aug 31 transaction silently dropped, and
// daysElapsed ran one high.
//
// THE FIX: the engine takes the interval instants as-is and derives the day
// grid by flooring the millisecond offset from the period start; noon-UTC
// rows land exactly, and date-only (legacy import) rows go through the
// spec-027 A2 parseLocalDate guard.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0
function expense(date: string, cents: number): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: 'M',
    category: 'groceries',
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date,
    created_by: 'u',
    created_at: date,
    updated_at: date,
    owner_ids: [],
    shares: {},
    tags: [],
    notes: null,
  }
}

describe('computeSpendingPace with a UTC month-bounds interval (TZ=America/New_York)', () => {
  const august = monthBoundsInterval('2026-08')
  const nowAug24 = new Date(2026, 7, 24, 14, 0) // local Aug 24, 2pm

  it('keeps the selected month aligned: Aug 31 counted, Jul 31 excluded', () => {
    const txs = [
      expense('2026-07-31T12:00:00.000Z', 7_00),
      expense('2026-08-01T12:00:00.000Z', 10_00),
      expense('2026-08-31T12:00:00.000Z', 5_00),
    ]
    const past = computeSpendingPace(txs, august, new Date(2026, 9, 15))
    expect(past.daysInPeriod).toBe(31)
    // A fully past month: all elapsed, and the month total holds exactly the
    // August rows — the Jul 31 row stays in the PRIOR period.
    expect(past.daysElapsed).toBe(31)
    expect(past.mtdCents).toBe(15_00)
    expect(past.priorTotalCents).toBe(7_00)
  })

  it('anchors daysElapsed to the local day inside the month', () => {
    const s = computeSpendingPace([expense('2026-08-01T12:00:00.000Z', 10_00)], august, nowAug24)
    expect(s.daysElapsed).toBe(24)
  })

  it('buckets first/last-day rows into the correct day indices', () => {
    const s = computeSpendingPace(
      [expense('2026-08-01T12:00:00.000Z', 10_00), expense('2026-08-31T12:00:00.000Z', 5_00)],
      august,
      new Date(2026, 9, 15)
    )
    expect(s.cumulative[0]).toBe(10_00)
    expect(s.cumulative[30]).toBe(15_00)
  })

  it('a legacy date-only row on the first of the month stays in that month', () => {
    const s = computeSpendingPace([expense('2026-08-01', 10_00)], august, new Date(2026, 9, 15))
    expect(s.mtdCents).toBe(10_00)
    expect(s.priorTotalCents).toBe(0)
  })
})

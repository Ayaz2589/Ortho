import { describe, it, expect } from 'vitest'
import { computeSavingsTrends } from '@/lib/finance/savingsTrends'
import { monthBoundsInterval } from '@/lib/useDashboardRange'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24, major B2 — savings-trends under a selected month in a
// non-UTC timezone. Runs under vitest.tz.config.ts (TZ=America/New_York).
//
// THE BUG (pre-fix): computeSavingsTrends scaffolded its month buckets with
// LOCAL date getters on the interval instants, but the selected-month interval
// is UTC (monthBounds). In New York interval.start = Aug-1T00:00Z reads as
// Jul 31 local, so a single selected August produced months
// ['2026-07','2026-08'] — and the panel's "Selected month" card
// (summary.months[0]) rendered the phantom, empty July under an August header.
//
// THE FIX: the month scaffold and the loop bound are read at noon of each
// instant (month-aligned starts stay in their own calendar month in every
// offset within ±11 in both the UTC and the local interval frame), and rows
// are bucketed by the local month of their guard-parsed date.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0
function tx(kind: 'income' | 'expense', date: string, cents: number): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: 'M',
    category: kind === 'income' ? 'salary' : 'groceries',
    kind,
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

describe('computeSavingsTrends with a UTC month-bounds interval (TZ=America/New_York)', () => {
  it('scaffolds exactly one month for a selected month — no phantom prior month', () => {
    const s = computeSavingsTrends([], monthBoundsInterval('2026-08'))
    expect(s.months).toHaveLength(1)
    expect(s.months[0].yyyymm).toBe('2026-08')
  })

  it('buckets first- and last-day noon-UTC rows into the selected month', () => {
    const s = computeSavingsTrends(
      [
        tx('income', '2026-08-01T12:00:00.000Z', 400_000),
        tx('expense', '2026-08-31T12:00:00.000Z', 120_000),
        tx('expense', '2026-07-31T12:00:00.000Z', 999_00), // outside the window
      ],
      monthBoundsInterval('2026-08')
    )
    expect(s.months).toHaveLength(1)
    expect(s.months[0].incomeCents).toBe(400_000)
    expect(s.months[0].expenseCents).toBe(120_000)
  })

  it('a multi-month UTC window scaffolds only its own months', () => {
    const s = computeSavingsTrends([], {
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-09-01T00:00:00.000Z'),
    })
    expect(s.months.map((m) => m.yyyymm)).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('local-frame (range mode) intervals are unchanged', () => {
    // rangeInterval builds local month boundaries — the pre-fix code was
    // correct for this frame and must stay so.
    const s = computeSavingsTrends(
      [tx('income', '2026-08-15T12:00:00.000Z', 100_00)],
      { start: new Date(2026, 5, 1), end: new Date(2026, 8, 1) }
    )
    expect(s.months.map((m) => m.yyyymm)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(s.months[2].incomeCents).toBe(100_00)
  })
})

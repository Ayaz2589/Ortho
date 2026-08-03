import { describe, it, expect } from 'vitest'
import { buildSpendHeatmap } from '@/lib/dashboard/spendHeatmap'
import type { Transaction } from '@/lib/types'

// Spec 037: the net-summary spend heatmap. Pure per-day expense buckets over the
// scope window, with a level relative to the busiest day. Income and transfers are
// excluded; out-of-window rows are ignored.

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: 'x', household_id: 'h', merchant: 'm', category: 'groceries', kind: 'expense',
    amount_cents: 0, source: '', date: '2026-08-01', created_by: 'u', created_at: '', updated_at: '',
    owner_ids: [], shares: {},
    ...over,
  }) as Transaction

const AUG: { start: Date; end: Date } = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }

describe('buildSpendHeatmap', () => {
  it('returns one entry per calendar day in the window', () => {
    const days = buildSpendHeatmap([], AUG)
    expect(days).toHaveLength(31) // August
    expect(days[0].date.getDate()).toBe(1)
    expect(days[30].date.getDate()).toBe(31)
    // Empty window → every day is level 0, zero cents.
    expect(days.every((d) => d.cents === 0 && d.level === 0)).toBe(true)
  })

  it('sums expense cents per day and scales the level to the busiest day', () => {
    const days = buildSpendHeatmap(
      [
        tx({ id: 'a', kind: 'expense', amount_cents: 10000, date: '2026-08-05T12:00:00.000Z' }),
        tx({ id: 'b', kind: 'expense', amount_cents: 40000, date: '2026-08-10T12:00:00.000Z' }), // max
        tx({ id: 'c', kind: 'expense', amount_cents: 20000, date: '2026-08-10T18:00:00.000Z' }), // same day → 60000
      ],
      AUG
    )
    // Aug 10 = 40000 + 20000 = 60000 (the max) → level 4.
    expect(days[9].cents).toBe(60000)
    expect(days[9].level).toBe(4)
    // Aug 5 = 10000; 10000/60000 ≈ 0.167 → level 1.
    expect(days[4].cents).toBe(10000)
    expect(days[4].level).toBe(1)
    // A quiet day.
    expect(days[0].cents).toBe(0)
    expect(days[0].level).toBe(0)
  })

  it('excludes income, transfers, and out-of-window rows', () => {
    const days = buildSpendHeatmap(
      [
        tx({ id: 'i', kind: 'income', amount_cents: 500000, date: '2026-08-05T12:00:00.000Z' }),
        tx({ id: 't', kind: 'transfer', amount_cents: 500000, date: '2026-08-05T12:00:00.000Z' }),
        tx({ id: 'o', kind: 'expense', amount_cents: 900000, date: '2026-07-20T12:00:00.000Z' }),
      ],
      AUG
    )
    expect(days.every((d) => d.cents === 0)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { buildSpendHeatmap } from '@/lib/dashboard/spendHeatmap'
import type { Transaction } from '@/lib/types'

// Spec 037 + heatmap depth: the net-summary spend heatmap. Pure per-day expense
// buckets over the scope window. The level reflects a day's spend RANK among
// spending days (a ties-averaged percentile across 6 bands), so different daily
// amounts read as different shades and one big outlier no longer floors every
// other day to the lightest band. Income and transfers are excluded; out-of-window
// rows are ignored.

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: 'x', household_id: 'h', merchant: 'm', category: 'groceries', kind: 'expense',
    amount_cents: 0, source: '', date: '2026-08-01', created_by: 'u', created_at: '', updated_at: '',
    owner_ids: [], shares: {},
    ...over,
  }) as Transaction

const AUG: { start: Date; end: Date } = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }

const on = (day: number, cents: number) =>
  tx({ id: `d${day}-${cents}`, amount_cents: cents, date: `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z` })

describe('buildSpendHeatmap', () => {
  it('returns one entry per calendar day in the window', () => {
    const days = buildSpendHeatmap([], AUG)
    expect(days).toHaveLength(31) // August
    expect(days[0].date.getDate()).toBe(1)
    expect(days[30].date.getDate()).toBe(31)
    // Empty window → every day is level 0, zero cents.
    expect(days.every((d) => d.cents === 0 && d.level === 0)).toBe(true)
  })

  it('sums expense cents per day', () => {
    const days = buildSpendHeatmap(
      [on(10, 40000), on(10, 20000)], // same day → 60000
      AUG
    )
    expect(days[9].cents).toBe(60000)
  })

  it('spreads six distinct daily amounts across the full 1–6 ramp', () => {
    // Six increasing spend days → one per band, smallest = 1 … largest = 6.
    const days = buildSpendHeatmap(
      [on(2, 1000), on(4, 2000), on(6, 3000), on(8, 4000), on(10, 5000), on(12, 6000)],
      AUG
    )
    expect(days[1].level).toBe(1) // Aug 2, smallest
    expect(days[3].level).toBe(2)
    expect(days[5].level).toBe(3)
    expect(days[7].level).toBe(4)
    expect(days[9].level).toBe(5)
    expect(days[11].level).toBe(6) // Aug 12, largest
    // Quiet days stay 0.
    expect(days[0].level).toBe(0)
  })

  it('a lone outlier no longer floors the cluster of similar days to band 1', () => {
    // Three similar small days + one big day. The small days sit together mid-ramp
    // (ties averaged), not pinned to the lightest band as fraction-of-max would.
    const days = buildSpendHeatmap(
      [on(3, 5000), on(6, 5000), on(9, 5000), on(20, 200000)],
      AUG
    )
    expect(days[2].level).toBe(days[5].level) // ties share a band
    expect(days[5].level).toBe(days[8].level)
    expect(days[2].level).toBeGreaterThan(1) // NOT floored to 1 by the outlier
    expect(days[19].level).toBe(6) // the big day tops the ramp
    expect(days[2].level).toBeLessThan(days[19].level)
  })

  it('pins the heaviest day to the top band even when the window is sparse', () => {
    // A lone spending day is the window's busiest → darkest band.
    const lone = buildSpendHeatmap([on(5, 12345)], AUG)
    expect(lone[4].cents).toBe(12345)
    expect(lone[4].level).toBe(6)
    // Two spend days: the bigger is band 6, the smaller is lighter.
    const two = buildSpendHeatmap([on(5, 1000), on(9, 9000)], AUG)
    expect(two[8].level).toBe(6) // Aug 9 = max
    expect(two[4].level).toBeLessThan(6) // Aug 5 lighter
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

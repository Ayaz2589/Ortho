import { describe, it, expect } from 'vitest'
import { monthInsightReference, monthReferenceDate } from '@/components/dashboard/range'
import { generateInsights } from '@/lib/finance/insights'
import { makeTx } from '../helpers/fixtures'
import type { Budget } from '@/lib/types'

// B2 (spec 023): budget insights for a SELECTED specific month must reflect that
// month's real elapsed time. A completed past month is fully elapsed (0 days
// left, progress 1) — not the mid-month "~14 days left" the old 15th-of-month
// reference produced, which also permanently suppressed the "under budget" card
// (its rule needs monthProgress >= 0.7, impossible at the pinned ~0.48).
describe('B2: month-scoped budget insights use real elapsed time', () => {
  const today = new Date('2026-06-20T12:00:00.000Z')
  const budgets: Budget[] = [{ id: 'b1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 10000 }]
  const txs = [makeTx({ id: 't1', category: 'groceries', kind: 'expense', amount_cents: 4000, date: '2026-03-10T12:00:00.000Z' })]

  it('DEFECT: the old mid-month (15th) reference suppresses under-budget for a finished month', () => {
    const oldRef = monthReferenceDate('2026-03') // the 15th at noon UTC
    const insights = generateInsights(txs, budgets, [], oldRef)
    // monthProgress ≈ 15/31 ≈ 0.48 < 0.7 → the positive card can never fire.
    expect(insights.find((i) => i.id.startsWith('budget-under-'))).toBeUndefined()
  })

  it('a completed past month yields a fully-elapsed reference (its last day)', () => {
    const ref = monthInsightReference('2026-03', today)
    expect(ref.getUTCMonth()).toBe(2) // March, 0-based
    expect(ref.getUTCDate()).toBe(31) // March has 31 days → fully elapsed
  })

  it('the current month yields today (real elapsed time)', () => {
    expect(monthInsightReference('2026-06', today)).toBe(today)
  })

  it('fires the under-budget insight for a finished, under-budget month (0 days left)', () => {
    const ref = monthInsightReference('2026-03', today)
    const insights = generateInsights(txs, budgets, [], ref)
    const under = insights.find((i) => i.id.startsWith('budget-under-'))
    expect(under, 'under-budget insight should fire for a finished under-budget month').toBeDefined()
    expect(under!.body).toContain('0 days left')
  })
})

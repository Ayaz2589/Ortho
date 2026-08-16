import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
  const budgets: Budget[] = [{ id: 'b1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: null }]
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

// B2 timezone regression (spec 023 review): insights.ts derives the whole month
// from LOCAL getters (now.getFullYear()/getMonth()/getDate()). If the reference
// is built as a noon-UTC last-day instant, a viewer at UTC+12 or further east
// (New Zealand, Fiji, …) reads it as the 1st of the NEXT month, so a selected
// completed month is scoped to the wrong (next, empty) month — re-suppressing the
// exact under-budget card B2 fixed. The reference must be built on the LOCAL
// calendar so it lands on the selected month in every timezone. (The vitest
// worker pins TZ=UTC, so we force an eastern zone here and restore it.)
describe('B2 timezone regression: completed-month reference is local-calendar stable', () => {
  const ORIG_TZ = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland' // UTC+13 in March (NZDT)
  })
  afterAll(() => {
    process.env.TZ = ORIG_TZ
  })

  // `now` is in July, so '2026-03' takes the completed-past-month branch.
  const now = new Date('2026-07-20T00:00:00.000Z')
  const budgets: Budget[] = [{ id: 'b1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: null }]
  const txs = [makeTx({ id: 't1', category: 'groceries', kind: 'expense', amount_cents: 4000, date: '2026-03-10T12:00:00.000Z' })]

  it('reads as the selected month (March, its last day) through the LOCAL getters insights uses', () => {
    const ref = monthInsightReference('2026-03', now)
    expect(ref.getMonth()).toBe(2) // March, 0-based — LOCAL getter, must not roll to April
    expect(ref.getDate()).toBe(31) // March's last day — LOCAL getter, not the 1st of the next month
  })

  it('still fires the under-budget card for a finished under-budget month at UTC+13', () => {
    const insights = generateInsights(txs, budgets, [], monthInsightReference('2026-03', now))
    expect(insights.find((i) => i.id.startsWith('budget-under-'))).toBeDefined()
  })
})

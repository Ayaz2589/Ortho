import { describe, it, expect } from 'vitest'
import type { Budget, Transaction } from '@/lib/types'
import { buildPlanSummary } from '@/lib/planning/planSummary'
import { generateInsights } from '@/lib/finance/insights'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'

// spec 054 — the engines project LIMITS with the same scope they project spend with,
// at the same entry point. Supersedes the spec-051 boundary where limits stayed
// household-level regardless of scope.

const A = 'p-a'
const B = 'p-b'
const NOW = new Date(2026, 7, 15, 12, 0, 0)
const MONTH = '2026-08'

function shared(amount: number, category: Transaction['category'] = 'groceries'): Transaction {
  const half = amount / 2
  return {
    id: `tx-${category}-${amount}`,
    household_id: 'h',
    merchant: 'Grocer',
    category,
    kind: 'expense',
    amount_cents: amount,
    source: '',
    date: '2026-08-05T12:00:00.000Z',
    created_by: 'u',
    created_at: '2026-08-05T12:00:00.000Z',
    updated_at: '2026-08-05T12:00:00.000Z',
    paid_by: A,
    owner_ids: [A, B],
    shares: { [A]: half, [B]: half },
    notes: null,
  } as Transaction
}

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: 'b-household',
    household_id: 'h',
    category: 'groceries',
    monthly_limit_cents: 40_000,
    budget_type: 'fixed',
    rollover_cap_cents: null,
    person_id: null,
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

const plan = (budgets: Budget[], scope?: Parameters<typeof buildPlanSummary>[0]['scope']) =>
  buildPlanSummary(
    {
      budgets,
      goals: [],
      goalContributions: [],
      transactions: [shared(30_000)],
      monthKey: MONTH,
      scope,
    },
    NOW,
  )

describe('planSummary — a personal budget is measured against that person’s spend', () => {
  const mine = budget({ id: 'b-mine', person_id: A, monthly_limit_cents: 20_000 })

  it('uses the personal limit and the personal share', () => {
    const summary = plan([budget(), mine], personScope(A))
    expect(summary.budgets.budgetCount).toBe(1)
    expect(summary.budgets.atRisk[0].budgetId).toBe('b-mine')
    expect(summary.budgets.totalLimitCents).toBe(20_000)
    // Half of the shared $300 — their stored share, not the household total.
    expect(summary.budgets.totalSpentCents).toBe(15_000)
  })

  it('keeps a personal budget out of the household summary (FR-006)', () => {
    const summary = plan([budget(), mine], HOUSEHOLD_SCOPE)
    expect(summary.budgets.budgetCount).toBe(1)
    expect(summary.budgets.atRisk[0].budgetId).toBe('b-household')
    expect(summary.budgets.totalLimitCents).toBe(40_000)
    expect(summary.health.budgetedCents).toBe(40_000)
  })

  it('shows another person nothing of it', () => {
    expect(plan([budget(), mine], personScope(B)).budgets.budgetCount).toBe(0)
  })

  it('never borrows the household limit for a person who has none (FR-003)', () => {
    const summary = plan([budget()], personScope(A))
    expect(summary.budgets.budgetCount).toBe(0)
    expect(summary.budgets.totalLimitCents).toBe(0)
    // With no plan of their own, every cent they spent is unplanned.
    expect(summary.health.budgetedCents).toBe(0)
    expect(summary.health.unbudgetedSpentCents).toBe(15_000)
  })

  it('scopes sinking funds too', () => {
    const fund = budget({
      id: 'b-fund',
      category: 'insurance',
      budget_type: 'non_monthly',
      person_id: A,
    })
    expect(plan([fund], personScope(A)).sinkingFunds.map((f) => f.budgetId)).toEqual(['b-fund'])
    expect(plan([fund], HOUSEHOLD_SCOPE).sinkingFunds).toEqual([])
  })

  it('is unchanged for a household that has no personal budgets (FR-007)', () => {
    expect(plan([budget()], HOUSEHOLD_SCOPE)).toEqual(plan([budget()], undefined))
  })
})

describe('insights — budget rules read the scope’s budgets', () => {
  const txs = [shared(30_000)]
  const overspent = budget({ id: 'b-mine', person_id: A, monthly_limit_cents: 10_000 })

  it('fires a person’s over-budget rule from their own limit', () => {
    const mine = generateInsights(txs, [overspent], [], NOW, 6, undefined, 'en-US', personScope(A))
    // $150 of their share against a $100 personal limit.
    expect(mine.some((i) => i.id.startsWith('budget-over-groceries'))).toBe(true)
  })

  it('does not apply someone’s personal limit to the household', () => {
    const all = generateInsights(txs, [overspent], [], NOW, 6, undefined, 'en-US', HOUSEHOLD_SCOPE)
    expect(all.some((i) => i.id.startsWith('budget-'))).toBe(false)
  })

  it('gives a person with no personal budget no budget insights', () => {
    const mine = generateInsights(txs, [budget()], [], NOW, 6, undefined, 'en-US', personScope(A))
    expect(mine.some((i) => i.id.startsWith('budget-'))).toBe(false)
  })
})

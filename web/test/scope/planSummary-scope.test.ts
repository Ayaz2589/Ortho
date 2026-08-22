import { describe, it, expect } from 'vitest'
import type { Budget, Goal, Transaction } from '@/lib/types'
import { buildPlanSummary } from '@/lib/planning/planSummary'
import { generateInsights } from '@/lib/finance/insights'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'

// spec 051 — the consumers. The lock that matters most is that HOUSEHOLD scope is a strict
// no-op: every figure must be identical to a call that never mentions scope at all.

const A = 'p-a'
const B = 'p-b'
const NOW = new Date(2026, 7, 15, 12, 0, 0)
const MONTH = '2026-08'

function shared(amount: number, category: Transaction['category'] = 'groceries', kind: Transaction['kind'] = 'expense'): Transaction {
  const half = amount / 2
  return {
    id: `tx-${kind}-${category}-${amount}`,
    household_id: 'h',
    merchant: 'Grocer',
    category,
    kind,
    amount_cents: amount,
    source: '',
    date: '2026-08-05T12:00:00.000Z',
    created_by: 'u',
    created_at: '2026-08-05T12:00:00.000Z',
    updated_at: '2026-08-05T12:00:00.000Z',
    paid_by: kind === 'income' ? null : A,
    owner_ids: [A, B],
    shares: { [A]: half, [B]: half },
    notes: null,
  } as Transaction
}

const budget: Budget = {
  id: 'b1',
  household_id: 'h',
  category: 'groceries',
  monthly_limit_cents: 40000,
  person_id: null,
  budget_type: 'fixed',
  rollover_cap_cents: null,
  created_at: '2026-08-01T00:00:00Z',
}

const goals: Goal[] = []

const base = (scope?: Parameters<typeof buildPlanSummary>[0]['scope']) =>
  buildPlanSummary(
    {
      budgets: [budget],
      goals,
      goalContributions: [],
      transactions: [shared(30000), shared(60000, 'salary', 'income')],
      monthKey: MONTH,
      scope,
    },
    NOW
  )

describe('planSummary — household scope is a no-op', () => {
  it('matches a call with no scope at all', () => {
    expect(base(HOUSEHOLD_SCOPE)).toEqual(base(undefined))
  })

  it('counts the FULL shared amount', () => {
    expect(base().budgets.totalSpentCents).toBe(30000)
    expect(base().health.incomeCents).toBe(60000)
  })
})

describe('planSummary — a person scope measures only their share', () => {
  // AMENDED BY SPEC 054. Spec 051 asserted here that a person's halved spend was measured
  // against the UNCHANGED household limit ($400) — the deliberate v1 boundary of that spec.
  // 054 removed it: limits carry an owner now, and `budget` above is the household's, so a
  // person who has set no budget of their own has no limit rather than a borrowed one
  // (FR-003). The spend projection this test really guards is unchanged.
  it('halves the spend, and borrows no household limit', () => {
    const mine = base(personScope(A))
    expect(mine.health.unbudgetedSpentCents).toBe(15000)
    expect(mine.budgets.atRisk).toEqual([])
    expect(mine.budgets.totalLimitCents).toBe(0)
  })

  it('halves income for left-to-plan', () => {
    expect(base(personScope(A)).health.incomeCents).toBe(30000)
  })

  it('gives a non-owner nothing', () => {
    const stranger = buildPlanSummary(
      {
        budgets: [budget],
        goals,
        goalContributions: [],
        transactions: [shared(30000)],
        monthKey: MONTH,
        scope: personScope('p-nobody'),
      },
      NOW
    )
    expect(stranger.budgets.totalSpentCents).toBe(0)
    expect(stranger.health.incomeCents).toBe(0)
  })

  it('reconciles: both people’s scoped spend sums to the household figure', () => {
    // Measured through the health hero rather than the budget card, since after spec 054
    // a person with no budget of their own has no budgeted spend to total — the ledger
    // projection being reconciled here is the same one either way.
    const total = [A, B]
      .map((p) => base(personScope(p)).health.unbudgetedSpentCents)
      .reduce((s, n) => s + n, 0)
    expect(total).toBe(base().budgets.totalSpentCents)
  })

  it('leaves goals household-level (a v1 boundary, not an oversight)', () => {
    expect(base(personScope(A)).goals).toEqual(base().goals)
  })
})

describe('insights — scope is honored, household unchanged', () => {
  const txs = [shared(30000)]

  it('produces identical output for household scope and no scope', () => {
    expect(generateInsights(txs, [budget], [], NOW, 6, undefined, 'en-US', HOUSEHOLD_SCOPE)).toEqual(
      generateInsights(txs, [budget], [], NOW)
    )
  })

  it('reports a person’s share, not the household total', () => {
    const mine = generateInsights(txs, [], [], NOW, 6, undefined, 'en-US', personScope(A))
    const top = mine.find((i) => i.id.startsWith('top-category-'))
    expect(top?.magnitude_cents).toBe(15000)
  })

  it('reports the household total under household scope', () => {
    const all = generateInsights(txs, [], [], NOW)
    const top = all.find((i) => i.id.startsWith('top-category-'))
    expect(top?.magnitude_cents).toBe(30000)
  })
})

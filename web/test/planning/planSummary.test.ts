import { describe, it, expect } from 'vitest'
import {
  currentMonthKey,
  stepMonthKey,
  planReferenceDate,
  monthElapsedFraction,
  paceState,
  incomeForMonth,
  unbudgetedSpendForMonth,
  plannedGoalContributions,
  planHealth,
  rankAtRiskBudgets,
  budgetSummary,
  rankGoals,
  sinkingFunds,
  buildPlanSummary,
} from '@/lib/planning/planSummary'
import { PLANNING } from '@/lib/planning/thresholds'
import { budgetStatusForMonth } from '@/lib/finance/budgets'
import { goalPacing, contributionsByGoal } from '@/lib/finance/goals'
import { makeTx } from '../helpers/fixtures'
import type { Budget, Goal, GoalContribution } from '@/lib/types'

// Reference "today": June 15 2026, local noon. June has 30 days → half elapsed.
const NOW = new Date(2026, 5, 15, 12, 0, 0, 0)

function makeBudget(o: Partial<Budget> = {}): Budget {
  return {
    id: o.id ?? 'b-1',
    household_id: 'hh-1',
    category: o.category ?? 'groceries',
    monthly_limit_cents: o.monthly_limit_cents ?? 100000,
    budget_type: o.budget_type ?? 'fixed',
    rollover_cap_cents: o.rollover_cap_cents ?? null,
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

function makeGoal(o: Partial<Goal> = {}): Goal {
  return {
    id: o.id ?? 'g-1',
    household_id: 'hh-1',
    name: o.name ?? 'Goal',
    kind: o.kind ?? 'savings',
    target_cents: o.target_cents ?? 120000,
    target_date: o.target_date ?? null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u-me',
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

function contrib(goal_id: string, amount_cents: number, date = '2026-02-01'): GoalContribution {
  return { id: `c-${goal_id}-${amount_cents}`, goal_id, amount_cents, date, note: null, created_by: 'u-me', created_at: date }
}

describe('month helpers', () => {
  it('currentMonthKey is the local YYYY-MM of now', () => {
    expect(currentMonthKey(NOW)).toBe('2026-06')
    expect(currentMonthKey(new Date(2026, 0, 1))).toBe('2026-01')
    expect(currentMonthKey(new Date(2026, 11, 31))).toBe('2026-12')
  })

  it('stepMonthKey moves one month and wraps the year', () => {
    expect(stepMonthKey('2026-06', 'next')).toBe('2026-07')
    expect(stepMonthKey('2026-06', 'prev')).toBe('2026-05')
    expect(stepMonthKey('2026-12', 'next')).toBe('2027-01')
    expect(stepMonthKey('2026-01', 'prev')).toBe('2025-12')
  })

  it('monthElapsedFraction: current is day/daysInMonth, past 1, future 0', () => {
    expect(monthElapsedFraction('2026-06', NOW)).toBeCloseTo(15 / 30, 10)
    expect(monthElapsedFraction('2026-05', NOW)).toBe(1)
    expect(monthElapsedFraction('2026-07', NOW)).toBe(0)
  })

  it('planReferenceDate: now for current, month-end for past, month-start for future', () => {
    expect(planReferenceDate('2026-06', NOW).getTime()).toBe(NOW.getTime())
    const past = planReferenceDate('2026-05', NOW)
    expect(past.getFullYear()).toBe(2026)
    expect(past.getMonth()).toBe(4) // May
    expect(past.getDate()).toBe(31) // last day of May
    const future = planReferenceDate('2026-07', NOW)
    expect(future.getMonth()).toBe(6) // July
    expect(future.getDate()).toBe(1)
    expect(future.getHours()).toBe(0)
  })
})

describe('paceState', () => {
  it('over when spent reaches the effective limit', () => {
    expect(paceState(1000, 1000, 0.5)).toBe('over')
    expect(paceState(1200, 1000, 0.1)).toBe('over')
  })
  it('attention when ahead of pace, under when behind pace', () => {
    expect(paceState(600, 1000, 0.1)).toBe('attention') // 60% spent, 10% elapsed
    expect(paceState(600, 1000, 0.9)).toBe('under') // 60% spent, 90% elapsed
  })
  it('future month (0 elapsed): under with no spend, attention once spending starts', () => {
    expect(paceState(0, 1000, 0)).toBe('under')
    expect(paceState(50, 1000, 0)).toBe('attention')
  })
  it('non-positive limit is never over', () => {
    expect(paceState(500, 0, 0.5)).toBe('under')
  })
})

describe('incomeForMonth', () => {
  it('sums only income transactions inside the month window', () => {
    const txns = [
      makeTx({ kind: 'income', category: 'income', amount_cents: 500000, date: '2026-06-05T12:00:00.000Z' }),
      makeTx({ kind: 'income', category: 'income', amount_cents: 300000, date: '2026-06-28T12:00:00.000Z' }),
      makeTx({ kind: 'income', category: 'income', amount_cents: 999999, date: '2026-05-30T12:00:00.000Z' }), // prior month
      makeTx({ kind: 'expense', amount_cents: 4000, date: '2026-06-10T12:00:00.000Z' }), // not income
    ]
    expect(incomeForMonth(txns, '2026-06')).toBe(800000)
  })
})

describe('unbudgetedSpendForMonth', () => {
  const groceries = makeBudget({ id: 'b-g', category: 'groceries', monthly_limit_cents: 100000 })
  const insurance = makeBudget({ id: 'b-i', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000 })

  it('sums expenses in the month whose category has no budget', () => {
    const txns = [
      makeTx({ kind: 'expense', category: 'groceries', amount_cents: 30000, date: '2026-06-10T12:00:00.000Z' }), // budgeted → excluded
      makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 15000, date: '2026-06-12T12:00:00.000Z' }), // unbudgeted
      makeTx({ kind: 'expense', category: 'clothing', amount_cents: 5000, date: '2026-06-20T12:00:00.000Z' }), // unbudgeted
    ]
    expect(unbudgetedSpendForMonth([groceries, insurance], txns, '2026-06')).toBe(20000)
  })

  it('counts a non_monthly (sinking-fund) category as budgeted', () => {
    const txns = [makeTx({ kind: 'expense', category: 'insurance', amount_cents: 18000, date: '2026-06-08T12:00:00.000Z' })]
    expect(unbudgetedSpendForMonth([groceries, insurance], txns, '2026-06')).toBe(0)
  })

  it('ignores income/transfers and out-of-month expenses', () => {
    const txns = [
      makeTx({ kind: 'income', category: 'income', amount_cents: 400000, date: '2026-06-05T12:00:00.000Z' }),
      makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 9999, date: '2026-05-30T12:00:00.000Z' }), // prior month
      makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 7000, date: '2026-06-15T12:00:00.000Z' }), // in month
    ]
    expect(unbudgetedSpendForMonth([groceries], txns, '2026-06')).toBe(7000)
  })

  it('a budget with a zero limit does not shelter its category', () => {
    const zero = makeBudget({ id: 'b-z', category: 'entertainment', monthly_limit_cents: 0 })
    const txns = [makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 4000, date: '2026-06-11T12:00:00.000Z' })]
    expect(unbudgetedSpendForMonth([zero], txns, '2026-06')).toBe(4000)
  })
})

describe('plannedGoalContributions', () => {
  it('sums suggested monthly for dated goals, undated contribute nothing', () => {
    const dated = makeGoal({ id: 'g-dated', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2026-12-31' })
    const undated = makeGoal({ id: 'g-undated', target_cents: 50000, target_date: null })
    const ref = planReferenceDate('2026-06', NOW)
    const by = contributionsByGoal([])
    const expected = goalPacing(dated.target_cents, dated.target_date, dated.created_at, 0, ref).suggested_monthly_cents
    expect(expected).toBeGreaterThan(0)
    expect(plannedGoalContributions([dated, undated], by, ref)).toBe(expected)
  })
})

describe('planHealth', () => {
  it('left to plan = income − base budgeted − goal contributions (base, not effective)', () => {
    // Flex budget created last month with no May spend → carries a surplus into June,
    // so its EFFECTIVE limit is base + carry. The hero must use BASE, not effective.
    const flex = makeBudget({ id: 'b-flex', category: 'groceries', budget_type: 'flex', monthly_limit_cents: 50000, created_at: '2026-05-01T00:00:00.000Z' })
    const fixed = makeBudget({ id: 'b-fixed', category: 'dining', budget_type: 'fixed', monthly_limit_cents: 30000, created_at: '2026-01-01T00:00:00.000Z' })
    const ref = planReferenceDate('2026-06', NOW)
    const status = budgetStatusForMonth(flex, [], ref)
    expect(status.effectiveLimitCents).toBeGreaterThan(50000) // proves carry exists

    const txns = [makeTx({ kind: 'income', category: 'income', amount_cents: 400000, date: '2026-06-05T12:00:00.000Z' })]
    const health = planHealth(
      { budgets: [flex, fixed], goals: [], goalContributions: [], transactions: txns, monthKey: '2026-06' },
      ref,
    )
    expect(health.incomeCents).toBe(400000)
    expect(health.budgetedCents).toBe(80000) // 50000 + 30000 base — NOT effective
    expect(health.goalContributionsCents).toBe(0)
    expect(health.unbudgetedSpentCents).toBe(0)
    expect(health.leftToPlanCents).toBe(400000 - 80000 - 0 - 0)
  })

  it('subtracts money spent outside any budgeted category (spec 040)', () => {
    const groceries = makeBudget({ id: 'b-g', category: 'groceries', monthly_limit_cents: 200000 })
    const ref = planReferenceDate('2026-06', NOW)
    const txns = [
      makeTx({ kind: 'income', category: 'income', amount_cents: 1000000, date: '2026-06-05T12:00:00.000Z' }),
      makeTx({ kind: 'expense', category: 'groceries', amount_cents: 120000, date: '2026-06-10T12:00:00.000Z' }), // in budget → not double-counted
      makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 500000, date: '2026-06-12T12:00:00.000Z' }), // unbudgeted
    ]
    const health = planHealth({ budgets: [groceries], goals: [], goalContributions: [], transactions: txns, monthKey: '2026-06' }, ref)
    expect(health.budgetedCents).toBe(200000)
    expect(health.unbudgetedSpentCents).toBe(500000)
    // 1,000,000 income − 200,000 budgeted − 0 goals − 500,000 unbudgeted spend = 300,000.
    expect(health.leftToPlanCents).toBe(300000)
  })

  it('can be negative when over-committed', () => {
    const b = makeBudget({ monthly_limit_cents: 500000 })
    const ref = planReferenceDate('2026-06', NOW)
    const txns = [makeTx({ kind: 'income', category: 'income', amount_cents: 100000, date: '2026-06-05T12:00:00.000Z' })]
    const health = planHealth({ budgets: [b], goals: [], goalContributions: [], transactions: txns, monthKey: '2026-06' }, ref)
    expect(health.leftToPlanCents).toBeLessThan(0)
  })
})

describe('rankAtRiskBudgets', () => {
  it('excludes non_monthly, sorts ahead-of-pace first, caps at topN', () => {
    const groceries = makeBudget({ id: 'b-g', category: 'groceries', budget_type: 'fixed', monthly_limit_cents: 100000 })
    const dining = makeBudget({ id: 'b-d', category: 'dining', budget_type: 'flex', monthly_limit_cents: 100000 })
    const travel = makeBudget({ id: 'b-t', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 100000 })
    const txns = [
      makeTx({ category: 'groceries', amount_cents: 90000, date: '2026-06-10T12:00:00.000Z' }), // 90% at 50% elapsed → attention
      makeTx({ category: 'dining', amount_cents: 10000, date: '2026-06-10T12:00:00.000Z' }), // 10% → under
      makeTx({ category: 'insurance', amount_cents: 95000, date: '2026-06-10T12:00:00.000Z' }),
    ]
    const ref = planReferenceDate('2026-06', NOW)
    const rows = rankAtRiskBudgets([groceries, dining, travel], txns, ref, monthElapsedFraction('2026-06', NOW))
    expect(rows.map((r) => r.budgetId)).toEqual(['b-g', 'b-d']) // travel excluded, groceries first
    expect(rows[0].pace).toBe('attention')
    expect(rows[1].pace).toBe('under')
    expect(rows.length).toBeLessThanOrEqual(PLANNING.topN)
  })

  it('surfaces remaining/over and carried-in per row', () => {
    const b = makeBudget({ id: 'b-over', category: 'groceries', budget_type: 'fixed', monthly_limit_cents: 100000 })
    const txns = [makeTx({ category: 'groceries', amount_cents: 120000, date: '2026-06-10T12:00:00.000Z' })]
    const ref = planReferenceDate('2026-06', NOW)
    const [row] = rankAtRiskBudgets([b], txns, ref, monthElapsedFraction('2026-06', NOW))
    expect(row.pace).toBe('over')
    expect(row.remainingCents).toBe(-20000)
  })
})

describe('budgetSummary', () => {
  it('counts only fixed/flex budgets — a non_monthly-only household is empty here', () => {
    // Only a sinking fund; the budget summary should report empty (count 0) so the
    // card shows its empty state, not a zeroed "$0 of $0" card.
    const sinking = makeBudget({ category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000 })
    const ref = planReferenceDate('2026-06', NOW)
    const summary = budgetSummary([sinking], [], ref, monthElapsedFraction('2026-06', NOW))
    expect(summary.budgetCount).toBe(0)
    expect(summary.atRisk).toEqual([])
    expect(summary.totalLimitCents).toBe(0)
  })
})

describe('rankGoals', () => {
  it('off-track goals sort before on-track; undated is never off-track', () => {
    const behind = makeGoal({ id: 'g-behind', name: 'Behind', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2026-07-01' })
    const onTrack = makeGoal({ id: 'g-on', name: 'On', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2027-12-31' })
    const undated = makeGoal({ id: 'g-undated', name: 'Undated', target_cents: 50000, target_date: null })
    const contributions = [contrib('g-on', 60000)]
    const by = contributionsByGoal(contributions)
    const ref = planReferenceDate('2026-06', NOW)
    const summary = rankGoals([onTrack, undated, behind], by, ref)
    expect(summary.goalCount).toBe(3)
    expect(summary.rows[0].goalId).toBe('g-behind')
    expect(summary.rows[0].offTrack).toBe(true)
    expect(summary.rows[0].suggestedMonthlyCents).toBeGreaterThan(0)
    const u = summary.rows.find((r) => r.goalId === 'g-undated')!
    expect(u.offTrack).toBe(false)
    expect(u.dated).toBe(false)
    expect(u.suggestedMonthlyCents).toBe(0)
  })

  it('reports progress fraction and saved/target', () => {
    const g = makeGoal({ id: 'g', target_cents: 100000, target_date: null })
    const by = contributionsByGoal([contrib('g', 25000)])
    const summary = rankGoals([g], by, NOW)
    expect(summary.rows[0].savedCents).toBe(25000)
    expect(summary.rows[0].targetCents).toBe(100000)
    expect(summary.rows[0].fraction).toBeCloseTo(0.25, 10)
  })

  it('a past-month view reflects the point-in-time saved balance, not today\'s total', () => {
    const g = makeGoal({ id: 'g', target_cents: 100000, target_date: '2026-12-31', created_at: '2026-01-01T00:00:00.000Z' })
    const by = contributionsByGoal([
      contrib('g', 30000, '2026-02-15'),
      contrib('g', 40000, '2026-05-20'), // made AFTER the viewed month
    ])
    const marchRef = planReferenceDate('2026-03', NOW) // a past month
    expect(rankGoals([g], by, marchRef).rows[0].savedCents).toBe(30000) // excludes the May contribution
    const juneRef = planReferenceDate('2026-06', NOW) // current month → both count
    expect(rankGoals([g], by, juneRef).rows[0].savedCents).toBe(70000)
  })
})

describe('sinkingFunds', () => {
  it('lists only non_monthly budgets with their carried-in as set-aside', () => {
    const travel = makeBudget({ id: 'b-t', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000, created_at: '2026-01-01T00:00:00.000Z' })
    const groceries = makeBudget({ id: 'b-g', category: 'groceries', budget_type: 'fixed', monthly_limit_cents: 50000 })
    const ref = planReferenceDate('2026-06', NOW)
    const funds = sinkingFunds([travel, groceries], [], ref)
    expect(funds.map((f) => f.budgetId)).toEqual(['b-t'])
    expect(funds[0].setAsideCents).toBe(budgetStatusForMonth(travel, [], ref).carriedInCents)
  })

  it('is empty when there are no non_monthly budgets', () => {
    const g = makeBudget({ budget_type: 'fixed' })
    expect(sinkingFunds([g], [], NOW)).toEqual([])
  })
})

describe('buildPlanSummary', () => {
  it('assembles all sections and is deterministic for the same inputs + now', () => {
    const input = {
      budgets: [
        makeBudget({ id: 'b-g', category: 'groceries', budget_type: 'fixed', monthly_limit_cents: 100000 }),
        makeBudget({ id: 'b-t', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000 }),
      ],
      goals: [makeGoal({ id: 'g', target_cents: 100000, target_date: '2026-12-31', created_at: '2026-01-01T00:00:00.000Z' })],
      goalContributions: [contrib('g', 20000)],
      transactions: [
        makeTx({ kind: 'income', category: 'income', amount_cents: 400000, date: '2026-06-05T12:00:00.000Z' }),
        makeTx({ category: 'groceries', amount_cents: 90000, date: '2026-06-10T12:00:00.000Z' }),
      ],
      monthKey: '2026-06',
    }
    const a = buildPlanSummary(input, NOW)
    const b = buildPlanSummary(input, NOW)
    expect(a).toEqual(b)
    expect(a.monthKey).toBe('2026-06')
    expect(a.health.leftToPlanCents).toBe(
      a.health.incomeCents - a.health.budgetedCents - a.health.goalContributionsCents - a.health.unbudgetedSpentCents,
    )
    expect(a.budgets.budgetCount).toBe(1) // only the fixed groceries budget; the non_monthly one is a sinking fund
    expect(a.goals.goalCount).toBe(1)
    expect(a.sinkingFunds.map((f) => f.budgetId)).toEqual(['b-t'])
  })
})

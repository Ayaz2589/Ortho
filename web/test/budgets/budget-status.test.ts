// Unit tests for the ledger→monthly-spend adapter (spec 027). The arithmetic is
// vector-locked in budget-rollover.parity.test.ts; here we cover the reduction:
// anchor = creation month, local-calendar bucketing, pre-anchor rows ignored,
// per-type carry surfaced for the reference month.
import { describe, it, expect } from 'vitest'
import { budgetStatusForMonth } from '../../lib/finance/budgets'
import type { Budget, BudgetType, Transaction } from '../../lib/types'

// Timezone-stable dates: noon UTC, mid-month — the documented vector convention
// so month bucketing can't be flipped by the process timezone (docs/web.md §8).
const noon = (ym: string) => `${ym}-15T12:00:00.000Z`

let txSeq = 0
function expense(category: string, ym: string, cents: number): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant: 'M',
    category: category as Transaction['category'],
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date: noon(ym),
    created_by: 'u',
    created_at: noon(ym),
    updated_at: noon(ym),
    owner_ids: [],
    shares: {},
  }
}

function budget(over: Partial<Budget> & { budget_type: BudgetType }): Budget {
  return {
    id: 'b1',
    household_id: 'hh',
    category: 'groceries',
    monthly_limit_cents: 60000,
    rollover_cap_cents: null,
    created_at: noon('2026-01'),
    ...over,
  }
}

// Local-calendar reference month (1st at noon avoids any boundary ambiguity).
const month = (y: number, m: number) => new Date(y, m - 1, 1, 12)

describe('budgetStatusForMonth', () => {
  it('fixed: equals base − spent for the reference month, no carry', () => {
    const b = budget({ budget_type: 'fixed', monthly_limit_cents: 50000 })
    const txs = [expense('groceries', '2026-01', 20000), expense('groceries', '2026-03', 40000)]
    const s = budgetStatusForMonth(b, txs, month(2026, 3))
    expect(s).toEqual({
      effectiveLimitCents: 50000,
      spentCents: 40000,
      remainingCents: 10000,
      carriedInCents: 0,
    })
  })

  it('flex: carries surplus from prior months into the reference month', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000 })
    const txs = [
      expense('groceries', '2026-01', 50000), // surplus 10000
      expense('groceries', '2026-02', 40000), // surplus 30000 accumulated
      expense('groceries', '2026-03', 55000),
    ]
    const s = budgetStatusForMonth(b, txs, month(2026, 3))
    expect(s).toEqual({
      effectiveLimitCents: 90000,
      spentCents: 55000,
      remainingCents: 35000,
      carriedInCents: 30000,
    })
  })

  it('non_monthly: signed sinking fund draws negative on a big bill', () => {
    const b = budget({ budget_type: 'non_monthly', monthly_limit_cents: 5000 })
    const txs = [expense('groceries', '2026-06', 60000)] // Jan–May empty
    const s = budgetStatusForMonth(b, txs, month(2026, 6))
    expect(s).toEqual({
      effectiveLimitCents: 30000, // 5000 base + 25000 accrued over Jan–May
      spentCents: 60000,
      remainingCents: -30000,
      carriedInCents: 25000,
    })
  })

  it('ignores spend before the budget’s creation month (anchor)', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000, created_at: noon('2026-03') })
    const txs = [
      expense('groceries', '2026-01', 100000), // before anchor → ignored
      expense('groceries', '2026-03', 20000),
    ]
    const s = budgetStatusForMonth(b, txs, month(2026, 3))
    expect(s).toEqual({
      effectiveLimitCents: 60000,
      spentCents: 20000,
      remainingCents: 40000,
      carriedInCents: 0,
    })
  })

  it('ignores other categories and income', () => {
    const b = budget({ budget_type: 'fixed', monthly_limit_cents: 50000 })
    const other = expense('dining', '2026-01', 99999)
    const income: Transaction = { ...expense('groceries', '2026-01', 12345), kind: 'income' }
    const s = budgetStatusForMonth(b, [other, income, expense('groceries', '2026-01', 30000)], month(2026, 1))
    expect(s.spentCents).toBe(30000)
    expect(s.remainingCents).toBe(20000)
  })

  it('reference month before creation yields a sane zero-carry status', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000, created_at: noon('2026-05') })
    const s = budgetStatusForMonth(b, [expense('groceries', '2026-03', 10000)], month(2026, 3))
    expect(s).toEqual({
      effectiveLimitCents: 60000,
      spentCents: 10000,
      remainingCents: 50000,
      carriedInCents: 0,
    })
  })
})

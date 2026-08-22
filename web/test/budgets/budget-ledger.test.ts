// Spec 057, D8: `budgetStatusForMonth` already builds the full monthly rollover
// ledger and keeps only its last entry — the carry history US3's panel needs is
// computed on every render today and thrown away. `budgetLedgerForMonth` is a
// pure extraction of that series: same anchor/bucketing rule, same
// `computeRolloverLedger` call, but every month is returned rather than just
// the last. This must be a strictly behaviour-preserving move — its last entry
// equals what `budgetStatusForMonth` returns for identical inputs.
import { describe, it, expect } from 'vitest'
import { budgetLedgerForMonth, budgetStatusForMonth } from '../../lib/finance/budgets'
import type { Budget, BudgetType, Transaction } from '../../lib/types'

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
    person_id: null,
    created_at: noon('2026-01'),
    ...over,
  }
}

const month = (y: number, m: number) => new Date(y, m - 1, 1, 12)

describe('budgetLedgerForMonth', () => {
  it('returns one entry per month from the creation month through the reference month', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000, created_at: noon('2026-01') })
    const txs = [
      expense('groceries', '2026-01', 50000),
      expense('groceries', '2026-02', 40000),
      expense('groceries', '2026-03', 55000),
    ]
    const ledger = budgetLedgerForMonth(b, txs, month(2026, 3))
    expect(ledger).toHaveLength(3) // Jan, Feb, Mar
  })

  it("its last entry equals budgetStatusForMonth's return for identical inputs", () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000 })
    const txs = [
      expense('groceries', '2026-01', 50000),
      expense('groceries', '2026-02', 40000),
      expense('groceries', '2026-03', 55000),
    ]
    const ledger = budgetLedgerForMonth(b, txs, month(2026, 3))
    const status = budgetStatusForMonth(b, txs, month(2026, 3))
    const last = ledger[ledger.length - 1]
    expect({
      effectiveLimitCents: last.effectiveLimitCents,
      spentCents: last.spentCents,
      remainingCents: last.remainingCents,
      carriedInCents: last.carriedInCents,
    }).toEqual(status)
  })

  it('carries the surplus month over month, matching the rollover rule', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000 })
    const txs = [
      expense('groceries', '2026-01', 50000), // surplus 10000
      expense('groceries', '2026-02', 40000), // surplus 30000 accumulated
    ]
    const ledger = budgetLedgerForMonth(b, txs, month(2026, 2))
    expect(ledger[0]).toEqual({
      carriedInCents: 0,
      baseLimitCents: 60000,
      effectiveLimitCents: 60000,
      spentCents: 50000,
      remainingCents: 10000,
      carriedOutCents: 10000,
    })
    expect(ledger[1]).toEqual({
      carriedInCents: 10000,
      baseLimitCents: 60000,
      effectiveLimitCents: 70000,
      spentCents: 40000,
      remainingCents: 30000,
      carriedOutCents: 30000,
    })
  })

  it('a reference month before creation still yields a sane single-month ledger', () => {
    const b = budget({ budget_type: 'flex', monthly_limit_cents: 60000, created_at: noon('2026-05') })
    const ledger = budgetLedgerForMonth(b, [expense('groceries', '2026-03', 10000)], month(2026, 3))
    expect(ledger).toHaveLength(1)
    expect(ledger[0].carriedInCents).toBe(0)
  })
})

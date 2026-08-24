import { describe, it, expect } from 'vitest'
import { budgetStatusForMonth } from '@/lib/finance/budgets'
import { monthSpendCents } from '@/lib/finance/financialHealth'
import { personSummary } from '@/lib/finance/personSummary'
import type { Budget, Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24 (minor, date-regime family) — the remaining engines that
// bucketed by raw `new Date(tx.date)` local getters: budgets spend,
// financial-health month spend, and personSummary's interval filter. A
// date-only row ("2026-06-01", the legacy import shape) parses as UTC
// midnight = the previous local day west of UTC, so first-of-month money
// landed in the previous month — inconsistently with the insights engine,
// which received the spec-027 A2 parseLocalDate guard for exactly this.
// Runs under vitest.tz.config.ts (TZ=America/New_York).
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0
function expense(date: string, cents: number, over: Partial<Transaction> = {}): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: 'M',
    category: 'groceries',
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date,
    created_by: 'u',
    created_at: '2026-06-15T12:00:00.000Z',
    updated_at: '2026-06-15T12:00:00.000Z',
    owner_ids: [],
    shares: {},
    tags: [],
    notes: null,
    ...over,
  }
}

const budget: Budget = {
  id: 'b1',
  household_id: 'hh',
  category: 'groceries',
  monthly_limit_cents: 60_000,
  budget_type: 'fixed',
  rollover_cap_cents: null,
  person_id: null,
  created_at: '2026-06-01T12:00:00.000Z',
}

describe('date-only rows under TZ=America/New_York', () => {
  it('budget spend counts a date-only first-of-month expense in that month', () => {
    const status = budgetStatusForMonth(budget, [expense('2026-06-01', 12_00)], new Date(2026, 5, 15))
    expect(status.spentCents).toBe(12_00)
  })

  it('financial-health month spend counts a date-only first-of-month expense', () => {
    expect(monthSpendCents([expense('2026-06-01', 12_00)], new Date(2026, 5, 15))).toBe(12_00)
  })

  it('personSummary keeps a date-only first-of-month expense inside a local month window', () => {
    const s = personSummary(
      [expense('2026-06-01', 12_00, { owner_ids: ['p1'], shares: { p1: 12_00 } })],
      'p1',
      new Date(2026, 5, 1),
      new Date(2026, 6, 1)
    )
    expect(s.expenses).toBe(12_00)
  })
})

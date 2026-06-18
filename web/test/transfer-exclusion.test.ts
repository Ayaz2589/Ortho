// Transfers must never count as spending; a reimbursement settles the balance.
import { describe, it, expect } from 'vitest'
import { expenseTotal } from '@/lib/format'
import { balanceBetween } from '@/lib/balances'
import type { Transaction } from '@/lib/types'

const tx = (o: Partial<Transaction>): Transaction =>
  ({ id: '', household_id: 'h', merchant: '', category: 'groceries', kind: 'expense', amount_cents: 0, source: '', date: '2026-06-15T12:00:00.000Z', created_by: 'u', created_at: '', updated_at: '', owner_ids: [], shares: {}, paid_by: null, ...o }) as Transaction

describe('transfers are not spending', () => {
  it('expenseTotal ignores transfer rows', () => {
    const items = [
      tx({ kind: 'expense', amount_cents: 10000 }),
      tx({ kind: 'transfer', category: 'transfer', amount_cents: 5000 }),
    ]
    expect(expenseTotal(items)).toBe(10000)
  })

  it('a reimbursement settles the balance to zero (and does not change spend)', () => {
    const expense = tx({ kind: 'expense', paid_by: 'p1', owner_ids: ['p1', 'p2'], shares: { p1: 10000, p2: 5000 }, amount_cents: 15000 })
    const reimb = tx({ kind: 'transfer', category: 'transfer', paid_by: 'p2', owner_ids: ['p1'], shares: { p1: 5000 }, amount_cents: 5000 })
    expect(balanceBetween('p1', 'p2', [expense])).toBe(5000)
    expect(balanceBetween('p1', 'p2', [expense, reimb])).toBe(0)
    // The reimbursement adds nothing to spend: total stays the expense's 15000.
    expect(expenseTotal([expense])).toBe(15000)
    expect(expenseTotal([expense, reimb])).toBe(15000)
  })
})

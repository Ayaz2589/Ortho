import { describe, it, expect } from 'vitest'
import { computeShares, orderedOwnerIds } from '@/lib/splits'
import { buildTransaction } from './builders'

// Guard (FR-005/FR-013): the generator must NOT fork split math. A known
// leftover-cent case built by the generator must equal computeShares() called
// directly on the canonical ordering.
describe('generator reuses lib/splits (no forked math)', () => {
  it('even split with a leftover cent matches computeShares exactly', () => {
    const owners = ['p-b', 'p-a', 'p-c'] // deliberately unordered
    const amount = 1000 // /3 → 333,333,334 with a leftover cent
    const gt = buildTransaction({
      id: 'reuse-1',
      householdId: 'hh',
      merchant: 'Test',
      category: 'groceries',
      kind: 'expense',
      amountCents: amount,
      source: 'Checking',
      date: '2027-07-10T12:00:00.000Z',
      createdBy: 'p-a',
      owners,
    })
    const expected = computeShares(amount, orderedOwnerIds(owners), { method: 'even' })
    // shares map on the row equals the canonical computeShares output
    expect(gt.transaction.shares).toEqual(expected)
    // owner_ids are canonicalized
    expect(gt.transaction.owner_ids).toEqual(orderedOwnerIds(owners))
    // share rows agree with the map and reconcile
    const sum = gt.shares.reduce((n, s) => n + s.amount_cents, 0)
    expect(sum).toBe(amount)
  })

  it('percent split matches computeShares on the canonical order', () => {
    const owners = ['p-y', 'p-x']
    const amount = 13337
    const percents = { 'p-x': 70, 'p-y': 30 }
    const gt = buildTransaction({
      id: 'reuse-2',
      householdId: 'hh',
      merchant: 'Test',
      category: 'dining',
      kind: 'expense',
      amountCents: amount,
      source: 'Checking',
      date: '2027-07-10T12:00:00.000Z',
      createdBy: 'p-x',
      owners,
      split: { method: 'percent', percents },
    })
    expect(gt.transaction.shares).toEqual(
      computeShares(amount, orderedOwnerIds(owners), { method: 'percent', percents })
    )
  })
})

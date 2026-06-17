import { describe, it, expect } from 'vitest'
import { toTransaction } from '../../scripts/import/engine/toTransaction'
import type { ParsedTransaction } from '../../scripts/import/engine/types'

const base: ParsedTransaction = {
  dateISO: '2026-05-04T12:00:00.000Z',
  rawDescription: 'ACH DEBIT, VERIZON',
  merchant: 'Verizon',
  amountCents: 8999,
  kind: 'expense',
  section: 'Electronic Payments',
  category: 'utilities',
  excluded: false,
  excludeReason: null,
  duplicate: false,
  ownerIds: [],
  splits: null,
}
const NOW = '2026-06-15T00:00:00.000Z'
const CTX = { createdBy: 'u1', householdId: 'h1', defaultOwnerId: 'p1' }

describe('toTransaction', () => {
  it('single (default) owner → owned in full by the default person', () => {
    const tx = toTransaction(base, 'TD Bank', CTX, 'id1', NOW)
    expect(tx).toMatchObject({
      id: 'id1',
      household_id: 'h1',
      created_by: 'u1',
      owner_ids: ['p1'],
      source: 'TD Bank',
      amount_cents: 8999,
      category: 'utilities',
      kind: 'expense',
      date: base.dateISO,
    })
    expect(tx.shares).toEqual({ p1: 8999 })
  })

  it('an explicit single owner gets the full amount', () => {
    const tx = toTransaction({ ...base, ownerIds: ['p2'] }, 'TD Bank', CTX, 'id2', NOW)
    expect(tx.owner_ids).toEqual(['p2'])
    expect(tx.shares).toEqual({ p2: 8999 })
    expect(tx.created_by).toBe('u1')
  })

  it('multiple owners split evenly in cents by default', () => {
    const tx = toTransaction({ ...base, ownerIds: ['p1', 'p2'] }, 'TD Bank', CTX, 'id3', NOW)
    expect(tx).toMatchObject({ household_id: 'h1', owner_ids: ['p1', 'p2'] })
    expect(tx.shares).toEqual({ p1: 4500, p2: 4499 }) // 8999 even → leftover cent to first
  })

  it('canonicalizes owner order so the leftover cent matches the apps (scrambled input)', () => {
    // Owners given in reverse order. orderedOwnerIds sorts them to [p1, p2], so the
    // leftover cent of the odd amount lands on p1 — the same owner web/iOS would
    // pick — not on whoever was parsed/typed first. Without canonicalization this
    // would be { p2: 4500, p1: 4499 }.
    const tx = toTransaction({ ...base, ownerIds: ['p2', 'p1'] }, 'TD Bank', CTX, 'id-order', NOW)
    expect(tx.shares).toEqual({ p1: 4500, p2: 4499 })
    expect(Object.values(tx.shares).reduce((a, b) => a + b, 0)).toBe(8999)
  })

  it('converts custom percent splits to cents (remainder to first owner)', () => {
    const tx = toTransaction(
      { ...base, ownerIds: ['p1', 'p2'], splits: { p1: 70, p2: 30 } },
      'TD Bank',
      CTX,
      'id4',
      NOW
    )
    expect(tx.shares).toEqual({ p1: 6300, p2: 2699 })
    expect(Object.values(tx.shares).reduce((a, b) => a + b, 0)).toBe(8999)
  })

  it('throws if there is no household', () => {
    expect(() =>
      toTransaction({ ...base, ownerIds: ['p1', 'p2'] }, 'TD Bank', { ...CTX, householdId: null }, 'id5', NOW)
    ).toThrow()
  })
})

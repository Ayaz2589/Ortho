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

describe('toTransaction', () => {
  it('single (default) owner → personal, no household, no splits', () => {
    const tx = toTransaction(base, 'TD Bank', { createdBy: 'u1', householdId: 'h1' }, 'id1', NOW)
    expect(tx).toMatchObject({
      id: 'id1',
      scope: 'personal',
      household_id: null,
      created_by: 'u1',
      owner_ids: ['u1'],
      splits: null,
      source: 'TD Bank',
      amount_cents: 8999,
      category: 'utilities',
      kind: 'expense',
      date: base.dateISO,
    })
  })

  it('an explicit single owner is still personal', () => {
    const tx = toTransaction({ ...base, ownerIds: ['u2'] }, 'TD Bank', { createdBy: 'u1', householdId: 'h1' }, 'id2', NOW)
    expect(tx.scope).toBe('personal')
    expect(tx.owner_ids).toEqual(['u2'])
    expect(tx.created_by).toBe('u1')
  })

  it('multiple owners → shared with the operator household', () => {
    const tx = toTransaction({ ...base, ownerIds: ['u1', 'u2'] }, 'TD Bank', { createdBy: 'u1', householdId: 'h1' }, 'id3', NOW)
    expect(tx).toMatchObject({ scope: 'shared', household_id: 'h1', owner_ids: ['u1', 'u2'] })
  })

  it('carries custom splits through', () => {
    const tx = toTransaction(
      { ...base, ownerIds: ['u1', 'u2'], splits: { u1: 70, u2: 30 } },
      'TD Bank',
      { createdBy: 'u1', householdId: 'h1' },
      'id4',
      NOW
    )
    expect(tx.splits).toEqual({ u1: 70, u2: 30 })
  })

  it('throws if a multi-owner row has no household', () => {
    expect(() =>
      toTransaction({ ...base, ownerIds: ['u1', 'u2'] }, 'TD Bank', { createdBy: 'u1', householdId: null }, 'id5', NOW)
    ).toThrow()
  })
})

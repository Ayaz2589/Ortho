// Spec 031 US11: Recurring split memory.
// getLastSplitForMerchant returns the most-recent multi-owner split for a merchant,
// or null for unknown merchants or solo transactions.
import { describe, it, expect } from 'vitest'
import { getLastSplitForMerchant } from '@/lib/splitMemory'
import type { Transaction } from '@/lib/types'

function makeTx(over: Partial<Transaction>): Transaction {
  return {
    id: 'tx', household_id: 'h1', merchant: 'Netflix', category: 'subs', kind: 'expense',
    amount_cents: 2000, source: '', date: '2026-01-01T12:00:00.000Z', created_by: 'u',
    created_at: '', updated_at: '', paid_by: 'u1', owner_ids: ['u1', 'u2'],
    shares: { u1: 1000, u2: 1000 }, ...over,
  }
}

describe('getLastSplitForMerchant', () => {
  it('returns split for known multi-owner merchant', () => {
    const txns = [makeTx({ merchant: 'Netflix', owner_ids: ['u1', 'u2'], shares: { u1: 1000, u2: 1000 } })]
    const result = getLastSplitForMerchant('Netflix', txns)
    expect(result).not.toBeNull()
    expect(result?.ownerIds).toEqual(['u1', 'u2'])
    expect(result?.shares).toEqual({ u1: 1000, u2: 1000 })
  })

  it('returns null for unknown merchant', () => {
    const txns = [makeTx({ merchant: 'Netflix' })]
    expect(getLastSplitForMerchant('Costco', txns)).toBeNull()
  })

  it('returns null for solo prior transaction (owner_ids.length === 1)', () => {
    const txns = [makeTx({ merchant: 'Netflix', owner_ids: ['u1'], shares: { u1: 2000 } })]
    expect(getLastSplitForMerchant('Netflix', txns)).toBeNull()
  })

  it('returns the MOST RECENT multi-person transaction (desc by date)', () => {
    const txns = [
      makeTx({ id: 'old', merchant: 'Netflix', date: '2026-01-01T12:00:00.000Z', shares: { u1: 1000, u2: 1000 } }),
      makeTx({ id: 'new', merchant: 'Netflix', date: '2026-06-15T12:00:00.000Z', shares: { u1: 500, u2: 1500 } }),
    ]
    const result = getLastSplitForMerchant('Netflix', txns)
    expect(result?.shares).toEqual({ u1: 500, u2: 1500 })
  })

  it('is case-sensitive: "Netflix" ≠ "netflix"', () => {
    const txns = [makeTx({ merchant: 'Netflix' })]
    expect(getLastSplitForMerchant('netflix', txns)).toBeNull()
  })

  it('skips transfer transactions', () => {
    const txns = [makeTx({ merchant: 'Netflix', kind: 'transfer' })]
    expect(getLastSplitForMerchant('Netflix', txns)).toBeNull()
  })
})

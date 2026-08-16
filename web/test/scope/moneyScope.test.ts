import { describe, it, expect } from 'vitest'
import type { Transaction } from '@/lib/types'
import {
  HOUSEHOLD_SCOPE,
  personScope,
  resolveScope,
  scopeTransactions,
} from '@/lib/scope/moneyScope'

// spec 051 — the MoneyScope primitive. Pure projection; no React, no DB.

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const C = 'cccccccc-0000-0000-0000-000000000003'

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    household_id: 'hh',
    merchant: 'Grocer',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 6000,
    source: '',
    date: '2026-08-10T12:00:00.000Z',
    created_by: 'user-1',
    created_at: '2026-08-10T12:00:00.000Z',
    updated_at: '2026-08-10T12:00:00.000Z',
    paid_by: A,
    owner_ids: [A, B, C],
    shares: { [A]: 2000, [B]: 2000, [C]: 2000 },
    notes: null,
    ...over,
  } as Transaction
}

describe('household scope is a strict no-op', () => {
  it('returns the very same array reference', () => {
    const txs = [tx(), tx({ id: 'tx-2' })]
    expect(scopeTransactions(txs, HOUSEHOLD_SCOPE)).toBe(txs)
  })

  it('leaves an empty ledger alone', () => {
    const txs: Transaction[] = []
    expect(scopeTransactions(txs, HOUSEHOLD_SCOPE)).toBe(txs)
  })
})

describe('person scope — expenses and income', () => {
  it('narrows a shared expense to the stored share', () => {
    const [only] = scopeTransactions([tx()], personScope(B))
    expect(only.amount_cents).toBe(2000)
    expect(only.owner_ids).toEqual([B])
    expect(only.shares).toEqual({ [B]: 2000 })
  })

  it('drops a transaction the person does not own', () => {
    const t = tx({ owner_ids: [A], shares: { [A]: 6000 } })
    expect(scopeTransactions([t], personScope(B))).toEqual([])
  })

  it('uses the STORED share, never a recomputed even split', () => {
    const t = tx({ owner_ids: [A, B], shares: { [A]: 5000, [B]: 1000 } })
    const [only] = scopeTransactions([t], personScope(B))
    expect(only.amount_cents).toBe(1000)
  })

  it('applies the same rule to income', () => {
    const t = tx({ kind: 'income', paid_by: null, amount_cents: 9000, shares: { [A]: 3000, [B]: 3000, [C]: 3000 } })
    const [only] = scopeTransactions([t], personScope(C))
    expect(only.kind).toBe('income')
    expect(only.amount_cents).toBe(3000)
  })

  it('preserves identity fields so downstream engines still work', () => {
    const [only] = scopeTransactions([tx()], personScope(A))
    expect(only.id).toBe('tx-1')
    expect(only.date).toBe('2026-08-10T12:00:00.000Z')
    expect(only.category).toBe('groceries')
    expect(only.kind).toBe('expense')
  })

  it('falls back to an even split when share rows are absent', () => {
    const t = tx({ shares: {} as Record<string, number> })
    const [only] = scopeTransactions([t], personScope(B))
    expect(only.amount_cents).toBe(2000)
  })

  it('does not mutate the input transaction', () => {
    const t = tx()
    scopeTransactions([t], personScope(B))
    expect(t.amount_cents).toBe(6000)
    expect(t.owner_ids).toEqual([A, B, C])
  })
})

describe('person scope — transfers stay directional', () => {
  const transfer = (from: string, to: string) =>
    tx({ kind: 'transfer', category: 'transfer', amount_cents: 4000, paid_by: from, owner_ids: [to], shares: {} })

  it('keeps a transfer the person sent, at full amount', () => {
    const [only] = scopeTransactions([transfer(A, B)], personScope(A))
    expect(only.amount_cents).toBe(4000)
    expect(only.kind).toBe('transfer')
  })

  it('keeps a transfer the person received, at full amount', () => {
    const [only] = scopeTransactions([transfer(A, B)], personScope(B))
    expect(only.amount_cents).toBe(4000)
  })

  it('never splits a transfer', () => {
    const [only] = scopeTransactions([transfer(A, B)], personScope(B))
    expect(only.owner_ids).toEqual([B])
  })

  it('drops a transfer between two other people', () => {
    expect(scopeTransactions([transfer(A, B)], personScope(C))).toEqual([])
  })
})

describe('scoped amounts reconcile to the household total', () => {
  it('sums back to the original amount across every owner', () => {
    const t = tx({ amount_cents: 10_001, shares: { [A]: 3334, [B]: 3334, [C]: 3333 } })
    const total = [A, B, C]
      .map((p) => scopeTransactions([t], personScope(p))[0]?.amount_cents ?? 0)
      .reduce((s, n) => s + n, 0)
    expect(total).toBe(10_001)
  })

  it('holds for owner sets of every size from 1 to 6', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `p-${i}`)
    for (let n = 1; n <= 6; n++) {
      const owners = ids.slice(0, n)
      const amount = 10_000 + n // deliberately not divisible by n
      const base = Math.floor(amount / n)
      const shares: Record<string, number> = {}
      owners.forEach((id, i) => (shares[id] = base + (i < amount - base * n ? 1 : 0)))
      const t = tx({ amount_cents: amount, owner_ids: owners, shares })
      const total = owners
        .map((p) => scopeTransactions([t], personScope(p))[0]?.amount_cents ?? 0)
        .reduce((s, x) => s + x, 0)
      expect(total).toBe(amount)
    }
  })
})

describe('resolveScope', () => {
  it('keeps a person scope when the person is still active', () => {
    expect(resolveScope(personScope(A), [A, B])).toEqual(personScope(A))
  })

  it('falls back to household when the person is gone', () => {
    expect(resolveScope(personScope(C), [A, B])).toEqual(HOUSEHOLD_SCOPE)
  })

  it('leaves household scope alone', () => {
    expect(resolveScope(HOUSEHOLD_SCOPE, [A])).toEqual(HOUSEHOLD_SCOPE)
  })
})

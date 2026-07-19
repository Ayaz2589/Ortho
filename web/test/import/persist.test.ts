import { describe, it, expect } from 'vitest'
import { txRecord, shareRows, persist } from '../../scripts/import/db/persist'
import { balanceBetween } from '../../lib/balances'
import type { Transaction } from '../../lib/types'

const single: Transaction = {
  id: 't1',
  household_id: 'h1',
  merchant: 'Verizon',
  category: 'utilities',
  kind: 'expense',
  amount_cents: 8999,
  source: 'TD Bank',
  date: '2026-05-04T12:00:00.000Z',
  created_by: 'u1',
  created_at: '',
  updated_at: '',
  owner_ids: ['u1'],
  shares: { u1: 8999 },
}
const multi: Transaction = {
  ...single,
  id: 't2',
  owner_ids: ['u1', 'u2'],
  shares: { u1: 6000, u2: 2999 },
}

describe('txRecord', () => {
  it('emits exactly the web store insert shape (incl. paid_by; no owner_ids/shares/scope)', () => {
    expect(txRecord(single)).toEqual({
      id: 't1',
      household_id: 'h1',
      merchant: 'Verizon',
      category: 'utilities',
      kind: 'expense',
      amount_cents: 8999,
      source: 'TD Bank',
      date: '2026-05-04T12:00:00.000Z',
      created_by: 'u1',
      // paid_by is part of the store's insert shape; a payer-less row writes null.
      paid_by: null,
    })
  })

  it('persists paid_by when the imported transaction has a payer', () => {
    expect(txRecord({ ...single, paid_by: 'u1' })).toMatchObject({ paid_by: 'u1' })
  })
})

describe('shareRows', () => {
  it('writes one full-amount row for a single-owner transaction', () => {
    expect(shareRows(single)).toEqual([{ transaction_id: 't1', person_id: 'u1', amount_cents: 8999 }])
  })
  it('writes one cents row per owner for a multi-owner transaction', () => {
    expect(shareRows(multi)).toEqual([
      { transaction_id: 't2', person_id: 'u1', amount_cents: 6000 },
      { transaction_id: 't2', person_id: 'u2', amount_cents: 2999 },
    ])
  })
})

describe('persist', () => {
  it('calls upsert_transaction RPC for each transaction and returns the count', async () => {
    const rpcCalls: string[] = []
    const fake = {
      rpc: (name: string) => {
        rpcCalls.push(name)
        return Promise.resolve({ error: null })
      },
    } as never

    const n = await persist(fake, [single, multi])
    expect(n).toBe(2)
    expect(rpcCalls).toEqual(['upsert_transaction', 'upsert_transaction'])
  })

  it('throws UPSERT_TX (and stops) when the RPC errors', async () => {
    let calls = 0
    const fake = {
      rpc: () => {
        calls++
        return Promise.resolve({ error: { message: 'SHARES_MISMATCH' } })
      },
    } as never
    await expect(persist(fake, [single, multi])).rejects.toThrow(/UPSERT_TX/)
    expect(calls).toBe(1) // stops after first failure
  })
})


// --- Spec 020: paid_by must survive the import so settle-up counts CLI rows. ---
describe('paid_by → settle-up correctness', () => {
  const expense: Transaction = {
    ...multi, id: 't3', paid_by: 'u1', amount_cents: 10000,
    owner_ids: ['u1', 'u2'], shares: { u1: 6000, u2: 4000 },
  }
  it('an imported expense with a payer is counted in balanceBetween (u2 owes u1)', () => {
    expect(txRecord(expense).paid_by).toBe('u1')
    expect(balanceBetween('u1', 'u2', [expense])).toBe(4000)
  })
  it('regression: a payer-less expense is silently dropped from settle-up', () => {
    const { paid_by: _omit, ...noPayer } = expense
    expect(balanceBetween('u1', 'u2', [noPayer as Transaction])).toBe(0)
  })
})

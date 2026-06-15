import { describe, it, expect } from 'vitest'
import { txRecord, shareRows, persist } from '../../scripts/import/db/persist'
import type { Transaction } from '../../lib/types'

const personal: Transaction = {
  id: 't1',
  household_id: null,
  merchant: 'Verizon',
  category: 'utilities',
  kind: 'expense',
  scope: 'personal',
  amount_cents: 8999,
  source: 'TD Bank',
  date: '2026-05-04T12:00:00.000Z',
  created_by: 'u1',
  created_at: '',
  updated_at: '',
  owner_ids: ['u1'],
  splits: null,
}
const shared: Transaction = {
  ...personal,
  id: 't2',
  household_id: 'h1',
  scope: 'shared',
  owner_ids: ['u1', 'u2'],
  splits: { u1: 70, u2: 30 },
}

describe('txRecord', () => {
  it('emits exactly the web store insert shape (no owner_ids/splits)', () => {
    expect(txRecord(personal)).toEqual({
      id: 't1',
      household_id: null,
      merchant: 'Verizon',
      category: 'utilities',
      kind: 'expense',
      scope: 'personal',
      amount_cents: 8999,
      source: 'TD Bank',
      date: '2026-05-04T12:00:00.000Z',
      created_by: 'u1',
    })
  })
})

describe('shareRows', () => {
  it('writes no shares for a personal transaction', () => {
    expect(shareRows(personal)).toEqual([])
  })
  it('writes one row per owner for a shared transaction, percent from effectiveSplits', () => {
    expect(shareRows(shared)).toEqual([
      { transaction_id: 't2', user_id: 'u1', percent: 70 },
      { transaction_id: 't2', user_id: 'u2', percent: 30 },
    ])
  })
})

describe('persist', () => {
  it('inserts transactions and (only) shared shares through the client', async () => {
    const inserts: Array<{ table: string; payload: unknown }> = []
    const fake = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push({ table, payload })
          return Promise.resolve({ error: null })
        },
      }),
    } as never

    const n = await persist(fake, [personal, shared])
    expect(n).toBe(2)
    expect(inserts.filter((i) => i.table === 'transactions')).toHaveLength(2)
    expect(inserts.filter((i) => i.table === 'transaction_shares')).toHaveLength(1)
  })

  it('throws (and stops) when an insert errors', async () => {
    const fake = {
      from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }),
    } as never
    await expect(persist(fake, [personal])).rejects.toThrow(/INSERT_TX/)
  })
})

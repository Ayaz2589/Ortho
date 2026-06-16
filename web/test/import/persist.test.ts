import { describe, it, expect } from 'vitest'
import { txRecord, shareRows, persist } from '../../scripts/import/db/persist'
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
  it('emits exactly the web store insert shape (no owner_ids/shares/scope)', () => {
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
    })
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
  it('inserts each transaction and its materialized shares through the client', async () => {
    const inserts: Array<{ table: string; payload: unknown }> = []
    const fake = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push({ table, payload })
          return Promise.resolve({ error: null })
        },
      }),
    } as never

    const n = await persist(fake, [single, multi])
    expect(n).toBe(2)
    expect(inserts.filter((i) => i.table === 'transactions')).toHaveLength(2)
    // One transaction_shares insert per transaction (each a row array).
    expect(inserts.filter((i) => i.table === 'transaction_shares')).toHaveLength(2)
  })

  it('throws (and stops) when an insert errors', async () => {
    const fake = {
      from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }),
    } as never
    await expect(persist(fake, [single])).rejects.toThrow(/INSERT_TX/)
  })
})

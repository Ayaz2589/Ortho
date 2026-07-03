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

// --- Spec 013 US5/A2: compensating writes — no share-less parent may persist. ---

type QCall = [string, ...unknown[]]
/** FIFO mock: each awaited query consumes the next queued result. */
function mockQueue(results: Array<{ data: unknown; error: unknown }>) {
  const calls: QCall[] = []
  let i = 0
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit', 'update', 'delete', 'insert']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(results[i++] ?? { data: null, error: null }).then(res, rej)
  const supabase = {
    from: (t: string) => {
      calls.push(['from', t])
      return builder
    },
  } as never
  return { supabase, calls }
}

const ok = { data: null, error: null }
const boom = { data: null, error: { message: 'boom' } }

describe('persist — compensation on shares failure (013/US5)', () => {
  it('deletes the just-inserted parent when the shares insert fails, then throws', async () => {
    // insert tx OK → insert shares FAILS → compensating delete OK
    const { supabase, calls } = mockQueue([ok, boom, ok])
    await expect(persist(supabase, [multi])).rejects.toThrow(/INSERT_SHARES.*rolled back/)
    expect(calls).toContainEqual(['delete'])
    expect(calls).toContainEqual(['eq', 'id', 't2'])
  })
  it('reports BOTH failures (and the orphan id) when the compensating delete also fails', async () => {
    const { supabase } = mockQueue([ok, boom, boom])
    await expect(persist(supabase, [multi])).rejects.toThrow(/ROLLBACK_FAILED.*t2/)
  })
  it('a clean batch still writes parent + shares with no delete', async () => {
    const { supabase, calls } = mockQueue([ok, ok])
    await expect(persist(supabase, [multi])).resolves.toBe(1)
    expect(calls.find((c) => c[0] === 'delete')).toBeUndefined()
  })
})

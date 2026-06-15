import { describe, it, expect } from 'vitest'
import { getOne, listTransactions, createOne, updateOne, deleteOne } from '../../scripts/import/db/transactions'
import type { Transaction } from '../../lib/types'

/** Mock that returns a different result per table (for getOne's two queries). */
function mockTables(byTable: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<[string, ...unknown[]]> = []
  let current = ''
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'update', 'delete', 'insert']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  const result = () => byTable[current] ?? { data: null, error: null }
  builder.maybeSingle = () => Promise.resolve(result())
  builder.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
  const supabase = {
    from: (t: string) => {
      current = t
      calls.push(['from', t])
      return builder
    },
  } as never
  return { supabase, calls }
}

type Call = [string, ...unknown[]]

/** Chainable Supabase mock: records calls; awaitable (thenable) to `result`. */
function mock(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'update', 'delete', 'insert']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.maybeSingle = () => Promise.resolve(result)
  builder.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  const supabase = {
    from: (t: string) => {
      calls.push(['from', t])
      return builder
    },
  } as never
  return { supabase, calls }
}

const baseTx: Transaction = {
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
const sharedTx: Transaction = { ...baseTx, scope: 'shared', household_id: 'h1', owner_ids: ['u1', 'u2'], splits: { u1: 70, u2: 30 } }

describe('getOne', () => {
  it('returns null when the row is absent (not found / RLS-hidden)', async () => {
    const { supabase } = mockTables({ transactions: { data: null, error: null } })
    expect(await getOne(supabase, 'missing')).toBeNull()
  })
  it('rehydrates owner_ids/splits from transaction_shares when shared', async () => {
    const { supabase } = mockTables({
      transactions: { data: { ...sharedTx, owner_ids: [], splits: null }, error: null },
      transaction_shares: { data: [{ user_id: 'u1', percent: 70 }, { user_id: 'u2', percent: 30 }], error: null },
    })
    const tx = await getOne(supabase, 't1')
    expect(tx?.owner_ids).toEqual(['u1', 'u2'])
    expect(tx?.splits).toEqual({ u1: 70, u2: 30 })
  })
  it('defaults owners to the creator when there are no shares', async () => {
    const { supabase } = mockTables({
      transactions: { data: { ...baseTx, owner_ids: [], splits: null }, error: null },
      transaction_shares: { data: [], error: null },
    })
    const tx = await getOne(supabase, 't1')
    expect(tx?.owner_ids).toEqual(['u1'])
    expect(tx?.splits).toBeNull()
  })
  it('throws on a DB error', async () => {
    const { supabase } = mockTables({ transactions: { data: null, error: { message: 'boom' } } })
    await expect(getOne(supabase, 't1')).rejects.toThrow(/GET_TX/)
  })
})

describe('listTransactions', () => {
  it('scopes to created_by and applies filters + order + limit (non-admin)', async () => {
    const { supabase, calls } = mock({ data: [baseTx], error: null })
    const rows = await listTransactions(
      supabase,
      'u1',
      { startISO: '2026-05-01T00:00:00.000Z', endISO: '2026-06-01T00:00:00.000Z', category: 'utilities', limit: 10 },
      false
    )
    expect(rows).toEqual([baseTx])
    expect(calls).toContainEqual(['eq', 'created_by', 'u1'])
    expect(calls).toContainEqual(['eq', 'category', 'utilities'])
    expect(calls).toContainEqual(['gte', 'date', '2026-05-01T00:00:00.000Z'])
    expect(calls).toContainEqual(['lt', 'date', '2026-06-01T00:00:00.000Z'])
    expect(calls).toContainEqual(['order', 'date', { ascending: false }])
    expect(calls).toContainEqual(['limit', 10])
  })
  it('admin mode does not scope by created_by and defaults limit to 200', async () => {
    const { supabase, calls } = mock()
    await listTransactions(supabase, 'u1', {}, true)
    expect(calls).not.toContainEqual(['eq', 'created_by', 'u1'])
    expect(calls).toContainEqual(['limit', 200])
  })
})

describe('createOne', () => {
  it('inserts the txRecord and no shares for a personal transaction', async () => {
    const { supabase, calls } = mock({ data: null, error: null })
    await createOne(supabase, baseTx)
    expect(calls).toContainEqual(['from', 'transactions'])
    expect(calls.filter((c) => c[0] === 'insert')).toHaveLength(1)
    expect(calls).not.toContainEqual(['from', 'transaction_shares'])
  })
  it('inserts shares for a shared transaction', async () => {
    const { supabase, calls } = mock({ data: null, error: null })
    await createOne(supabase, sharedTx)
    expect(calls).toContainEqual(['from', 'transaction_shares'])
    expect(calls.filter((c) => c[0] === 'insert')).toHaveLength(2)
  })
})

describe('updateOne', () => {
  it('updates by id, then rewrites shares (delete + insert) for shared', async () => {
    const { supabase, calls } = mock({ data: null, error: null })
    await updateOne(supabase, sharedTx)
    expect(calls).toContainEqual(['update', expect.objectContaining({ id: 't1', scope: 'shared' })])
    expect(calls).toContainEqual(['eq', 'id', 't1'])
    expect(calls).toContainEqual(['delete'])
    expect(calls).toContainEqual(['eq', 'transaction_id', 't1'])
    expect(calls.filter((c) => c[0] === 'insert')).toHaveLength(1)
  })
  it('a personal update deletes shares and inserts none', async () => {
    const { supabase, calls } = mock({ data: null, error: null })
    await updateOne(supabase, baseTx)
    expect(calls).toContainEqual(['delete'])
    expect(calls.filter((c) => c[0] === 'insert')).toHaveLength(0)
  })
})

describe('deleteOne', () => {
  it('issues a single delete().eq(id) on transactions', async () => {
    const { supabase, calls } = mock({ data: null, error: null })
    await deleteOne(supabase, 't1')
    expect(calls).toContainEqual(['from', 'transactions'])
    expect(calls).toContainEqual(['delete'])
    expect(calls).toContainEqual(['eq', 'id', 't1'])
  })
})

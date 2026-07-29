import { describe, expect, it, vi } from 'vitest'
import { transactionsSection, type TxRecord } from '../../lib/dataFile/sections/transactions'
import type { SectionPayload } from '../../lib/dataFile/envelope'
import { makeStore, tx } from './_fixtures'

const t = (k: string) => k

function payload(records: TxRecord[]): SectionPayload {
  return { key: 'transactions', sectionVersion: 1, records }
}

describe('transactions section', () => {
  it('serializes canonical USD cents with splits summing to amount', () => {
    const store = makeStore({
      transactions: [tx({ id: 't1', amount_cents: 10000, owner_ids: ['p1', 'p2'], shares: { p1: 6000, p2: 4000 } })],
    })
    const recs = transactionsSection.serialize(store)
    expect(recs).toHaveLength(1)
    expect(recs[0].amount_cents).toBe(10000)
    expect(recs[0].shares.p1 + recs[0].shares.p2).toBe(10000)
  })

  it('serializes tags as names and reads back to the same record shape', () => {
    const store = makeStore({
      tags: [{ id: 'tag-Bills', household_id: 'hh1', name: 'Bills', created_at: '2026-01-01T00:00:00.000Z' }],
      transactions: [tx({ id: 't1', tags: ['tag-Bills'] })],
    })
    const recs = transactionsSection.serialize(store)
    expect(recs[0].tags).toEqual(['Bills'])
    const readBack = transactionsSection.read(payload(recs))
    expect(readBack[0]).toEqual(recs[0])
  })

  it('round-trips losslessly (serialize → read → deepEqual)', () => {
    const store = makeStore({
      transactions: [
        tx({ id: 't1', merchant: 'Con Ed', category: 'utilities', amount_cents: 12345, owner_ids: ['p1', 'p2'], shares: { p1: 6173, p2: 6172 } }),
        tx({ id: 't2', kind: 'income', merchant: 'Payroll', category: 'salary', paid_by: 'p1', owner_ids: ['p1'], shares: { p1: 500000 }, amount_cents: 500000 }),
      ],
    })
    const recs = transactionsSection.serialize(store)
    expect(transactionsSection.read(payload(recs))).toEqual(recs)
  })

  it('resolves unknown owners/payer to the importing user, splits still sum', () => {
    const store = makeStore({ people: [{ id: 'p1', household_id: 'hh1', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-p1', sort_order: 0, removed_at: null, created_at: 'x' }] })
    const rec: TxRecord = {
      id: 'imported',
      date: '2026-05-01',
      merchant: 'Split Dinner',
      category: 'dining',
      kind: 'expense',
      amount_cents: 10000,
      source: 'Visa',
      notes: null,
      paid_by: 'ghost',
      owner_ids: ['p1', 'ghost'],
      shares: { p1: 6000, ghost: 4000 },
      tags: [],
    }
    transactionsSection.apply({ add: [rec], skipById: [], skipByContent: [] }, store, { now: '2026-07-27T00:00:00.000Z' })
    const created = store.added.transactions[0]
    expect(created.id).toBe('imported')
    // ghost collapses to p1; shares still sum to amount
    expect(created.owner_ids).toEqual(['p1'])
    expect(created.shares.p1).toBe(10000)
    expect(Object.values(created.shares).reduce((a, b) => a + b, 0)).toBe(10000)
    expect(created.paid_by).toBe('p1')
    expect(created.household_id).toBe('hh1')
  })

  it('keeps shares summing to amount when an imported record has non-empty owners but no shares', () => {
    const store = makeStore()
    const rec: TxRecord = {
      id: 'imp',
      date: '2026-05-01',
      merchant: 'Dinner',
      category: 'dining',
      kind: 'expense',
      amount_cents: 10001,
      source: 'Visa',
      notes: null,
      paid_by: 'p1',
      owner_ids: ['p1', 'p2'],
      shares: {}, // missing — must not yield all-zero shares
      tags: [],
    }
    transactionsSection.apply({ add: [rec], skipById: [], skipByContent: [] }, store, { now: 'now' })
    const created = store.added.transactions[0]
    expect(Object.values(created.shares).reduce((a, b) => a + b, 0)).toBe(10001)
    expect(created.owner_ids).toEqual(['p1', 'p2'])
  })

  it('creates a new tag at most once per import batch (no duplicate tag rows)', () => {
    // A non-deduping addTag (mimics the real store, whose addTag reads a stale
    // snapshot within one synchronous loop). Our batch cache must call it once.
    let n = 0
    const addTag = vi.fn((name: string) => ({ id: `tag-${++n}`, household_id: 'hh1', name, created_at: '' }))
    const store = { ...makeStore(), addTag } as ReturnType<typeof makeStore>
    const base: Omit<TxRecord, 'id' | 'merchant'> = { date: '2026-05-01', category: 'subs', kind: 'expense', amount_cents: 500, source: 'Visa', notes: null, paid_by: 'p1', owner_ids: ['p1'], shares: { p1: 500 }, tags: ['Bills'] }
    transactionsSection.apply(
      { add: [{ ...base, id: 'a', merchant: 'X' }, { ...base, id: 'b', merchant: 'Y' }], skipById: [], skipByContent: [] },
      store,
      { now: 'now' }
    )
    expect(addTag).toHaveBeenCalledTimes(1)
    // both transactions reference the same tag id
    expect(store.added.transactions[0].tags).toEqual(store.added.transactions[1].tags)
  })

  it('renderModel produces a titled table without throwing', () => {
    const store = makeStore({ transactions: [tx({})] })
    const recs = transactionsSection.serialize(store)
    const model = transactionsSection.renderModel(recs, {
      t,
      locale: 'en-US',
      currency: 'usd',
      rate: () => 1,
      formatMoney: (c) => `USD ${(c / 100).toFixed(2)}`,
      resolveUser: store.resolveUser,
    })
    expect(model.title).toBe('Transactions')
    expect(model.rows).toHaveLength(1)
  })
})

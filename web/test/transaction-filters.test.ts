import { describe, it, expect } from 'vitest'
import {
  filterTransactions,
  emptyCriteria,
  activeFilterCount,
  availableSources,
  monthBounds,
  type FilterContext,
} from '../lib/transactionFilters'
import type { Transaction } from '../lib/types'

const tx = (o: Partial<Transaction>): Transaction => ({
  id: '',
  household_id: 'h1',
  merchant: '',
  category: 'dining',
  kind: 'expense',
  amount_cents: 0,
  source: '',
  date: '2026-05-15T12:00:00.000Z',
  created_by: 'u1',
  created_at: '',
  updated_at: '',
  owner_ids: ['u1'],
  shares: {},
  ...o,
})

const CTX: FilterContext = { ownerNames: { u1: 'Ayaz', u2: 'Tasnuva' } }
const ids = (txs: Transaction[]) => txs.map((t) => t.id)

const SET: Transaction[] = [
  tx({ id: 'a', merchant: 'Bistro', category: 'dining', kind: 'expense', source: 'Amex Gold', household_id: 'h1', owner_ids: ['u1'], date: '2026-05-04T12:00:00.000Z' }),
  tx({ id: 'b', merchant: 'Blue Bottle', category: 'coffee', kind: 'expense', source: 'TD Bank', household_id: 'h1', owner_ids: ['u1'], date: '2026-05-10T12:00:00.000Z' }),
  tx({ id: 'c', merchant: 'Payroll', category: 'income', kind: 'income', source: 'TD Bank', household_id: 'h1', owner_ids: ['u2'], date: '2026-06-01T12:00:00.000Z' }),
  tx({ id: 'd', merchant: 'Whole Foods', category: 'groceries', kind: 'expense', source: 'Chase', household_id: 'h1', owner_ids: ['u1', 'u2'], date: '2026-04-20T12:00:00.000Z' }),
]

describe('filterTransactions — dimensions', () => {
  it('emptyCriteria returns everything', () => {
    expect(ids(filterTransactions(SET, emptyCriteria(), CTX))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('search matches merchant / source / category / owner-name', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), query: 'bistro' }, CTX))).toEqual(['a'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), query: 'td bank' }, CTX))).toEqual(['b', 'c'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), query: 'groceries' }, CTX))).toEqual(['d'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), query: 'tasnuva' }, CTX))).toEqual(['c', 'd'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), query: 'nope' }, CTX))).toEqual([])
  })
  it('category multi-select (OR within)', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), categories: ['dining', 'coffee'] }, CTX))).toEqual(['a', 'b'])
  })
  it('kind', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), kind: 'income' }, CTX))).toEqual(['c'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), kind: 'expense' }, CTX))).toEqual(['a', 'b', 'd'])
  })
  it('source multi-select (OR within)', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), sources: ['TD Bank', 'Chase'] }, CTX))).toEqual(['b', 'c', 'd'])
  })
  it('owner multi-select (intersection)', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), owners: ['u2'] }, CTX))).toEqual(['c', 'd'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), owners: ['u1'] }, CTX))).toEqual(['a', 'b', 'd'])
  })
  it('date half-open window via monthBounds(May)', () => {
    const { dateFrom, dateTo } = monthBounds('2026-05')
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), dateFrom, dateTo }, CTX))).toEqual(['a', 'b'])
  })
  it('dateFrom only / dateTo only', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), dateFrom: '2026-05-01T00:00:00.000Z', dateTo: null }, CTX))).toEqual(['a', 'b', 'c'])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), dateFrom: null, dateTo: '2026-05-01T00:00:00.000Z' }, CTX))).toEqual(['d'])
  })
})

describe('filterTransactions — AND across dimensions', () => {
  it('kind ∧ source', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), kind: 'expense', sources: ['TD Bank'] }, CTX))).toEqual(['b'])
  })
  it('category ∧ month', () => {
    const { dateFrom, dateTo } = monthBounds('2026-05')
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), categories: ['dining'], dateFrom, dateTo }, CTX))).toEqual(['a'])
  })
  it('selected-but-absent source/owner matches nothing (no throw)', () => {
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), sources: ['Wells Fargo'] }, CTX))).toEqual([])
    expect(ids(filterTransactions(SET, { ...emptyCriteria(), owners: ['u9'] }, CTX))).toEqual([])
  })
})

describe('helpers', () => {
  it('activeFilterCount counts non-default dimensions', () => {
    expect(activeFilterCount(emptyCriteria())).toBe(0)
    expect(activeFilterCount({ ...emptyCriteria(), categories: ['dining'], kind: 'income', dateFrom: 'x' })).toBe(3)
    expect(activeFilterCount({ ...emptyCriteria(), query: '  ' })).toBe(0) // blank query is not active
  })
  it('availableSources is distinct, non-empty, alphabetized', () => {
    expect(availableSources(SET)).toEqual(['Amex Gold', 'Chase', 'TD Bank'])
  })
  it('monthBounds rolls December into next year and rejects bad input', () => {
    expect(monthBounds('2025-12')).toEqual({ dateFrom: '2025-12-01T00:00:00.000Z', dateTo: '2026-01-01T00:00:00.000Z' })
    expect(() => monthBounds('2026-13')).toThrow()
    expect(() => monthBounds('nope')).toThrow()
  })
})

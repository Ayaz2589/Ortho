// Spec 013 US5/A1: `tx list` must produce the same result set the apps show.
// The CLI narrows by date window in SQL, then runs the shared
// `filterTransactions` in-process — these tests lock the flag → FilterCriteria
// mapping and the end-to-end identity with the apps' filtering brain.
import { describe, it, expect } from 'vitest'
import { parseListArgs, resolveOwnerIds } from '../../scripts/import/engine/filters'
import { emptyCriteria, filterTransactions, monthBounds } from '../../lib/transactionFilters'
import type { FilterCriteria } from '../../lib/transactionFilters'
import type { Transaction } from '../../lib/types'

const PEOPLE = [
  { id: 'p1', name: 'Ayaz' },
  { id: 'p2', name: 'Tasnuva' },
]
const CTX = { ownerNames: { p1: 'Ayaz', p2: 'Tasnuva' } }

let n = 0
function tx(over: Partial<Transaction>): Transaction {
  n++
  return {
    id: over.id ?? `t${n}`,
    household_id: 'h1',
    merchant: 'Merchant',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 1000,
    source: 'TD Bank',
    date: '2026-06-05T12:00:00.000Z',
    created_by: 'u1',
    created_at: '',
    updated_at: '',
    owner_ids: ['p1'],
    shares: { p1: 1000 },
    ...over,
  }
}

const FIXTURE: Transaction[] = [
  tx({ id: 'coffee-may', merchant: 'Blue Bottle Coffee', category: 'coffee', date: '2026-05-10T12:00:00.000Z' }),
  tx({ id: 'dining-jun', merchant: 'Lucali', category: 'dining', source: 'Amex' }),
  tx({ id: 'shared-jun', merchant: 'Whole Foods', category: 'groceries', owner_ids: ['p1', 'p2'], shares: { p1: 500, p2: 500 } }),
  tx({ id: 'tasnuva-only', merchant: 'Sephora', category: 'health', owner_ids: ['p2'], shares: { p2: 1000 } }),
  tx({ id: 'transfer-jun', merchant: 'Settle up', category: 'transfer', kind: 'transfer', owner_ids: ['p1'] }),
  tx({ id: 'income-jun', merchant: 'Payroll', category: 'income', kind: 'income' }),
]

const ids = (txs: Transaction[]) => txs.map((t) => t.id)

interface Scenario {
  name: string
  args: Record<string, string>
  appCriteria: Partial<FilterCriteria>
  expected: string[]
}

const SCENARIOS: Scenario[] = [
  {
    name: 'free-text query (merchant)',
    args: { query: 'coffee' },
    appCriteria: { query: 'coffee' },
    expected: ['coffee-may'],
  },
  {
    name: 'free-text query matches owner name',
    args: { query: 'tasnuva' },
    appCriteria: { query: 'tasnuva' },
    expected: ['shared-jun', 'tasnuva-only'],
  },
  {
    name: 'multi-select categories OR together',
    args: { category: 'coffee,dining' },
    appCriteria: { categories: ['coffee', 'dining'] },
    expected: ['coffee-may', 'dining-jun'],
  },
  {
    name: 'owner filter by name',
    args: { owner: 'Tasnuva' },
    appCriteria: { owners: ['p2'] },
    expected: ['shared-jun', 'tasnuva-only'],
  },
  {
    name: 'kind supports transfer like the apps',
    args: { kind: 'transfer' },
    appCriteria: { kind: 'transfer' },
    expected: ['transfer-jun'],
  },
  {
    name: 'month window (half-open, shared monthBounds)',
    args: { month: '2026-05' },
    appCriteria: { ...monthBounds('2026-05') },
    expected: ['coffee-may'],
  },
  {
    name: 'combined dimensions AND together',
    args: { month: '2026-06', owner: 'Ayaz', kind: 'expense', source: 'TD Bank' },
    appCriteria: { ...monthBounds('2026-06'), owners: ['p1'], kind: 'expense', sources: ['TD Bank'] },
    expected: ['shared-jun'],
  },
]

describe('tx list ≡ shared filterTransactions (SC-005)', () => {
  for (const s of SCENARIOS) {
    it(s.name, () => {
      const parsed = parseListArgs(s.args)
      const criteria: FilterCriteria = {
        ...parsed.criteria,
        owners: resolveOwnerIds(PEOPLE, parsed.ownerNames),
      }
      const cliResult = filterTransactions(FIXTURE, criteria, CTX)
      const appResult = filterTransactions(FIXTURE, { ...emptyCriteria(), ...s.appCriteria }, CTX)
      expect(ids(cliResult)).toEqual(s.expected)
      expect(ids(cliResult)).toEqual(ids(appResult))
    })
  }
})

describe('parseListArgs', () => {
  it('defaults: empty criteria, no window, limit 200', () => {
    const p = parseListArgs({})
    expect(p.criteria).toEqual(emptyCriteria())
    expect(p.ownerNames).toEqual([])
    expect(p.window).toEqual({})
    expect(p.limit).toBe(200)
  })
  it('month fills both the SQL window and the criteria bounds', () => {
    const p = parseListArgs({ month: '2026-05' })
    const b = monthBounds('2026-05')
    expect(p.window).toEqual({ startISO: b.dateFrom, endISO: b.dateTo })
    expect(p.criteria.dateFrom).toBe(b.dateFrom)
    expect(p.criteria.dateTo).toBe(b.dateTo)
  })
  it('rejects invalid category / kind / limit / month', () => {
    expect(() => parseListArgs({ category: 'nope' })).toThrow(/INVALID_CATEGORY/)
    expect(() => parseListArgs({ category: 'transfer' })).toThrow(/INVALID_CATEGORY/)
    expect(() => parseListArgs({ kind: 'weird' })).toThrow(/INVALID_KIND/)
    expect(() => parseListArgs({ limit: '0' })).toThrow(/INVALID_LIMIT/)
    expect(() => parseListArgs({ month: '2026-5' })).toThrow(/INVALID_MONTH/)
  })
})

describe('resolveOwnerIds', () => {
  it('matches names case-insensitively', () => {
    expect(resolveOwnerIds(PEOPLE, ['tasnuva', 'AYAZ'])).toEqual(['p2', 'p1'])
  })
  it('throws with the available names on an unknown owner', () => {
    expect(() => resolveOwnerIds(PEOPLE, ['Nadia'])).toThrow(/UNKNOWN_OWNER.*Ayaz.*Tasnuva/)
  })
})

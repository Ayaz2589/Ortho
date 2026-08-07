// spec 043 US2 (Foundational) — pure per-person aggregation. Reuses the golden-
// locked effectiveShares for split portions; transfers use transferParties.
import { describe, it, expect } from 'vitest'
import { personSummary } from '@/lib/finance/personSummary'
import type { Transaction } from '@/lib/types'

// Minimal Transaction factory — only the fields personSummary reads.
function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    household_id: 'h',
    merchant: '',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 0,
    source: '',
    date: '2026-06-15',
    created_by: 'u',
    created_at: '',
    updated_at: '',
    owner_ids: [],
    shares: {},
    ...over,
  } as Transaction
}

const START = new Date('2026-06-01')
const END = new Date('2026-07-01') // exclusive

describe('personSummary', () => {
  it('counts only the person share of a split expense (not the full amount)', () => {
    const t = tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['a', 'b'], shares: { a: 600, b: 400 } })
    expect(personSummary([t], 'a', START, END).expenses).toBe(600)
    expect(personSummary([t], 'b', START, END).expenses).toBe(400)
  })

  it('share-conservation — summing every member share equals the amount', () => {
    const t = tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['a', 'b'], shares: { a: 600, b: 400 } })
    const total = personSummary([t], 'a', START, END).expenses + personSummary([t], 'b', START, END).expenses
    expect(total).toBe(t.amount_cents)
  })

  it('falls back to an even split when shares are empty (via effectiveShares)', () => {
    const t = tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['a', 'b'], shares: {} })
    const a = personSummary([t], 'a', START, END).expenses
    const b = personSummary([t], 'b', START, END).expenses
    expect(a + b).toBe(1000)
    expect(a).toBe(500)
  })

  it('sums the person income share', () => {
    const t = tx({ kind: 'income', amount_cents: 3000, owner_ids: ['a'], shares: { a: 3000 } })
    expect(personSummary([t], 'a', START, END).income).toBe(3000)
    expect(personSummary([t], 'b', START, END).income).toBe(0)
  })

  it('transfers: to=received, from=sent, uninvolved=0', () => {
    const t = tx({ kind: 'transfer', amount_cents: 500, paid_by: 'a', owner_ids: ['b'], shares: {} })
    const a = personSummary([t], 'a', START, END)
    const b = personSummary([t], 'b', START, END)
    const c = personSummary([t], 'c', START, END)
    expect(a.transfersSent).toBe(500)
    expect(a.transfersReceived).toBe(0)
    expect(b.transfersReceived).toBe(500)
    expect(b.transfersSent).toBe(0)
    expect(c.transfersSent + c.transfersReceived).toBe(0)
  })

  it('net = income − expenses + received − sent', () => {
    const txs = [
      tx({ kind: 'income', amount_cents: 3000, owner_ids: ['a'], shares: { a: 3000 } }),
      tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['a', 'b'], shares: { a: 600, b: 400 } }),
      tx({ kind: 'transfer', amount_cents: 200, paid_by: 'b', owner_ids: ['a'], shares: {} }), // a receives 200
      tx({ kind: 'transfer', amount_cents: 50, paid_by: 'a', owner_ids: ['b'], shares: {} }), // a sends 50
    ]
    const s = personSummary(txs, 'a', START, END)
    expect(s.income).toBe(3000)
    expect(s.expenses).toBe(600)
    expect(s.transfersReceived).toBe(200)
    expect(s.transfersSent).toBe(50)
    expect(s.net).toBe(3000 - 600 + 200 - 50)
  })

  it('window is half-open [start, end) — end excluded, start included', () => {
    const atStart = tx({ kind: 'income', amount_cents: 100, owner_ids: ['a'], shares: { a: 100 }, date: '2026-06-01' })
    const atEnd = tx({ kind: 'income', amount_cents: 999, owner_ids: ['a'], shares: { a: 999 }, date: '2026-07-01' })
    const s = personSummary([atStart, atEnd], 'a', START, END)
    expect(s.income).toBe(100) // atEnd excluded
  })

  it('a person with no activity gets an all-zero summary', () => {
    const t = tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['a'], shares: { a: 1000 } })
    expect(personSummary([t], 'z', START, END)).toEqual({
      income: 0,
      expenses: 0,
      transfersReceived: 0,
      transfersSent: 0,
      net: 0,
    })
  })
})

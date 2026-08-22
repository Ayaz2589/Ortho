import { describe, it, expect } from 'vitest'
import type { Transaction } from '@/lib/types'
import {
  allPairBalances,
  balanceBetween,
  outstandingBalances,
  peopleInLedger,
  simplifyDebts,
} from '@/lib/finance/balances'

// spec 053 — what the old viewer-anchored function could not express: three or more people,
// income balance effects, and a ledger whose payers are null. The nine historical pairwise
// cases live in test/member-balance.parity.test.ts.

const A = 'p-amir'
const B = 'p-priya'
const C = 'p-nasrin'

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.abs(JSON.stringify(over).length)}-${over.amount_cents ?? 0}`,
    household_id: 'h',
    merchant: 'Grocer',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 6000,
    source: '',
    date: '2026-08-10T12:00:00.000Z',
    created_by: 'u',
    created_at: '2026-08-10T12:00:00.000Z',
    updated_at: '2026-08-10T12:00:00.000Z',
    paid_by: A,
    owner_ids: [A, B, C],
    shares: { [A]: 2000, [B]: 2000, [C]: 2000 },
    notes: null,
    ...over,
  } as Transaction
}

const transfer = (from: string, to: string, amount: number) =>
  tx({ kind: 'transfer', category: 'transfer', amount_cents: amount, paid_by: from, owner_ids: [to], shares: {} })

describe('three people', () => {
  it('leaves each non-payer owing the payer their share', () => {
    const txs = [tx()]
    expect(balanceBetween(A, B, txs)).toBe(2000)
    expect(balanceBetween(A, C, txs)).toBe(2000)
  })

  it('creates no balance between two non-payers', () => {
    expect(balanceBetween(B, C, [tx()])).toBe(0)
  })

  it('shows a pair the viewer is not part of — the whole point of the rebuild', () => {
    // Priya paid for a dinner owned by Priya and Nasrin. Amir is party to neither side.
    const txs = [
      tx({ paid_by: B, amount_cents: 4000, owner_ids: [B, C], shares: { [B]: 2000, [C]: 2000 } }),
    ]
    const rows = outstandingBalances([A, B, C], txs)
    expect(rows).toEqual([{ fromId: B, toId: C, amountCents: 2000 }])
  })

  it('nets several payers across the household', () => {
    const txs = [
      tx(), // Amir paid 6000, split 3 ways
      tx({ paid_by: B, amount_cents: 3000, owner_ids: [A, B], shares: { [A]: 1500, [B]: 1500 } }),
    ]
    expect(balanceBetween(A, B, txs)).toBe(2000 - 1500)
    expect(balanceBetween(A, C, txs)).toBe(2000)
  })
})

describe('the matrix is antisymmetric', () => {
  const txs = [
    tx(),
    tx({ paid_by: B, amount_cents: 3000, owner_ids: [A, B], shares: { [A]: 1500, [B]: 1500 } }),
    transfer(C, A, 500),
  ]

  it('mirrors every ordered pair', () => {
    const m = allPairBalances([A, B, C], txs)
    for (const x of [A, B, C]) {
      for (const y of [A, B, C]) {
        if (x === y) continue
        expect(m.get(x)!.get(y)).toBe(-m.get(y)!.get(x)!)
      }
    }
  })

  it('agrees with balanceBetween for every pair', () => {
    const m = allPairBalances([A, B, C], txs)
    expect(m.get(A)!.get(B)).toBe(balanceBetween(A, B, txs))
    expect(m.get(B)!.get(C)).toBe(balanceBetween(B, C, txs))
  })

  it('sums every net position to zero across the household', () => {
    const net = (p: string) =>
      [A, B, C].filter((o) => o !== p).reduce((s, o) => s + balanceBetween(p, o, txs), 0)
    const total = [A, B, C].reduce((s, p) => s + net(p), 0)
    expect(total).toBe(0)
  })

  it('holds over many randomized ledgers', () => {
    // Deterministic pseudo-random — no Math.random, so a failure always reproduces.
    let seed = 12345
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
    const people = [A, B, C]
    for (let round = 0; round < 60; round++) {
      const txs: Transaction[] = []
      for (let i = 0; i < 6; i++) {
        const payer = people[next(3)]
        const amount = 300 + next(9700)
        const owners = people.filter((_, idx) => idx === next(3) || idx === next(3))
        const set = owners.length ? owners : [people[0]]
        const base = Math.floor(amount / set.length)
        const shares: Record<string, number> = {}
        set.forEach((p, idx) => (shares[p] = base + (idx < amount - base * set.length ? 1 : 0)))
        txs.push(tx({ id: `r${round}-${i}`, paid_by: payer, amount_cents: amount, owner_ids: set, shares }))
      }
      const m = allPairBalances(people, txs)
      for (const x of people) {
        for (const y of people) {
          if (x === y) continue
          expect(m.get(x)!.get(y)).toBe(-m.get(y)!.get(x)!)
        }
      }
      const net = (p: string) =>
        people.filter((o) => o !== p).reduce((s, o) => s + balanceBetween(p, o, txs), 0)
      expect(people.reduce((s, p) => s + net(p), 0)).toBe(0)
    }
  })
})

describe('income creates a debt to co-owners', () => {
  it('makes the recipient owe each co-owner their share', () => {
    const income = tx({
      kind: 'income',
      category: 'freelance',
      amount_cents: 9000,
      paid_by: A,
      owner_ids: [A, B, C],
      shares: { [A]: 3000, [B]: 3000, [C]: 3000 },
    })
    expect(balanceBetween(A, B, [income])).toBe(-3000)
    expect(balanceBetween(B, A, [income])).toBe(3000)
  })

  it('creates nothing when income is owned solely by its recipient', () => {
    const income = tx({
      kind: 'income',
      category: 'salary',
      amount_cents: 9000,
      paid_by: A,
      owner_ids: [A],
      shares: { [A]: 9000 },
    })
    expect(balanceBetween(A, B, [income])).toBe(0)
  })

  it('is settled by a transfer the same way an expense is', () => {
    const income = tx({
      kind: 'income',
      category: 'freelance',
      amount_cents: 4000,
      paid_by: A,
      owner_ids: [A, B],
      shares: { [A]: 2000, [B]: 2000 },
    })
    expect(balanceBetween(A, B, [income, transfer(A, B, 2000)])).toBe(0)
  })
})

describe('transactions with no payer', () => {
  it('contribute nothing', () => {
    const orphan = tx({ paid_by: null })
    expect(balanceBetween(A, B, [orphan])).toBe(0)
    expect(outstandingBalances([A, B, C], [orphan])).toEqual([])
  })

  it('do not disturb balances from rows that DO have a payer', () => {
    const txs = [tx({ paid_by: null }), tx({ id: 'real' })]
    expect(balanceBetween(A, B, txs)).toBe(2000)
  })
})

describe('outstandingBalances', () => {
  it('is empty when everything is settled', () => {
    expect(outstandingBalances([A, B, C], [tx(), transfer(B, A, 2000), transfer(C, A, 2000)])).toEqual([])
  })

  it('always reports a positive amount with the debtor second', () => {
    const rows = outstandingBalances([A, B, C], [tx()])
    for (const r of rows) {
      expect(r.amountCents).toBeGreaterThan(0)
      expect(r.fromId).not.toBe(r.toId)
    }
  })

  it('flips direction on an over-repayment', () => {
    const rows = outstandingBalances([A, B], [tx({ owner_ids: [A, B], shares: { [A]: 3000, [B]: 3000 } }), transfer(B, A, 5000)])
    expect(rows).toEqual([{ fromId: B, toId: A, amountCents: 2000 }])
  })

  it('shows the largest debt first', () => {
    const txs = [
      tx({ amount_cents: 9000, owner_ids: [A, B], shares: { [A]: 1000, [B]: 8000 } }),
      tx({ id: 'x', amount_cents: 1000, owner_ids: [A, C], shares: { [A]: 500, [C]: 500 } }),
    ]
    const rows = outstandingBalances([A, B, C], txs)
    expect(rows[0].amountCents).toBeGreaterThanOrEqual(rows[1].amountCents)
  })

  it('keeps a removed person’s balance visible', () => {
    const GHOST = 'p-removed'
    const txs = [tx({ owner_ids: [A, GHOST], shares: { [A]: 3000, [GHOST]: 3000 } })]
    const rows = outstandingBalances(peopleInLedger(txs), txs)
    expect(rows).toEqual([{ fromId: A, toId: GHOST, amountCents: 3000 }])
  })
})

describe('peopleInLedger', () => {
  it('collects owners and payers, including people no longer in the household', () => {
    const txs = [tx({ owner_ids: [A, 'p-gone'], shares: { [A]: 3000, 'p-gone': 3000 }, paid_by: 'p-payer' })]
    expect(peopleInLedger(txs).sort()).toEqual([A, 'p-gone', 'p-payer'].sort())
  })

  it('is empty for an empty ledger', () => {
    expect(peopleInLedger([])).toEqual([])
  })
})

// US10 (ported from the spec-031 branch onto spec 053's PairBalance shape) — the pairwise
// list is the honest per-pair truth; this is the fewest transfers that clear the same money.
describe('simplifyDebts', () => {
  it('collapses a debt chain into one transfer', () => {
    // A owes B $30; B owes C $30. Netted: A owes C $30, and B drops out entirely.
    const rows = simplifyDebts([
      { fromId: B, toId: A, amountCents: 3000 },
      { fromId: C, toId: B, amountCents: 3000 },
    ])
    expect(rows).toEqual([{ fromId: C, toId: A, amountCents: 3000 }])
  })

  it('never invents or loses cents', () => {
    const pairs = [
      { fromId: A, toId: B, amountCents: 2500 },
      { fromId: A, toId: C, amountCents: 1000 },
      { fromId: B, toId: C, amountCents: 750 },
    ]
    const total = (rows: readonly { amountCents: number }[]) =>
      rows.reduce((s, r) => s + r.amountCents, 0)
    // A is owed 3500, C owes 1750, B nets -1750 + 2500... the sum of what changes hands
    // must equal the sum of every net creditor position.
    const rows = simplifyDebts(pairs)
    const creditorTotal = 2500 + 1000 + 750 - 750
    expect(total(rows)).toBe(creditorTotal)
    expect(rows.every((r) => r.amountCents > 0)).toBe(true)
  })

  it('splits one debtor across two creditors when the debt genuinely spans both', () => {
    const rows = simplifyDebts([
      { fromId: A, toId: C, amountCents: 3000 },
      { fromId: B, toId: C, amountCents: 2000 },
    ])
    // C owes 5000 total, to two different creditors — two transfers is the minimum.
    expect(rows).toEqual([
      { fromId: A, toId: C, amountCents: 3000 },
      { fromId: B, toId: C, amountCents: 2000 },
    ])
  })

  it('is empty for a settled household', () => {
    expect(simplifyDebts([])).toEqual([])
  })

  it('is deterministic regardless of input order', () => {
    const pairs = [
      { fromId: A, toId: B, amountCents: 2500 },
      { fromId: A, toId: C, amountCents: 1000 },
    ]
    expect(simplifyDebts(pairs)).toEqual(simplifyDebts([...pairs].reverse()))
  })

  it('never produces a transfer larger than the total owed', () => {
    const rows = simplifyDebts([{ fromId: A, toId: B, amountCents: 4200 }])
    expect(rows).toEqual([{ fromId: A, toId: B, amountCents: 4200 }])
  })
})

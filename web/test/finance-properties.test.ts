import { describe, expect, it } from 'vitest'
import { computeShares, validateSplit, seedSplit, orderedOwnerIds, PERCENT_TOLERANCE } from '@/lib/splits'
import { balanceBetween } from '@/lib/balances'
import { toDisplayAmount, toUSDCents } from '@/lib/finance/money'
import { CURRENCIES, FALLBACK_RATE_FROM_USD } from '@/lib/finance/currency'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// spec 025 — US1 CORRECTNESS ORACLE (property / invariant tests)
//
// These assert INVARIANTS that must hold for every input, not specific outputs
// pinned from the implementation. Inputs are fixed/seeded (never Math.random, so
// the suite is deterministic per the constitution). An invariant break here means
// a real correctness regression, not a stale snapshot.
// ─────────────────────────────────────────────────────────────────────────────

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const owners = (n: number) => Array.from({ length: n }, (_, i) => `owner-${String.fromCharCode(97 + i)}`)
const AMOUNTS = [0, 1, 2, 7, 99, 100, 101, 1000, 1234, 99_999, 100_000, 1_000_003]
const COUNTS = [1, 2, 3, 4, 5, 7]

describe('property — even shares always sum to the amount, none negative', () => {
  for (const amount of AMOUNTS) {
    for (const n of COUNTS) {
      it(`amount ${amount}¢ across ${n} owners`, () => {
        const shares = computeShares(amount, orderedOwnerIds(owners(n)), { method: 'even' })
        expect(sum(shares)).toBe(amount)
        for (const v of Object.values(shares)) expect(v).toBeGreaterThanOrEqual(0)
      })
    }
  }
})

describe('property — percent shares sum to the amount even at the tolerance edge', () => {
  // Percents may legally total 100 ± PERCENT_TOLERANCE. Both the under- and
  // over-100 edges must still produce shares that sum EXACTLY to the amount
  // (the floor-leftover distribution and the over-allocation reclaim path).
  const overPercents = { a: 33.5, b: 33.5, c: 33.4 } // sums to 100.4 (within 0.5)
  const underPercents = { a: 33.3, b: 33.3, c: 33.3 } // sums to 99.9 (within 0.5)
  it('the fixtures are within tolerance (guards the test itself)', () => {
    expect(validateSplit(1000, ['a', 'b', 'c'], { method: 'percent', percents: overPercents }).ok).toBe(true)
    expect(validateSplit(1000, ['a', 'b', 'c'], { method: 'percent', percents: underPercents }).ok).toBe(true)
    expect(Math.abs(33.5 + 33.5 + 33.4 - 100)).toBeLessThanOrEqual(PERCENT_TOLERANCE)
  })
  for (const amount of [100, 1000, 1234, 99_999]) {
    for (const [label, percents] of [['over-100', overPercents], ['under-100', underPercents]] as const) {
      it(`${label} percents on ${amount}¢ sum to amount, none negative`, () => {
        const shares = computeShares(amount, ['a', 'b', 'c'], { method: 'percent', percents })
        expect(sum(shares)).toBe(amount)
        for (const v of Object.values(shares)) expect(v).toBeGreaterThanOrEqual(0)
      })
    }
  }
})

describe('property — seedSplit round-trips losslessly through computeShares', () => {
  // computeShares(owners, seedSplit(stored)) === stored, for both even and custom
  // stored shares. This is the invariant the split editor relies on to reopen and
  // re-save a transaction to the cent.
  const cases: Array<{ name: string; amount: number; owners: string[]; stored: Record<string, number> }> = [
    { name: 'even 3-way', amount: 1000, owners: ['a', 'b', 'c'], stored: { a: 334, b: 333, c: 333 } },
    { name: 'custom 2-way', amount: 5000, owners: ['a', 'b'], stored: { a: 2000, b: 3000 } },
    { name: 'custom 3-way uneven', amount: 10_000, owners: ['a', 'b', 'c'], stored: { a: 1, b: 9998, c: 1 } },
    { name: 'single owner', amount: 4242, owners: ['solo'], stored: { solo: 4242 } },
  ]
  for (const c of cases) {
    it(c.name, () => {
      const ordered = orderedOwnerIds(c.owners)
      const seed = seedSplit(c.amount, ordered, c.stored)
      // SplitSeed is a subset of SplitInput, so it feeds computeShares directly.
      const rebuilt = computeShares(c.amount, ordered, seed)
      expect(rebuilt).toEqual(c.stored)
      expect(sum(rebuilt)).toBe(c.amount)
    })
  }
})

describe('property — currency conversion round-trips within display tolerance', () => {
  // cents → display(rounded to the currency's fraction digits) → cents should
  // return the original within the coarseness of one display unit. Worst case is
  // JPY (0 fraction digits) at a high rate; still < 2¢. USD at rate 1 is exact.
  const cents = [0, 1, 99, 100, 12_345, 1_000_000]
  for (const cur of CURRENCIES) {
    const rate = FALLBACK_RATE_FROM_USD[cur]
    for (const c of cents) {
      it(`${cur} @ ${rate}: ${c}¢ round-trips`, () => {
        const back = toUSDCents(toDisplayAmount(c, cur, rate), cur, rate)
        expect(Math.abs(back - c)).toBeLessThanOrEqual(2)
      })
    }
  }
})

describe('property — balanceBetween is antisymmetric', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    id: 'i', household_id: 'h', merchant: 'm', category: 'dining', kind: 'expense',
    amount_cents: 0, source: 's', date: '2026-06-15T12:00:00.000Z', created_by: 'x',
    created_at: '2026-06-15T12:00:00.000Z', updated_at: '2026-06-15T12:00:00.000Z',
    owner_ids: [], shares: {}, ...over,
  })
  const ledger: Transaction[] = [
    t({ paid_by: 'a', amount_cents: 3000, owner_ids: ['a', 'b'], shares: { a: 1500, b: 1500 } }),
    t({ paid_by: 'b', amount_cents: 4200, owner_ids: ['a', 'b'], shares: { a: 2100, b: 2100 } }),
    t({ kind: 'transfer', category: 'transfer', paid_by: 'a', amount_cents: 700, owner_ids: ['b'], shares: { b: 700 } }),
    t({ kind: 'transfer', category: 'transfer', paid_by: 'b', amount_cents: 250, owner_ids: ['a'], shares: { a: 250 } }),
    t({ kind: 'income', amount_cents: 9999, owner_ids: ['a'], shares: { a: 9999 } }), // ignored by balances
  ]
  it('balance(a,b) === −balance(b,a)', () => {
    expect(balanceBetween('a', 'b', ledger)).toBe(-balanceBetween('b', 'a', ledger))
  })
  it('income rows never affect a settle-up balance', () => {
    // The trailing income row carries no payer semantics; dropping it must not
    // change the net owed between the two members.
    const withoutIncome = ledger.filter((r) => r.kind !== 'income')
    expect(balanceBetween('a', 'b', ledger)).toBe(balanceBetween('a', 'b', withoutIncome))
  })
})

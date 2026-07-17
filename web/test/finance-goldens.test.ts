import { describe, expect, it } from 'vitest'
import { monthlyPaymentCents, currentPrincipalBalanceCents, currentEquityCents } from '@/lib/finance/mortgage'
import { computeShares, orderedOwnerIds } from '@/lib/splits'
import { balanceBetween } from '@/lib/balances'
import { occupiedRentCents, netRentalCents, type RentUnit } from '@/lib/finance/housing'
import { toDisplayAmount, toUSDCents, roundHalfAwayFromZero } from '@/lib/finance/money'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// spec 025 — US1 CORRECTNESS ORACLE (hand-computed goldens)
//
// Unlike the *.parity.test.ts suites (which assert the engines reproduce values
// the engines themselves generated into shared/test-vectors/), every `expected`
// below is derived INDEPENDENTLY — by hand, from textbook formulas, or from
// first principles — with the derivation shown. These assert *truth*, so they
// cannot be laundered by regenerating the vectors after an unintended change.
// ─────────────────────────────────────────────────────────────────────────────

const tx = (over: Partial<Transaction>): Transaction => ({
  id: '00000000-0000-0000-0000-000000000000',
  household_id: 'h',
  merchant: 'm',
  category: 'dining',
  kind: 'expense',
  amount_cents: 0,
  source: 's',
  date: '2026-06-15T12:00:00.000Z',
  created_by: 'x',
  created_at: '2026-06-15T12:00:00.000Z',
  updated_at: '2026-06-15T12:00:00.000Z',
  owner_ids: [],
  shares: {},
  ...over,
})

describe('finance goldens — mortgage payment', () => {
  it('$300,000 @ 6% over 30y = textbook $1,798.65/mo (±1¢)', () => {
    // Textbook fixed-rate payment: the standard amortization tables put a
    // $300k / 6% / 30y loan at $1,798.65 per month. Independent of our code.
    const pay = monthlyPaymentCents(30_000_000, 6, 30)
    expect(Math.abs(pay - 179_865)).toBeLessThanOrEqual(1)
  })

  it('zero-interest loan is principal ÷ term-months, exactly', () => {
    // $360,000 with 0% over 30y = 360 payments of exactly $1,000. No interest,
    // no amortization — pure division. 36,000,000¢ / 360 = 100,000¢.
    expect(monthlyPaymentCents(36_000_000, 0, 30)).toBe(100_000)
  })
})

describe('finance goldens — principal balance', () => {
  const closing = '2020-01-01'
  it('at the closing date you still owe the full principal', () => {
    // months elapsed = 0 ⇒ B(0) = P. You have paid nothing down.
    expect(
      currentPrincipalBalanceCents(30_000_000, 6, 30, closing, new Date('2020-01-01T00:00:00Z'))
    ).toBe(30_000_000)
  })

  it('zero-interest balance falls by exactly one payment per month', () => {
    // 0% ⇒ B(k) = P − M·k. After 12 payments of $1,000: $360,000 − $12,000 = $348,000.
    const bal = currentPrincipalBalanceCents(36_000_000, 0, 30, closing, new Date('2021-01-01T00:00:00Z'))
    expect(bal).toBe(34_800_000)
  })
})

describe('finance goldens — equity', () => {
  it('equity = purchase price − current balance, at closing', () => {
    // Bought for $400k, borrowed $300k, at closing balance = $300k ⇒ equity = $100k.
    const eq = currentEquityCents(40_000_000, 30_000_000, 6, 30, '2020-01-01', new Date('2020-01-01T00:00:00Z'))
    expect(eq).toBe(10_000_000)
  })
})

describe('finance goldens — splits (leftover cent placement)', () => {
  it('$10.00 even across 3 owners → 334 / 333 / 333 in canonical order', () => {
    // 1000 ÷ 3 = 333.33 → floor 333 each = 999; the single leftover cent goes to
    // the FIRST owner in canonical (sorted) order. Feed a scrambled list to prove
    // canonicalization decides the recipient, not entry order.
    const shares = computeShares(1000, orderedOwnerIds(['c', 'b', 'a']), { method: 'even' })
    expect(shares).toEqual({ a: 334, b: 333, c: 333 })
    expect(shares.a + shares.b + shares.c).toBe(1000)
  })

  it('percent split with a floor leftover sums to the amount', () => {
    // $1.00 at 33.33 / 33.33 / 33.34 %: targets 33.33 / 33.33 / 33.34 → floor
    // 33 / 33 / 33 = 99; leftover 1¢ → first owner. 34 + 33 + 33 = 100.
    const shares = computeShares(100, ['a', 'b', 'c'], {
      method: 'percent',
      percents: { a: 33.33, b: 33.33, c: 33.34 },
    })
    expect(shares).toEqual({ a: 34, b: 33, c: 33 })
  })

  it('single owner takes the whole amount', () => {
    expect(computeShares(9999, ['solo'], { method: 'even' })).toEqual({ solo: 9999 })
  })
})

describe('finance goldens — member balances (settle-up)', () => {
  // alice fronts a $30 dinner split evenly; bob owes his $15 share.
  const dinner = tx({ paid_by: 'alice', amount_cents: 3000, owner_ids: ['alice', 'bob'], shares: { alice: 1500, bob: 1500 } })
  // bob reimburses alice $15 via a transfer (bob = sender, alice = recipient).
  const payback = tx({ kind: 'transfer', category: 'transfer', paid_by: 'bob', amount_cents: 1500, owner_ids: ['alice'], shares: { alice: 1500 } })

  it('an expense alice paid makes bob owe his share (+)', () => {
    expect(balanceBetween('alice', 'bob', [dinner])).toBe(1500)
  })

  it('the reimbursement settles the debt to zero', () => {
    // +$15 owed, then −$15 paid back ⇒ settled.
    expect(balanceBetween('alice', 'bob', [dinner, payback])).toBe(0)
  })

  it('balance is antisymmetric between the two members', () => {
    expect(balanceBetween('bob', 'alice', [dinner])).toBe(-1500)
  })
})

describe('finance goldens — net rental', () => {
  const units: RentUnit[] = [
    { rentCents: 200_000, occupied: true }, // $2,000 collected
    { rentCents: 150_000, occupied: false }, // vacant — asking rent, not collected
  ]
  it('only occupied units count toward collected rent', () => {
    expect(occupiedRentCents(units)).toBe(200_000)
  })
  it('net = occupied rent − mortgage payment', () => {
    // $2,000 collected − $1,200 mortgage = $800 net.
    expect(netRentalCents(units, 120_000)).toBe(80_000)
  })
  it('net can be negative for a cash-flow-negative building', () => {
    expect(netRentalCents(units, 250_000)).toBe(-50_000)
  })
})

describe('finance goldens — currency conversion', () => {
  it('USD cents render as dollars at rate 1', () => {
    expect(toDisplayAmount(12_345, 'usd', 1)).toBe(123.45)
  })
  it('JPY (0 fraction digits) at rate 150: $100 → ¥15,000', () => {
    // 10,000¢ = $100.00; × 150 = ¥15,000; JPY has no minor unit.
    expect(toDisplayAmount(10_000, 'jpy', 150)).toBe(15_000)
  })
  it('JPY converts back to USD cents exactly', () => {
    // ¥15,000 ÷ 150 = $100.00 = 10,000¢.
    expect(toUSDCents(15_000, 'jpy', 150)).toBe(10_000)
  })
  it('a non-positive rate has no inverse and yields 0 (documented guard)', () => {
    expect(toUSDCents(100, 'eur', 0)).toBe(0)
    expect(toUSDCents(100, 'eur', -3)).toBe(0)
  })
  it('rounding is half-AWAY-from-zero, symmetric in sign', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3)
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
    expect(roundHalfAwayFromZero(2.345, 2)).toBe(2.35)
    expect(roundHalfAwayFromZero(-2.345, 2)).toBe(-2.35)
  })
})

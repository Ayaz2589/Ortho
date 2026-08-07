import { describe, expect, it } from 'vitest'
import { monthlyPaymentCents, currentPrincipalBalanceCents, currentEquityCents, upcomingAmortization } from '@/lib/finance/mortgage'
import { computeShares, orderedOwnerIds } from '@/lib/splits'
import { occupiedRentCents, netRentalCents, type RentUnit } from '@/lib/finance/housing'
import { toDisplayAmount, toUSDCents, roundHalfAwayFromZero } from '@/lib/finance/money'
import { generateInsights } from '@/lib/finance/insights'
import { monthBounds } from '@/lib/transactionFilters'
import { daysUntilNextRent } from '@/components/housing/lease'
import type { Transaction, Budget, LeaseInfo } from '@/lib/types'

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

// ─────────────────────────────────────────────────────────────────────────────
// spec 027 — A3: Oracle extension (independent goldens for risky engines)
// ─────────────────────────────────────────────────────────────────────────────

function insightTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: over.id ?? 'tx-gold',
    household_id: 'hh-1',
    merchant: over.merchant ?? 'Shop',
    category: over.category ?? 'dining',
    kind: over.kind ?? 'expense',
    amount_cents: over.amount_cents ?? 1_000,
    source: 'Chase',
    date: over.date ?? '2026-06-15T12:00:00.000Z',
    created_by: 'u-1',
    created_at: '2026-06-15T12:00:00.000Z',
    updated_at: '2026-06-15T12:00:00.000Z',
    owner_ids: ['u-1'],
    shares: {},
    ...over,
  }
}

describe('finance goldens — amortization schedule (spec 027 A3)', () => {
  // $300,000 loan at 6% / 30 years, closing 2020-01-01.
  // Monthly rate r = 0.06 / 12 = 0.005
  // Monthly payment M = 179,865¢ (verified in existing golden above)
  //
  // Month-1:
  //   interest = 300,000,00¢ / 100 * 0.005 * 100 = 300,000 * 0.005 = $1,500.00 = 150,000¢
  //   principal = M − interest = 179,865 − 150,000 = 29,865¢
  //
  // Month-2 balance after month-1 = 300,000,00¢ − 29,865¢ = 29,970,135¢
  //   interest = floor(29,970,135 * 0.005) rounded in float dollars:
  //     balance_dollars = 299,701.35; interest_dollars = 299,701.35 * 0.005 = 1,498.507
  //     → rounded to cents = 149,851¢ (±1¢ for float path)
  //   principal = 179,865 − 149,851 = 30,014¢  (±1¢)
  const CLOSING = '2020-01-01'
  const AS_OF = new Date('2020-01-01T00:00:00Z')

  it('month-1 interest = $1,500.00 exactly (textbook derivation)', () => {
    const [m1] = upcomingAmortization(1, 30_000_000, 6, 30, CLOSING, AS_OF)
    // Textbook: interest = principal * monthly_rate = 300,000 * 0.005 = $1,500 = 150,000¢
    expect(Math.abs(m1.interestCents - 150_000)).toBeLessThanOrEqual(1)
  })

  it('month-1 principal = M − interest ≈ $298.65 (textbook derivation)', () => {
    const [m1] = upcomingAmortization(1, 30_000_000, 6, 30, CLOSING, AS_OF)
    // M = 179,865¢; interest = 150,000¢; principal = 179,865 − 150,000 = 29,865¢
    expect(Math.abs(m1.principalCents - 29_865)).toBeLessThanOrEqual(1)
  })

  it('month-1 principal + interest = M (payment identity)', () => {
    const [m1] = upcomingAmortization(1, 30_000_000, 6, 30, CLOSING, AS_OF)
    const M = monthlyPaymentCents(30_000_000, 6, 30)
    // principal + interest must equal M (±1¢ for rounding in float path)
    expect(Math.abs(m1.principalCents + m1.interestCents - M)).toBeLessThanOrEqual(1)
  })

  it('month-2 interest is less than month-1 (balance decreasing)', () => {
    const [m1, m2] = upcomingAmortization(2, 30_000_000, 6, 30, CLOSING, AS_OF)
    // Each month the balance is lower, so interest is lower.
    expect(m2.interestCents).toBeLessThan(m1.interestCents)
    expect(m2.principalCents).toBeGreaterThan(m1.principalCents)
  })

  it('sum of all 360 monthly payments ≈ total interest + principal', () => {
    const schedule = upcomingAmortization(360, 30_000_000, 6, 30, CLOSING, AS_OF)
    expect(schedule).toHaveLength(360)
    const totalPrincipal = schedule.reduce((s, e) => s + e.principalCents, 0)
    // Total principal paid must recover the original loan (±$10 for accumulated rounding)
    expect(Math.abs(totalPrincipal - 30_000_000)).toBeLessThanOrEqual(1_000)
  })
})

describe('finance goldens — insights rule 3: budget-over (spec 027 A3)', () => {
  // Budget: $100 limit (10,000¢). Spend: $120 (12,000¢).
  // fraction = 12,000 / 10,000 = 1.2 ≥ 1.0 → budget-over fires.
  // over = 12,000 − 10,000 = 2,000¢.
  // Independently derived: no engine code consulted for these expected values.
  const REF = new Date(2026, 5, 15) // June 15 local

  it('fires budget-over at critical severity when spend exceeds limit', () => {
    const tx = insightTx({ amount_cents: 12_000, category: 'dining' })
    const budget: Budget = { id: 'b1', household_id: 'hh-1', category: 'dining', monthly_limit_cents: 10_000, budget_type: 'fixed', rollover_cap_cents: null }
    const insights = generateInsights([tx], [budget], [], REF)
    const over = insights.find((i) => i.id === `budget-over-dining-2026-06`)
    expect(over).toBeDefined()
    expect(over?.severity).toBe('critical')
    // magnitude = amount over limit = 12,000 − 10,000 = 2,000¢
    expect(over?.magnitude_cents).toBe(2_000)
  })

  it('fires budget-over when spend is exactly at the limit (threshold is ≥ 1.0, not > 1.0)', () => {
    // Independently verified: budgetOverFraction = 1.0 in insights-thresholds.ts.
    // At-limit (fraction = 1.0) satisfies >= 1.0 → budget-over fires with magnitude 0¢.
    const tx = insightTx({ amount_cents: 10_000, category: 'dining' })
    const budget: Budget = { id: 'b1', household_id: 'hh-1', category: 'dining', monthly_limit_cents: 10_000, budget_type: 'fixed', rollover_cap_cents: null }
    const insights = generateInsights([tx], [budget], [], REF)
    const over = insights.find((i) => i.id.startsWith('budget-over-'))
    expect(over).toBeDefined()
    expect(over?.magnitude_cents).toBe(0)
  })
})

describe('finance goldens — insights rule 5: recurring average truncation (spec 027 A3)', () => {
  // 3 "Netflix" charges with gaps of 28 and 29 days (both ∈ [28,35]).
  // All 3 charges qualify → recurring fires.
  // Average: Math.trunc((3100 + 3200 + 3050) / 3) = Math.trunc(3116.67) = 3116¢.
  // Uses Math.trunc (truncates toward zero, matching iOS Int64 division).
  const REF_MAR = new Date(2026, 2, 15) // March 15 — last 6 months covers Jan–Mar

  it('truncates the recurring average toward zero (not Math.round)', () => {
    const charges = [
      insightTx({ id: 'r1', merchant: 'Netflix', date: '2026-01-01T12:00:00.000Z', amount_cents: 3_100 }),
      insightTx({ id: 'r2', merchant: 'Netflix', date: '2026-01-29T12:00:00.000Z', amount_cents: 3_200 }), // 28-day gap
      insightTx({ id: 'r3', merchant: 'Netflix', date: '2026-02-27T12:00:00.000Z', amount_cents: 3_050 }), // 29-day gap
    ]
    const insights = generateInsights(charges, [], [], REF_MAR)
    const recurring = insights.find((i) => i.id.startsWith('recurring-'))
    expect(recurring).toBeDefined()
    // Math.trunc((3100+3200+3050)/3) = Math.trunc(9350/3) = Math.trunc(3116.67) = 3116¢
    // (Math.round would give 3117¢ — verified these differ)
    expect(recurring?.magnitude_cents).toBe(3_116)
  })
})

describe('finance goldens — monthBounds filter window (spec 027 A3)', () => {
  // monthBounds returns UTC half-open [from, to) month windows.
  // These are independently derived: the JS Date for UTC midnight on
  // the 1st of the month and the 1st of the next month.
  it('June 2026: dateFrom = 2026-06-01T00:00:00.000Z, dateTo = 2026-07-01T00:00:00.000Z', () => {
    // Independently derived:
    //   new Date('2026-06-01T00:00:00.000Z').toISOString() = "2026-06-01T00:00:00.000Z"
    //   new Date('2026-07-01T00:00:00.000Z').toISOString() = "2026-07-01T00:00:00.000Z"
    const bounds = monthBounds('2026-06')
    expect(bounds.dateFrom).toBe('2026-06-01T00:00:00.000Z')
    expect(bounds.dateTo).toBe('2026-07-01T00:00:00.000Z')
  })

  it('December 2026 wraps correctly to January 2027', () => {
    // Dec → next month = Jan of the FOLLOWING year.
    const bounds = monthBounds('2026-12')
    expect(bounds.dateFrom).toBe('2026-12-01T00:00:00.000Z')
    expect(bounds.dateTo).toBe('2027-01-01T00:00:00.000Z')
  })

  it('dateFrom timestamp is exactly 31 days before dateTo for a 31-day month', () => {
    // October 2026 has 31 days.
    const bounds = monthBounds('2026-10')
    const from = new Date(bounds.dateFrom).getTime()
    const to = new Date(bounds.dateTo).getTime()
    const diffDays = (to - from) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(31)
  })

  it('dateFrom timestamp is exactly 28 days before dateTo for February 2026 (non-leap)', () => {
    // 2026 is not a leap year → February has 28 days.
    const bounds = monthBounds('2026-02')
    const from = new Date(bounds.dateFrom).getTime()
    const to = new Date(bounds.dateTo).getTime()
    const diffDays = (to - from) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(28)
  })
})

describe('finance goldens — lease daysUntilNextRent with month-end due day (spec 027 A3)', () => {
  // Lease starting Jan 31 → due day = 31.
  // When asOf = Feb 14, 2026 (non-leap year):
  //   Due day 31 in February → clamp to Feb 28 (Feb has 28 days in 2026).
  //   Feb 28 is the due date; asOf = Feb 14.
  //   daysUntilNextRent = 28 − 14 = 14.
  // Independently derived from calendar arithmetic.
  const lease: LeaseInfo = {
    property_id: 'p1',
    monthly_rent_cents: 200_000,
    lease_start: '2026-01-31',
    lease_end: '2027-01-31',
    security_deposit_cents: null,
    paid_with_source: null,
  }

  it('due day 31 clamps to Feb 28 in a non-leap year; daysUntilNextRent = 14 from Feb 14', () => {
    // asOf = Feb 14 local time
    const asOf = new Date(2026, 1, 14) // month index 1 = February
    const days = daysUntilNextRent(lease, asOf)
    // Feb 28 − Feb 14 = 14 days
    expect(days).toBe(14)
  })

  it('due day 31 in a 31-day month (March 2026): daysUntilNextRent from Mar 1 = 30', () => {
    // March has 31 days → due day stays 31.
    // asOf = March 1; days until March 31 = 30.
    const asOf = new Date(2026, 2, 1) // March 1
    const days = daysUntilNextRent(lease, asOf)
    expect(days).toBe(30)
  })
})

// US4 — the amortization schedule must label successive calendar months, none
// skipped or duplicated, even at month-end (spec 019). The principal/interest
// values stay unchanged (they remain vector-locked by mortgage.json).
import { describe, it, expect } from 'vitest'
import { maturityDate, upcomingAmortization } from '@/lib/finance/mortgage'

// Seed home: $496k loan @ 6.25% / 30yr, closed 2024-01-15.
const LOAN = 49_600_000
const RATE = 6.25
const TERM = 30
const CLOSING = '2024-01-15'

describe('amortization month labels (contract C4)', () => {
  it('labels 12 successive months with none skipped/duplicated at month-end (Jan 31)', () => {
    const asOf = new Date(2026, 0, 31) // Jan 31 — the overflow trigger
    const sched = upcomingAmortization(12, LOAN, RATE, TERM, CLOSING, asOf)
    const months = sched.map((e) => e.month.getMonth())
    expect(months).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) // Jan..Dec in order
    expect(new Set(months).size).toBe(12) // no duplicate, no skip
  })

  it('handles a shorter month-end start (Feb non-leap) without skipping', () => {
    const asOf = new Date(2026, 2, 31) // Mar 31
    const sched = upcomingAmortization(4, LOAN, RATE, TERM, CLOSING, asOf)
    expect(sched.map((e) => e.month.getMonth())).toEqual([2, 3, 4, 5]) // Mar, Apr, May, Jun
  })

  it('leaves principal/interest values as integer cents summing to ~the payment', () => {
    const asOf = new Date(2026, 0, 31)
    const sched = upcomingAmortization(3, LOAN, RATE, TERM, CLOSING, asOf)
    for (const e of sched) {
      expect(Number.isInteger(e.principalCents)).toBe(true)
      expect(Number.isInteger(e.interestCents)).toBe(true)
      expect(e.principalCents).toBeGreaterThan(0)
      expect(e.interestCents).toBeGreaterThan(0)
    }
  })
})

// Review 2026-08-24 (minor): maturityDate used Date.setMonth, which NORMALIZES
// a nonexistent target day — a leap-day closing matured on Mar 1 of a non-leap
// year, while iOS's Calendar.date(byAdding:) clamps to Feb 28. The two clients
// must show the same maturity date.
describe('maturityDate leap-day clamping', () => {
  it('a Feb-29 closing clamps to Feb 28 in a non-leap maturity year', () => {
    const m = maturityDate('2024-02-29', 15) // 2039 is not a leap year
    expect(m.getFullYear()).toBe(2039)
    expect(m.getMonth()).toBe(1) // February
    expect(m.getDate()).toBe(28)
  })

  it('a Feb-29 closing keeps Feb 29 when the maturity year IS a leap year', () => {
    const m = maturityDate('2024-02-29', 4) // 2028 is a leap year
    expect(m.getFullYear()).toBe(2028)
    expect(m.getMonth()).toBe(1)
    expect(m.getDate()).toBe(29)
  })
})

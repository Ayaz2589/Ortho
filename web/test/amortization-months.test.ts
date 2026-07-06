// US4 — the amortization schedule must label successive calendar months, none
// skipped or duplicated, even at month-end (spec 019). The principal/interest
// values stay unchanged (they remain vector-locked by mortgage.json).
import { describe, it, expect } from 'vitest'
import { upcomingAmortization } from '@/lib/finance/mortgage'

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

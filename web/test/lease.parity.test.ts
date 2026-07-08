import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { rentDueDay, daysUntilNextRent, daysUntilEnd, isRenewalSoon } from '@/components/housing/lease'
import type { LeaseInfo } from '@/lib/types'

// First golden vector for the lease date helpers (previously untested). The iOS
// LeaseParityTests assert the same file. The key case is the due-day > month-length
// CLAMP: iOS previously overflowed a day-31 due date into the next month (off by one).
// Integer/boolean outputs are timezone-stable; asOf is injected.
interface LeaseCase {
  input: { name: string; lease: LeaseInfo; asOf: string }
  expected: { rentDueDay: number; daysUntilNextRent: number; daysUntilEnd: number; isRenewalSoon: boolean }
}
const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/lease.json'), 'utf8')
) as LeaseCase[]

// Parse the asOf date string exactly as gen-vectors.ts does (local calendar date).
const asOfDate = (s: string): Date => {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

describe('lease golden vectors — date math matches iOS', () => {
  for (const { input, expected } of vectors) {
    describe(input.name, () => {
      const asOf = asOfDate(input.asOf)
      it('rentDueDay', () => expect(rentDueDay(input.lease)).toBe(expected.rentDueDay))
      it('daysUntilNextRent', () => expect(daysUntilNextRent(input.lease, asOf)).toBe(expected.daysUntilNextRent))
      it('daysUntilEnd', () => expect(daysUntilEnd(input.lease, asOf)).toBe(expected.daysUntilEnd))
      it('isRenewalSoon', () => expect(isRenewalSoon(input.lease, asOf)).toBe(expected.isRenewalSoon))
    })
  }
})

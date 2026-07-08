// US1 — Housing dates must be timezone-stable (spec 019).
// The bug only reproduces west of UTC. The rest of the suite runs under TZ=UTC
// (vitest.config.ts) with files sequential in a single worker, so we set the zone
// for THIS file only (in beforeAll) and restore it in afterAll — otherwise the
// change would leak into the UTC-pinned vector suites. Node honors a runtime TZ
// change for subsequent Date operations (verified), and the lease/format helpers
// read the timezone at call time, so this is deterministic.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseLocalDate, mediumDate, monthYear } from '@/lib/format'
import {
  rentDueDay,
  daysUntilNextRent,
  daysUntilEnd,
  isRenewalSoon,
  nextRentCaption,
} from '@/components/housing/lease'
import type { LeaseInfo } from '@/lib/types'

const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

const lease = (start: string, end: string): LeaseInfo => ({
  property_id: 'p1',
  monthly_rent_cents: 250000,
  lease_start: start,
  lease_end: end,
  security_deposit_cents: null,
  paid_with_source: null,
})

// Local calendar date (matches parseLocalDate / iOS Calendar.current).
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('parseLocalDate is timezone-stable (contract C1)', () => {
  it('reads the encoded Y/M/D regardless of timezone (here: America/New_York)', () => {
    const d = parseLocalDate('2025-09-01')
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2025, 9, 1])
    // The classic bug: raw new Date() would shift to Aug 31 in this tz.
    expect(new Date('2025-09-01').getDate()).toBe(31) // documents why the fix is needed
  })
})

describe('US1 rent-due day / countdowns are local-date correct (contract C2)', () => {
  it('rentDueDay of a lease starting on the 1st is 1, not the prev month-end', () => {
    expect(rentDueDay(lease('2025-09-01', '2026-08-31'))).toBe(1)
  })

  it('reads "Due today" on the actual rent-due date', () => {
    const asOf = local(2025, 9, 1) // the 1st, the due day
    expect(daysUntilNextRent(lease('2025-09-01', '2026-08-31'), asOf)).toBe(0)
    expect(nextRentCaption(lease('2025-09-01', '2026-08-31'), asOf)).toBe('Due today')
  })

  it('clamps a due day of 31 to the month length instead of overflowing (contract C2/D2)', () => {
    // Lease starts on the 31st → due day 31. In June (30 days) it should resolve
    // to June 30, i.e. 15 days from June 15 — not July 1 (16 days).
    const asOf = local(2025, 6, 15)
    expect(daysUntilNextRent(lease('2025-01-31', '2026-01-30'), asOf)).toBe(15)
  })

  it('daysUntilEnd counts to the stored lease-end calendar day', () => {
    const asOf = local(2025, 9, 1)
    expect(daysUntilEnd(lease('2025-09-01', '2025-09-30'), asOf)).toBe(29)
  })

  it('isRenewalSoon uses the corrected end date (≤60 days)', () => {
    const asOf = local(2025, 9, 1)
    expect(isRenewalSoon(lease('2025-01-01', '2025-10-15'), asOf)).toBe(true)
    expect(isRenewalSoon(lease('2025-01-01', '2026-06-01'), asOf)).toBe(false)
  })
})

describe('US1 date display renders the stored calendar date (contract C3)', () => {
  it('lease start/end format to the stored day, not one day early', () => {
    expect(mediumDate(parseLocalDate('2025-09-01'))).toBe('Sep 1, 2025')
    expect(mediumDate(parseLocalDate('2026-08-31'))).toBe('Aug 31, 2026')
    // Payment date example from the review.
    expect(mediumDate(parseLocalDate('2026-12-01'))).toBe('Dec 1, 2026')
  })

  it('mortgage closing-month caption names the correct month for a 1st-of-month closing', () => {
    expect(monthYear(parseLocalDate('2016-05-01'))).toBe('May 2016')
  })
})

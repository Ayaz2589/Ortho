import { describe, it, expect } from 'vitest'
import {
  startOfDay,
  startOfMonth,
  dayLabel,
  shortDate,
  mediumDate,
  monthYear,
  monthYearLong,
  relativeTime,
  groupByDay,
  groupDaysByMonth,
  expenseTotal,
  effectiveShares,
} from '@/lib/format'
import { makeTx } from './helpers/fixtures'

// Use local-time constructors throughout so assertions are independent of the
// runner's timezone (the source uses local setHours/getTime).
const DAY_MS = 24 * 60 * 60 * 1000

describe('startOfDay', () => {
  it('zeroes the time portion (local midnight)', () => {
    const d = new Date(2025, 0, 15, 13, 45, 30, 500)
    const s = startOfDay(d)
    expect(s.getHours()).toBe(0)
    expect(s.getMinutes()).toBe(0)
    expect(s.getSeconds()).toBe(0)
    expect(s.getMilliseconds()).toBe(0)
    expect(s.getFullYear()).toBe(2025)
    expect(s.getMonth()).toBe(0)
    expect(s.getDate()).toBe(15)
  })

  it('does not mutate the input', () => {
    const d = new Date(2025, 0, 15, 13, 45, 0)
    startOfDay(d)
    expect(d.getHours()).toBe(13)
  })
})

describe('startOfMonth', () => {
  it('returns local midnight on the first of the month', () => {
    const d = new Date(2025, 5, 20, 9, 0, 0)
    const s = startOfMonth(d)
    expect(s.getFullYear()).toBe(2025)
    expect(s.getMonth()).toBe(5)
    expect(s.getDate()).toBe(1)
    expect(s.getHours()).toBe(0)
  })
})

describe('dayLabel', () => {
  const now = new Date(2025, 0, 15, 10, 0, 0) // Wed Jan 15 2025

  it("returns 'Today' for the same day", () => {
    expect(dayLabel(new Date(2025, 0, 15, 23, 0, 0), 'en-US', now)).toBe('Today')
  })

  it("returns 'Yesterday' for one day earlier", () => {
    expect(dayLabel(new Date(2025, 0, 14, 1, 0, 0), 'en-US', now)).toBe('Yesterday')
  })

  it.each([
    [2, 'Monday'], // Jan 13
    [3, 'Sunday'], // Jan 12
    [6, 'Thursday'], // Jan 9
  ])('returns weekday name for %i days ago', (daysAgo, weekday) => {
    const date = new Date(2025, 0, 15 - daysAgo, 12, 0, 0)
    expect(dayLabel(date, 'en-US', now)).toBe(weekday)
  })

  it("returns 'MMM d' for more than 6 days ago", () => {
    const date = new Date(2025, 0, 8, 12, 0, 0) // 7 days ago
    expect(dayLabel(date, 'en-US', now)).toBe('Jan 8')
  })
})

describe('shortDate / mediumDate / monthYear / monthYearLong', () => {
  const date = new Date(2025, 0, 15, 12, 0, 0)

  it('shortDate', () => {
    expect(shortDate(date, 'en-US')).toBe('Jan 15')
  })
  it('mediumDate', () => {
    expect(mediumDate(date, 'en-US')).toBe('Jan 15, 2025')
  })
  it('monthYear', () => {
    expect(monthYear(date, 'en-US')).toBe('Jan 2025')
  })
  it('monthYearLong', () => {
    expect(monthYearLong(date, 'en-US')).toBe('January 2025')
  })
})

describe('relativeTime', () => {
  const now = new Date(2025, 0, 15, 12, 0, 0)

  it("returns 'just now' under a minute", () => {
    expect(relativeTime(new Date(now.getTime() - 30 * 1000), now)).toBe('just now')
  })
  it("returns 'Nm ago' for minutes", () => {
    expect(relativeTime(new Date(now.getTime() - 5 * 60 * 1000), now)).toBe('5m ago')
  })
  it("returns 'Nh ago' for hours", () => {
    expect(relativeTime(new Date(now.getTime() - 3 * 60 * 60 * 1000), now)).toBe('3h ago')
  })
  it("returns 'Nd ago' for days", () => {
    expect(relativeTime(new Date(now.getTime() - 2 * DAY_MS), now)).toBe('2d ago')
  })
})

describe('groupByDay', () => {
  it('orders days newest first, items within a day newest first', () => {
    // Build with explicit ISO timestamps so ordering is unambiguous.
    const jan15a = makeTx({ id: 'a', date: '2025-01-15T08:00:00.000Z' })
    const jan15b = makeTx({ id: 'b', date: '2025-01-15T18:00:00.000Z' })
    const jan10 = makeTx({ id: 'c', date: '2025-01-10T12:00:00.000Z' })

    const groups = groupByDay([jan10, jan15a, jan15b])

    expect(groups).toHaveLength(2)
    // newest day first
    expect(groups[0].items.map((t) => t.id)).toEqual(['b', 'a']) // newest item first
    expect(groups[1].items.map((t) => t.id)).toEqual(['c'])
    // day buckets in descending order
    expect(groups[0].day.getTime()).toBeGreaterThan(groups[1].day.getTime())
  })

  it('returns empty array for no transactions', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('groupDaysByMonth', () => {
  it('groups day-groups into months newest-first, preserving day order', () => {
    const feb = makeTx({ id: 'f', date: '2025-02-05T12:00:00.000Z' })
    const jan20 = makeTx({ id: 'j20', date: '2025-01-20T12:00:00.000Z' })
    const jan05 = makeTx({ id: 'j05', date: '2025-01-05T12:00:00.000Z' })

    const days = groupByDay([jan05, jan20, feb])
    const months = groupDaysByMonth(days)

    expect(months).toHaveLength(2)
    // February newest first
    expect(months[0].month.getMonth()).toBe(1) // Feb
    expect(months[1].month.getMonth()).toBe(0) // Jan
    // day order preserved within the Jan month (newest day first from groupByDay)
    const janDayIds = months[1].days.map((d) => d.items[0].id)
    expect(janDayIds).toEqual(['j20', 'j05'])
  })

  it('returns empty array for empty input', () => {
    expect(groupDaysByMonth([])).toEqual([])
  })
})

describe('expenseTotal', () => {
  it('sums expense amounts only, excluding income', () => {
    const items = [
      makeTx({ kind: 'expense', amount_cents: 1000 }),
      makeTx({ kind: 'expense', amount_cents: 250 }),
      makeTx({ kind: 'income', amount_cents: 9999 }),
    ]
    expect(expenseTotal(items)).toBe(1250)
  })

  it('returns 0 for an empty list', () => {
    expect(expenseTotal([])).toBe(0)
  })

  it('returns 0 when only income present', () => {
    expect(expenseTotal([makeTx({ kind: 'income', amount_cents: 500 })])).toBe(0)
  })
})

describe('effectiveShares', () => {
  it('splits evenly across N owners in cents, summing to the amount', () => {
    const tx = makeTx({ owner_ids: ['a', 'b', 'c', 'd'], amount_cents: 10000 })
    const shares = effectiveShares(tx)
    expect(Object.keys(shares)).toEqual(['a', 'b', 'c', 'd'])
    expect(Object.values(shares).every((v) => v === 2500)).toBe(true)
    expect(Object.values(shares).reduce((s, v) => s + v, 0)).toBe(10000)
  })

  it('single owner gets the full amount', () => {
    const tx = makeTx({ owner_ids: ['solo'], amount_cents: 9999 })
    expect(effectiveShares(tx)).toEqual({ solo: 9999 })
  })

  it('passes explicit cents shares through unchanged', () => {
    const explicit = { a: 7000, b: 3000 }
    const tx = makeTx({ owner_ids: ['a', 'b'], amount_cents: 10000, shares: explicit })
    expect(effectiveShares(tx)).toBe(explicit)
  })

  it('returns {} for zero owners', () => {
    const tx = makeTx({ owner_ids: [], amount_cents: 100, shares: {} })
    expect(effectiveShares(tx)).toEqual({})
  })

  it('even split of 3 sums to the amount (remainder to first)', () => {
    const tx = makeTx({ owner_ids: ['a', 'b', 'c'], amount_cents: 10000, shares: {} })
    const shares = effectiveShares(tx)
    expect(shares).toEqual({ a: 3334, b: 3333, c: 3333 })
    expect(Object.values(shares).reduce((s, v) => s + v, 0)).toBe(10000)
  })
})

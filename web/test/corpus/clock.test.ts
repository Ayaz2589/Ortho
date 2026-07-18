import { describe, it, expect } from 'vitest'
import { daysInMonth, isoAt, firstOfMonth, lastOfMonth, nonNoonUtc, addMonths } from './clock'

describe('corpus clock (spec 026)', () => {
  it('daysInMonth is leap-aware', () => {
    expect(daysInMonth(2027, 2)).toBe(28) // non-leap
    expect(daysInMonth(2028, 2)).toBe(29) // leap
    expect(daysInMonth(2027, 1)).toBe(31)
    expect(daysInMonth(2027, 4)).toBe(30)
    expect(daysInMonth(2027, 12)).toBe(31)
  })

  it('isoAt builds a UTC ISO string at the given time-of-day', () => {
    expect(isoAt(2027, 2, 1, 12, 0)).toBe('2027-02-01T12:00:00.000Z')
    expect(isoAt(2027, 2, 1, 0, 15)).toBe('2027-02-01T00:15:00.000Z')
  })

  it('firstOfMonth / lastOfMonth default to noon UTC and correct day', () => {
    expect(firstOfMonth(2027, 2)).toBe('2027-02-01T12:00:00.000Z')
    expect(lastOfMonth(2027, 2)).toBe('2027-02-28T12:00:00.000Z') // non-leap
    expect(lastOfMonth(2028, 2)).toBe('2028-02-29T12:00:00.000Z') // leap
    expect(lastOfMonth(2027, 1)).toBe('2027-01-31T12:00:00.000Z')
    expect(lastOfMonth(2027, 4)).toBe('2027-04-30T12:00:00.000Z')
  })

  it('nonNoonUtc stamps a non-noon time (the A2 boundary case)', () => {
    expect(nonNoonUtc(2027, 2, 1, 0, 15)).toBe('2027-02-01T00:15:00.000Z')
    expect(nonNoonUtc(2027, 1, 31, 23, 30)).toBe('2027-01-31T23:30:00.000Z')
  })

  it('addMonths normalizes across year boundaries', () => {
    expect(addMonths(2027, 7, 0)).toEqual({ year: 2027, month1: 7 })
    expect(addMonths(2027, 12, 1)).toEqual({ year: 2028, month1: 1 })
    expect(addMonths(2027, 1, -1)).toEqual({ year: 2026, month1: 12 })
    expect(addMonths(2027, 7, -18)).toEqual({ year: 2026, month1: 1 })
  })
})

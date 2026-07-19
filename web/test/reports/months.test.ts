import { describe, it, expect } from 'vitest'
import { monthsInInterval } from '@/lib/reports/months'

// Pure calendar-month splitting for the reports savings-rate series (spec 027).
// Windows are month-aligned, contiguous, non-overlapping, oldest→newest, and the
// last window's end equals the interval end.

describe('monthsInInterval', () => {
  it('returns one window for a single-month interval', () => {
    const start = new Date(2026, 5, 1) // Jun 2026 (local)
    const end = new Date(2026, 6, 1) // Jul 2026
    const wins = monthsInInterval({ start, end })
    expect(wins).toHaveLength(1)
    expect(wins[0].yyyymm).toBe('2026-06')
    expect(wins[0].start.getTime()).toBe(start.getTime())
    expect(wins[0].end.getTime()).toBe(end.getTime())
  })

  it('returns six contiguous windows for a six-month interval, oldest→newest', () => {
    const start = new Date(2026, 0, 1) // Jan 2026
    const end = new Date(2026, 6, 1) // Jul 2026 (exclusive) → Jan..Jun
    const wins = monthsInInterval({ start, end })
    expect(wins.map((w) => w.yyyymm)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
    // contiguous + non-overlapping: each window's end is the next window's start
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i].start.getTime()).toBe(wins[i - 1].end.getTime())
    }
    // last window's end equals the interval end
    expect(wins[wins.length - 1].end.getTime()).toBe(end.getTime())
    expect(wins[0].start.getTime()).toBe(start.getTime())
  })

  it('spans a year boundary correctly', () => {
    const start = new Date(2025, 10, 1) // Nov 2025
    const end = new Date(2026, 1, 1) // Feb 2026 (exclusive) → Nov, Dec, Jan
    const wins = monthsInInterval({ start, end })
    expect(wins.map((w) => w.yyyymm)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('returns no windows when start >= end', () => {
    const d = new Date(2026, 5, 1)
    expect(monthsInInterval({ start: d, end: d })).toEqual([])
  })
})

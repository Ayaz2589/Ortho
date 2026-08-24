// @vitest-environment jsdom
//
// useDashboardScope — the single source of the dashboard's time scope. Covers
// US1 (select a month → window/reference date) and US3 (mutual exclusivity with
// the relative range, and the selected month being a TRANSIENT override).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  transactions: [] as Array<{ date: string }>,
  locale: 'en-US',
}))
vi.mock('@/lib/store', () => ({
  useApp: () => ({ transactions: h.transactions, locale: h.locale }),
}))

import { useDashboardScope } from '@/lib/useDashboardRange'

const TX = [
  { date: '2026-06-15T12:00:00.000Z' },
  { date: '2026-04-02T09:00:00.000Z' },
  { date: '2026-05-10T18:00:00.000Z' },
]

beforeEach(() => {
  localStorage.clear()
  h.transactions = TX
  h.locale = 'en-US'
})

describe('useDashboardScope', () => {
  it('derives availableMonths newest-first and starts with no month selected', () => {
    const { result } = renderHook(() => useDashboardScope())
    expect(result.current.availableMonths).toEqual(['2026-06', '2026-05', '2026-04'])
    expect(result.current.selectedMonth).toBeNull()
    expect(result.current.isSpecificMonth).toBe(false)
  })

  it('selecting a past month resolves to the vectored monthBounds window + a fully-elapsed reference date (B2)', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setMonth('2026-04'))
    expect(result.current.selectedMonth).toBe('2026-04')
    expect(result.current.isSpecificMonth).toBe(true)
    expect(result.current.interval.start.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(result.current.interval.end.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    // spec 023 B2: a completed past month is fully elapsed (its last day at noon
    // UTC), not the old mid-month 15th that showed "~14 days left" for a finished
    // month and suppressed the under-budget insight.
    expect(result.current.referenceDate.toISOString()).toBe('2026-04-30T12:00:00.000Z')
    expect(result.current.periodLabel).toBe('April 2026')
  })

  it('choosing a relative range clears the selected month (mutual exclusivity)', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setMonth('2026-04'))
    expect(result.current.selectedMonth).toBe('2026-04')
    act(() => result.current.setRange('last3Months'))
    expect(result.current.selectedMonth).toBeNull()
    expect(result.current.range).toBe('last3Months')
  })

  it('clearMonth returns to the relative range', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setMonth('2026-05'))
    act(() => result.current.clearMonth())
    expect(result.current.selectedMonth).toBeNull()
    expect(result.current.isSpecificMonth).toBe(false)
  })

  it('the relative range persists but the selected month does NOT (transient)', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setRange('last6Months'))
    act(() => result.current.setMonth('2026-04'))
    // Only the range is written to storage — never the month.
    expect(localStorage.getItem('dashboardRange')).toBe('last6Months')
    expect(localStorage.length).toBe(1)
    // A fresh mount (relaunch) restores the range but no month.
    const second = renderHook(() => useDashboardScope())
    expect(second.result.current.selectedMonth).toBeNull()
  })

  it('a selected month the data no longer spans falls back to the relative range', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setMonth('2020-01')) // not in the data
    expect(result.current.selectedMonth).toBeNull()
    expect(result.current.isSpecificMonth).toBe(false)
  })
})

// Review 2026-08-24 (major): `now` was memoized once at mount, so a session
// left open across midnight (very normal for an installed app) kept reporting
// yesterday's "This month" window and a stale "Day X of Y" until a full
// re-mount. The scope now refreshes `now` when the app comes back to the
// foreground on a different local calendar day.
describe('useDashboardScope day-rollover refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 22, 0, 0)) // June 15 2026, 10pm local
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes `now` (and the interval) when visibility returns on a new day', () => {
    const { result } = renderHook(() => useDashboardScope())
    expect(result.current.now.getDate()).toBe(15)

    vi.setSystemTime(new Date(2026, 5, 16, 1, 0, 0)) // past midnight
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.now.getDate()).toBe(16)
    expect(result.current.referenceDate.getDate()).toBe(16)
  })

  it('keeps `now` referentially stable when visibility returns on the same day', () => {
    const { result } = renderHook(() => useDashboardScope())
    const before = result.current.now
    vi.setSystemTime(new Date(2026, 5, 15, 23, 30, 0)) // later, same day
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.now).toBe(before)
  })

  it('a window focus after a day change also refreshes', () => {
    const { result } = renderHook(() => useDashboardScope())
    vi.setSystemTime(new Date(2026, 5, 17, 9, 0, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current.now.getDate()).toBe(17)
  })
})

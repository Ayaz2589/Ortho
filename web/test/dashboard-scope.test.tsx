// @vitest-environment jsdom
//
// useDashboardScope — the single source of the dashboard's time scope. Covers
// US1 (select a month → window/reference date) and US3 (mutual exclusivity with
// the relative range, and the selected month being a TRANSIENT override).
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

  it('selecting a month resolves to the vectored monthBounds window + mid-month reference date', () => {
    const { result } = renderHook(() => useDashboardScope())
    act(() => result.current.setMonth('2026-04'))
    expect(result.current.selectedMonth).toBe('2026-04')
    expect(result.current.isSpecificMonth).toBe(true)
    expect(result.current.interval.start.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(result.current.interval.end.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(result.current.referenceDate.toISOString()).toBe('2026-04-15T12:00:00.000Z')
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

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'

// Mock the aggregate RPC layer at the module boundary (the test/aggregates.test.ts
// pattern). The hook is the first product consumer of these wrappers (spec 027 wiring).
const fetchMonthSummary = vi.fn()
const fetchCategoryTotals = vi.fn()
vi.mock('@/lib/api/aggregates', () => ({
  fetchMonthSummary: (...a: unknown[]) => fetchMonthSummary(...a),
  fetchCategoryTotals: (...a: unknown[]) => fetchCategoryTotals(...a),
}))

import { useReportsData } from '@/lib/useReportsData'

const HH = 'hh-1'
// Jan–Mar 2026 (3 months, exclusive end at Apr 1)
const interval = { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }

beforeEach(() => {
  fetchMonthSummary.mockReset()
  fetchCategoryTotals.mockReset()
})
afterEach(cleanup)

describe('useReportsData', () => {
  it('fetches category totals once and a month summary per month, then becomes ready', async () => {
    fetchMonthSummary.mockResolvedValue({ income: 420000, expense: 300000, net: 120000 })
    fetchCategoryTotals.mockResolvedValue([
      { category: 'groceries', cents: 6000 },
      { category: 'dining', cents: 3000 },
    ])

    const { result } = renderHook(() => useReportsData(HH, interval))

    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(fetchCategoryTotals).toHaveBeenCalledTimes(1)
    expect(fetchMonthSummary).toHaveBeenCalledTimes(3) // Jan, Feb, Mar
    expect(result.current.savings).toHaveLength(3)
    expect(result.current.savings[0]).toMatchObject({ yyyymm: '2026-01', incomeCents: 420000 })
    // ranked categories, groceries first
    expect(result.current.categories.map((c) => c.category)).toEqual(['groceries', 'dining'])
    expect(result.current.categories[0].share).toBeCloseTo(2 / 3, 6)
  })

  it('goes to error (never throws) when a fetch rejects, and retry re-issues', async () => {
    fetchCategoryTotals.mockRejectedValueOnce(new Error('boom'))
    fetchMonthSummary.mockResolvedValue({ income: 0, expense: 0, net: 0 })

    const { result } = renderHook(() => useReportsData(HH, interval))
    await waitFor(() => expect(result.current.status).toBe('error'))

    // retry: this time everything resolves
    fetchCategoryTotals.mockResolvedValue([{ category: 'coffee', cents: 500 }])
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.categories.map((c) => c.category)).toEqual(['coffee'])
  })

  it('does not fetch when householdId is falsy', async () => {
    renderHook(() => useReportsData('', interval))
    // give any effect a tick
    await Promise.resolve()
    expect(fetchMonthSummary).not.toHaveBeenCalled()
    expect(fetchCategoryTotals).not.toHaveBeenCalled()
  })
})

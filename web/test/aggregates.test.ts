import { describe, it, expect, vi, beforeEach } from 'vitest'

// A per-test-controllable rpc mock. Each test sets `rpc.mockResolvedValueOnce(...)`.
const rpc = vi.fn()
const mockClient = { rpc }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockClient,
}))

import {
  fetchOwnerSpend,
  fetchCategoryTotals,
  fetchMonthSummary,
  fetchDailyExpense,
} from '@/lib/api/aggregates'

const HOUSEHOLD = 'hh-1'
const START = new Date('2026-06-01T00:00:00.000Z')
const END = new Date('2026-06-30T23:59:59.000Z')

const expectedParams = {
  p_household_id: HOUSEHOLD,
  p_start: START.toISOString(),
  p_end: END.toISOString(),
}

beforeEach(() => {
  rpc.mockReset()
})

describe('fetchOwnerSpend', () => {
  it('calls the household_owner_spend RPC with ISO params and returns the data array', async () => {
    const rows = [{ user_id: 'u1', cents: 1000 }]
    rpc.mockResolvedValueOnce({ data: rows, error: null })

    const result = await fetchOwnerSpend(HOUSEHOLD, START, END)

    expect(rpc).toHaveBeenCalledWith('household_owner_spend', expectedParams)
    expect(result).toBe(rows)
  })

  it('returns an empty array when data is null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchOwnerSpend(HOUSEHOLD, START, END)).toEqual([])
  })

  it('throws when the RPC returns an error', async () => {
    const err = new Error('owner boom')
    rpc.mockResolvedValueOnce({ data: null, error: err })
    await expect(fetchOwnerSpend(HOUSEHOLD, START, END)).rejects.toBe(err)
  })
})

describe('fetchCategoryTotals', () => {
  it('calls the household_category_totals RPC with ISO params and returns data', async () => {
    const rows = [{ category: 'coffee', cents: 500 }]
    rpc.mockResolvedValueOnce({ data: rows, error: null })

    const result = await fetchCategoryTotals(HOUSEHOLD, START, END)

    expect(rpc).toHaveBeenCalledWith('household_category_totals', expectedParams)
    expect(result).toBe(rows)
  })

  it('returns an empty array when data is null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchCategoryTotals(HOUSEHOLD, START, END)).toEqual([])
  })

  it('throws when the RPC returns an error', async () => {
    const err = new Error('category boom')
    rpc.mockResolvedValueOnce({ data: null, error: err })
    await expect(fetchCategoryTotals(HOUSEHOLD, START, END)).rejects.toBe(err)
  })
})

describe('fetchMonthSummary', () => {
  it('calls the household_month_summary RPC with ISO params and returns the first row', async () => {
    const row = { income: 5000, expense: 3000, net: 2000 }
    rpc.mockResolvedValueOnce({ data: [row], error: null })

    const result = await fetchMonthSummary(HOUSEHOLD, START, END)

    expect(rpc).toHaveBeenCalledWith('household_month_summary', expectedParams)
    expect(result).toEqual(row)
  })

  it('falls back to zeroes when data is an empty array', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await fetchMonthSummary(HOUSEHOLD, START, END)).toEqual({
      income: 0,
      expense: 0,
      net: 0,
    })
  })

  it('falls back to zeroes when data is null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchMonthSummary(HOUSEHOLD, START, END)).toEqual({
      income: 0,
      expense: 0,
      net: 0,
    })
  })

  it('throws when the RPC returns an error', async () => {
    const err = new Error('summary boom')
    rpc.mockResolvedValueOnce({ data: null, error: err })
    await expect(fetchMonthSummary(HOUSEHOLD, START, END)).rejects.toBe(err)
  })
})

describe('fetchDailyExpense', () => {
  it('calls the household_daily_expense RPC with ISO params and returns data', async () => {
    const rows = [{ day: '2026-06-01', cents: 1200 }]
    rpc.mockResolvedValueOnce({ data: rows, error: null })

    const result = await fetchDailyExpense(HOUSEHOLD, START, END)

    expect(rpc).toHaveBeenCalledWith('household_daily_expense', expectedParams)
    expect(result).toBe(rows)
  })

  it('returns an empty array when data is null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchDailyExpense(HOUSEHOLD, START, END)).toEqual([])
  })

  it('throws when the RPC returns an error', async () => {
    const err = new Error('daily boom')
    rpc.mockResolvedValueOnce({ data: null, error: err })
    await expect(fetchDailyExpense(HOUSEHOLD, START, END)).rejects.toBe(err)
  })
})

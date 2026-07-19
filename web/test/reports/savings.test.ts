import { describe, it, expect } from 'vitest'
import { savingsRate, buildSavingsSeries } from '@/lib/reports/savings'
import type { MonthSummary } from '@/lib/api/aggregates'
import type { MonthWindow } from '@/lib/reports/months'

// Savings-rate math for the reports surface (spec 027). Cents in, ratio out.
// rate = (income − expense) / income; null when income <= 0 (→ rendered "—").

describe('savingsRate', () => {
  it('computes (income − expense) / income', () => {
    // 4200 in, 3100 out → 1100/4200 ≈ 0.2619
    expect(savingsRate(420000, 310000)).toBeCloseTo(0.2619, 4)
  })

  it('is negative for a shortfall (expense > income)', () => {
    // 4200 in, 4800 out → -600/4200 ≈ -0.142857
    expect(savingsRate(420000, 480000)).toBeCloseTo(-600 / 4200, 6)
  })

  it('is zero when income equals expense', () => {
    expect(savingsRate(420000, 420000)).toBe(0)
  })

  it('returns null when income is zero (no NaN / Infinity)', () => {
    expect(savingsRate(0, 0)).toBeNull()
    expect(savingsRate(0, 5000)).toBeNull()
  })

  it('returns null when income is negative', () => {
    expect(savingsRate(-100, 0)).toBeNull()
  })
})

describe('buildSavingsSeries', () => {
  const win = (yyyymm: string): MonthWindow => ({
    yyyymm,
    start: new Date(`${yyyymm}-01T00:00:00.000Z`),
    end: new Date(`${yyyymm}-28T00:00:00.000Z`),
  })

  it('produces one row per window in order, carrying income/expense/rate', () => {
    const windows = [win('2026-05'), win('2026-06')]
    const summaries: MonthSummary[] = [
      { income: 0, expense: 0, net: 0 },
      { income: 420000, expense: 360000, net: 60000 },
    ]
    const rows = buildSavingsSeries(windows, summaries)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      yyyymm: '2026-05',
      incomeCents: 0,
      expenseCents: 0,
      rate: null,
    })
    expect(rows[1].yyyymm).toBe('2026-06')
    expect(rows[1].incomeCents).toBe(420000)
    expect(rows[1].expenseCents).toBe(360000)
    expect(rows[1].rate).toBeCloseTo(60000 / 420000, 6)
  })

  it('represents an empty month as a neutral zero row (present, not omitted)', () => {
    const windows = [win('2026-05'), win('2026-06')]
    const summaries: MonthSummary[] = [
      { income: 420000, expense: 100000, net: 320000 },
      { income: 0, expense: 0, net: 0 },
    ]
    const rows = buildSavingsSeries(windows, summaries)
    expect(rows.map((r) => r.yyyymm)).toEqual(['2026-05', '2026-06'])
    expect(rows[1]).toEqual({
      yyyymm: '2026-06',
      incomeCents: 0,
      expenseCents: 0,
      rate: null,
    })
  })
})

import type { MonthSummary } from '@/lib/api/aggregates'
import type { MonthWindow } from '@/lib/reports/months'

/** One month's income, expense, and savings rate for the savings-rate view. */
export interface SavingsRateRow {
  yyyymm: string
  incomeCents: number
  expenseCents: number
  /** (income − expense) / income, or `null` when income <= 0 (rendered "—"). */
  rate: number | null
}

/**
 * The savings rate for a period: `(income − expense) / income`, as a ratio.
 * Returns `null` when income is zero or negative — the rate is undefined there, so
 * the view renders "—" instead of a misleading 0%, `NaN`, or `Infinity` (spec 027,
 * FR-008). Cents in, ratio out; the render layer formats the percent.
 */
export function savingsRate(incomeCents: number, expenseCents: number): number | null {
  if (incomeCents <= 0) return null
  return (incomeCents - expenseCents) / incomeCents
}

/**
 * Zip month windows with their fetched summaries into per-month savings rows, in
 * order. A month with no activity (a `{0,0,0}` summary) still yields a row — a
 * neutral zero entry with a `null` rate — so the timeline has no silent gaps
 * (spec 027 clarification). `summaries[i]` corresponds to `windows[i]`.
 */
export function buildSavingsSeries(
  windows: MonthWindow[],
  summaries: MonthSummary[]
): SavingsRateRow[] {
  return windows.map((w, i) => {
    const s = summaries[i] ?? { income: 0, expense: 0, net: 0 }
    return {
      yyyymm: w.yyyymm,
      incomeCents: s.income,
      expenseCents: s.expense,
      rate: savingsRate(s.income, s.expense),
    }
  })
}

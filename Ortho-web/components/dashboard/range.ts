import type { Transaction } from '@/lib/types'

/** Time window the Dashboard's range-aware widgets compute over. */
export type DashboardRange =
  | 'thisMonth'
  | 'last3Months'
  | 'last6Months'
  | 'last12Months'

export const DASHBOARD_RANGES: DashboardRange[] = [
  'thisMonth',
  'last3Months',
  'last6Months',
  'last12Months',
]

/** Compact label for the segmented picker — "Month / 3M / 6M / 1Y". */
export function shortLabel(r: DashboardRange): string {
  switch (r) {
    case 'thisMonth':
      return 'Month'
    case 'last3Months':
      return '3M'
    case 'last6Months':
      return '6M'
    case 'last12Months':
      return '1Y'
  }
}

/** Longer label used in widget headers. */
export function longLabel(r: DashboardRange): string {
  switch (r) {
    case 'thisMonth':
      return 'This month'
    case 'last3Months':
      return 'Last 3 months'
    case 'last6Months':
      return 'Last 6 months'
    case 'last12Months':
      return 'Last 12 months'
  }
}

/** Number of calendar months the range covers (1 / 3 / 6 / 12). */
export function monthCount(r: DashboardRange): number {
  switch (r) {
    case 'thisMonth':
      return 1
    case 'last3Months':
      return 3
    case 'last6Months':
      return 6
    case 'last12Months':
      return 12
  }
}

export interface Interval {
  start: Date
  /** Exclusive end (start of the month after the current month). */
  end: Date
}

/**
 * Calendar interval ending at the end of the month containing `now`.
 * For `thisMonth` it's just that month [1st, next 1st). For longer
 * ranges the start is `monthCount - 1` months earlier.
 */
export function rangeInterval(r: DashboardRange, now: Date = new Date()): Interval {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const count = monthCount(r)
  if (count <= 1) return { start: monthStart, end: nextMonthStart }
  const start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
  return { start, end: nextMonthStart }
}

/**
 * The ranges the existing data fully spans. A range is available when the
 * months between the earliest transaction date and `now` is at least
 * `monthCount - 1`. `thisMonth` is always available.
 */
export function availableRanges(
  transactions: Transaction[],
  now: Date = new Date()
): DashboardRange[] {
  if (transactions.length === 0) return ['thisMonth']
  let earliest = Infinity
  for (const t of transactions) {
    const ts = new Date(t.date).getTime()
    if (ts < earliest) earliest = ts
  }
  const earliestDate = new Date(earliest)
  const monthsBack =
    (now.getFullYear() - earliestDate.getFullYear()) * 12 +
    (now.getMonth() - earliestDate.getMonth())
  return DASHBOARD_RANGES.filter((r) => monthsBack >= monthCount(r) - 1)
}

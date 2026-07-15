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

// ── Specific-month selection (parity-locked) ────────────────────────────────
// These three are pure and golden-vectored (`dashboard-month-scope.json`) so the
// month list, reference date, and stepping match iOS exactly. The selected-month
// → window conversion itself reuses the already-vectored `monthBounds` and lives
// in the dashboard scope hook (it needs a runtime import; these stay import-free
// so the vector generator can load this module under tsx).

/**
 * Distinct calendar months (`'YYYY-MM'`) present in the data, **newest first**.
 * The key is the first 7 chars of the stored ISO `date` (a string slice, not a
 * local-calendar re-bucket) so web and iOS list the same months — including rows
 * whose timestamp sits on a month boundary.
 */
export function availableMonths(transactions: Transaction[]): string[] {
  const set = new Set<string>()
  for (const t of transactions) set.add(t.date.slice(0, 7))
  return [...set].sort((a, b) => b.localeCompare(a))
}

/**
 * A reference date safely inside `yyyymm` — the 15th at 12:00 UTC. Feeds the
 * budget/insight engines when a month is selected so their calendar math lands
 * on that month (and its prior month) in every timezone.
 */
export function monthReferenceDate(yyyymm: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyymm)) {
    throw new Error(`INVALID_MONTH: ${JSON.stringify(yyyymm)}`)
  }
  return new Date(`${yyyymm}-15T12:00:00.000Z`)
}

/**
 * Reference date for the budget/insight engines when a specific month is
 * selected: `now` when `yyyymm` is the current month (real elapsed time),
 * otherwise the month's LAST day at noon UTC (fully elapsed). Never the
 * mid-month `monthReferenceDate` heuristic — that reported "~14 days left" for
 * a long-finished month and, pinning `monthProgress` at ~0.48, permanently
 * suppressed the "under budget" card (whose rule needs `monthProgress >= 0.7`).
 * (spec 023 B2). Future months — not reachable from the month picker, which only
 * lists months with data — fall through to the fully-elapsed branch.
 */
export function monthInsightReference(yyyymm: string, now: Date = new Date()): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyymm)) {
    throw new Error(`INVALID_MONTH: ${JSON.stringify(yyyymm)}`)
  }
  const [y, m] = yyyymm.split('-').map(Number)
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now
  const lastDay = new Date(y, m, 0).getDate()
  return new Date(`${yyyymm}-${String(lastDay).padStart(2, '0')}T12:00:00.000Z`)
}

/**
 * Step to the chronologically adjacent month within `months` (which is
 * newest-first), or `null` at the data edge. `'prev'` = older, `'next'` = newer.
 */
export function stepMonth(
  months: string[],
  current: string,
  direction: 'prev' | 'next'
): string | null {
  const i = months.indexOf(current)
  if (i < 0) return null
  const j = direction === 'prev' ? i + 1 : i - 1
  return j >= 0 && j < months.length ? months[j] : null
}

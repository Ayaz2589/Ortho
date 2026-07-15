import type { Transaction } from './types'
import { evenShares, orderedOwnerIds } from './splits'

/** Per-owner cents for a transaction. Falls back to an even split when shares
 *  are absent (defensive — persisted transactions always carry materialized
 *  cents shares that sum to the amount). The fallback computes over the
 *  canonical owner order so the leftover cent matches iOS (see `orderedOwnerIds`). */
export function effectiveShares(tx: Transaction): Record<string, number> {
  if (tx.shares && Object.keys(tx.shares).length > 0) return tx.shares
  return evenShares(tx.amount_cents, orderedOwnerIds(tx.owner_ids))
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** First instant of the month containing `d` (local time). */
export function startOfMonth(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(1)
  return x
}

/** Parse a `YYYY-MM-DD` (or ISO) date as a **local** calendar date, so month/day
 *  arithmetic and display are timezone-stable and match Swift's `Calendar.current`.
 *  Plain `new Date('YYYY-MM-DD')` parses at UTC midnight and shifts a day in
 *  negative-UTC timezones — every stored `date` column must go through here. */
export function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

// Intl.DateTimeFormat construction is expensive and these run per row / day-header.
// Cache one formatter per (locale, options) — the options are fixed literals, so
// the key is stable and the formatted output byte-identical (spec 023 P2).
const dateFormatters = new Map<string, Intl.DateTimeFormat>()
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let fmt = dateFormatters.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options)
    dateFormatters.set(key, fmt)
  }
  return fmt
}

/** "Today" / "Yesterday" / weekday / "MMM d" relative to now. */
export function dayLabel(date: Date, locale: string = 'en-US', now: Date = new Date()): string {
  const a = startOfDay(date).getTime()
  const b = startOfDay(now).getTime()
  const diffDays = Math.round((b - a) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays >= 2 && diffDays <= 6) {
    return dateFormatter(locale, { weekday: 'long' }).format(date)
  }
  return dateFormatter(locale, { month: 'short', day: 'numeric' }).format(date)
}

export function shortDate(date: Date, locale: string = 'en-US'): string {
  return dateFormatter(locale, { month: 'short', day: 'numeric' }).format(date)
}

export function mediumDate(date: Date, locale: string = 'en-US'): string {
  return dateFormatter(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function monthYear(date: Date, locale: string = 'en-US'): string {
  return dateFormatter(locale, { month: 'short', year: 'numeric' }).format(date)
}

/** Full month name + year, e.g. "January 2025". */
export function monthYearLong(date: Date, locale: string = 'en-US'): string {
  return dateFormatter(locale, { month: 'long', year: 'numeric' }).format(date)
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/** Group transactions into day buckets, newest day first; items within a day newest first. */
export interface TxDayGroup {
  day: Date
  items: Transaction[]
}

export function groupByDay(txs: Transaction[]): TxDayGroup[] {
  const buckets = new Map<number, Transaction[]>()
  for (const t of txs) {
    const key = startOfDay(new Date(t.date)).getTime()
    const arr = buckets.get(key) ?? []
    arr.push(t)
    buckets.set(key, arr)
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, items]) => ({
      day: new Date(key),
      items: items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }))
}

/** Group day-buckets into month-buckets, newest month first. Days keep their order. */
export interface TxMonthGroup {
  month: Date
  days: TxDayGroup[]
}

export function groupDaysByMonth(days: TxDayGroup[]): TxMonthGroup[] {
  const buckets = new Map<number, TxDayGroup[]>()
  for (const d of days) {
    const key = startOfMonth(d.day).getTime()
    const arr = buckets.get(key) ?? []
    arr.push(d)
    buckets.set(key, arr)
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, dayGroups]) => ({ month: new Date(key), days: dayGroups }))
}

/** Sum of expense amounts in a list (income excluded). */
export function expenseTotal(items: Transaction[]): number {
  return items.reduce((sum, t) => (t.kind === 'expense' ? sum + t.amount_cents : sum), 0)
}

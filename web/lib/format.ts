import type { Transaction } from './types'

/** Even or explicit splits for a transaction (percent per owner id). */
export function effectiveSplits(tx: Transaction): Record<string, number> {
  if (tx.splits && Object.keys(tx.splits).length > 0) return tx.splits
  const owners = tx.owner_ids
  if (owners.length === 0) return {}
  const even = 100 / owners.length
  const out: Record<string, number> = {}
  owners.forEach((id) => (out[id] = even))
  return out
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

/** "Today" / "Yesterday" / weekday / "MMM d" relative to now. */
export function dayLabel(date: Date, locale: string = 'en-US', now: Date = new Date()): string {
  const a = startOfDay(date).getTime()
  const b = startOfDay(now).getTime()
  const diffDays = Math.round((b - a) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays >= 2 && diffDays <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

export function shortDate(date: Date, locale: string = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

export function mediumDate(date: Date, locale: string = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    date
  )
}

export function monthYear(date: Date, locale: string = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date)
}

/** Full month name + year, e.g. "January 2025". */
export function monthYearLong(date: Date, locale: string = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
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

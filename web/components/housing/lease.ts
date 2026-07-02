import { startOfDay } from '@/lib/format'
import type { LeaseInfo } from '@/lib/types'

const DAY = 1000 * 60 * 60 * 24

/** Day-of-month rent is "due", derived from the lease start date. */
export function rentDueDay(lease: LeaseInfo): number {
  return new Date(lease.lease_start).getDate()
}

/**
 * Days until the next rent-due date in the current/next calendar month.
 * Never negative — rolls to next month once this month's due day has passed.
 */
export function daysUntilNextRent(lease: LeaseInfo, asOf: Date = new Date()): number {
  const today = startOfDay(asOf)
  const due = rentDueDay(lease)
  const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), due)
  const target =
    thisMonthDue.getTime() >= today.getTime()
      ? thisMonthDue
      : new Date(today.getFullYear(), today.getMonth() + 1, due)
  return Math.round((startOfDay(target).getTime() - today.getTime()) / DAY)
}

/** Days between today and lease end (negative if already ended). */
export function daysUntilEnd(lease: LeaseInfo, asOf: Date = new Date()): number {
  const today = startOfDay(asOf)
  const end = startOfDay(new Date(lease.lease_end))
  return Math.round((end.getTime() - today.getTime()) / DAY)
}

/** True when the lease ends within the next 60 days. */
export function isRenewalSoon(lease: LeaseInfo, asOf: Date = new Date()): boolean {
  const d = daysUntilEnd(lease, asOf)
  return d >= 0 && d <= 60
}

/** Caption for the rent hero card ("Due today" / "Due tomorrow" / "Due in N days"). */
export function nextRentCaption(lease: LeaseInfo, asOf: Date = new Date()): string {
  const days = daysUntilNextRent(lease, asOf)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

/** Localized variant of `nextRentCaption` for callers with a store `t`. */
export function rentDueCaption(
  days: number,
  t: (key: string, ...args: Array<string | number>) => string
): string {
  if (days === 0) return t('Due today')
  if (days === 1) return t('Due tomorrow')
  return t('Due in {0} days', days)
}

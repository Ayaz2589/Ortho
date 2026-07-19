import type { Interval } from '@/components/dashboard/range'

/**
 * A single calendar month within a reports window. `start`/`end` are the
 * half-open `[start, end)` bounds of that month; `yyyymm` is its `'YYYY-MM'` key.
 */
export interface MonthWindow {
  yyyymm: string
  start: Date
  end: Date
}

/**
 * Split a dashboard `Interval` into the calendar months it covers, oldest→newest.
 *
 * The reports savings-rate series needs a value per month, but the
 * `household_month_summary` RPC aggregates a whole window — so we split the window
 * here (pure) and fetch one summary per month (spec 027, D2). Windows are built on
 * the LOCAL calendar to match `rangeInterval` (which produces local first-of-month
 * bounds), so the derived `yyyymm` labels never drift a month across timezones.
 * The result is contiguous and non-overlapping; the last window's `end` equals the
 * interval `end`.
 */
export function monthsInInterval({ start, end }: Interval): MonthWindow[] {
  const out: MonthWindow[] = []
  let y = start.getFullYear()
  let m = start.getMonth()
  while (true) {
    const wStart = new Date(y, m, 1)
    if (wStart.getTime() >= end.getTime()) break
    const wEnd = new Date(y, m + 1, 1)
    out.push({
      yyyymm: `${y}-${String(m + 1).padStart(2, '0')}`,
      start: wStart,
      end: wEnd,
    })
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return out
}

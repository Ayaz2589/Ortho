// Fixed-epoch date helpers for the coverage corpus (spec 026).
//
// All corpus dates derive from a FIXED anchor — never `Date.now()` — so the
// corpus is byte-identical on every run and machine. Dates are built in UTC via
// `Date.UTC`; the app's storage regime is noon-UTC (see web/.../TxForm.tsx), so
// `firstOfMonth`/`lastOfMonth` default to 12:00Z. `nonNoonUtc` deliberately
// stamps a non-noon time for the A2 timezone-bucketing reproduction.

/** The corpus "now". July 2027 gives us: a non-leap Feb (2027) and a leap Feb
 *  (2028) within reach, and closings old enough to fully pay off a mortgage. */
export const EPOCH = { year: 2027, month: 7 } as const // month is 1-based

/** Days in a 1-based month, leap-aware. `Date.UTC(y, m, 0)` = last day of month m. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** ISO-8601 UTC string for an explicit calendar date + time-of-day. */
export function isoAt(
  year: number,
  month1: number,
  day: number,
  hour = 12,
  minute = 0,
  second = 0
): string {
  return new Date(Date.UTC(year, month1 - 1, day, hour, minute, second)).toISOString()
}

/** First day of a month at noon-UTC (the app storage regime). */
export function firstOfMonth(year: number, month1: number, hour = 12, minute = 0): string {
  return isoAt(year, month1, 1, hour, minute)
}

/** Last day of a month at noon-UTC (leap-aware). */
export function lastOfMonth(year: number, month1: number, hour = 12, minute = 0): string {
  return isoAt(year, month1, daysInMonth(year, month1), hour, minute)
}

/** A boundary date stamped at a NON-noon UTC time — the A2 (spec 026) case that
 *  a timezone west of UTC can push into the adjacent month. */
export function nonNoonUtc(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute: number
): string {
  return isoAt(year, month1, day, hour, minute)
}

/** Shift a (year, month1) pair by `delta` months, normalizing the year. */
export function addMonths(year: number, month1: number, delta: number): { year: number; month1: number } {
  const zero = (year * 12 + (month1 - 1)) + delta
  return { year: Math.floor(zero / 12), month1: (zero % 12) + 1 }
}

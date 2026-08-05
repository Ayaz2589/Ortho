import type { Transaction } from '@/lib/types'
import type { Interval } from '@/components/dashboard/range'

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Number of non-zero intensity bands (level 0 is "no spend"). */
const BANDS = 6

export interface HeatmapDay {
  /** Local midnight of the calendar day. */
  date: Date
  /** Total EXPENSE cents on that day (income/transfers excluded). */
  cents: number
  /** Intensity 0 (no spend) … 6 (heaviest), by spend RANK within the window. */
  level: HeatmapLevel
}

/** Local midnight of `d` — the day-bucket key (timezone-stable per the app rule). */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Daily expense intensity across the scope window, for the net-summary heatmap.
 *
 * Enumerates every calendar day in `[interval.start, interval.end)` and sums
 * EXPENSE cents per day (income and transfers are excluded — this is a spending
 * heatmap). `level` is the day's spend RANK among the window's SPENDING days,
 * bucketed into `BANDS` (6) shades via a ties-averaged percentile: a day sits at
 * `(#daysBelow + ½·#daysEqual) / #spendingDays` of the ramp. Ranking (rather than
 * a fraction of the single busiest day) keeps the whole ramp in use, so different
 * daily amounts read as different shades and one big outlier no longer floors every
 * other day to the lightest band; tied amounts share a band. The window's
 * heaviest day(s) are always pinned to the top band, so a sparse window (few
 * spending days, where the mid-percentile would otherwise fall short) still shows
 * its busiest day darkest. 0 = a no-spend day. Pure + deterministic; cents in,
 * buckets out (the render layer maps levels → token tints, never red).
 */
export function buildSpendHeatmap(transactions: Transaction[], interval: Interval): HeatmapDay[] {
  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()

  const byDay = new Map<number, number>()
  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const ms = new Date(tx.date).getTime()
    if (ms < startMs || ms >= endMs) continue
    const key = startOfLocalDay(new Date(tx.date)).getTime()
    byDay.set(key, (byDay.get(key) ?? 0) + tx.amount_cents)
  }

  const raw: { date: Date; cents: number }[] = []
  let cursor = startOfLocalDay(interval.start)
  while (cursor.getTime() < endMs) {
    raw.push({ date: cursor, cents: byDay.get(cursor.getTime()) ?? 0 })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }

  // Rank buckets are computed over SPENDING days only, so a month of mostly-quiet
  // days still uses the full ramp for the days that do have spend.
  const spend = raw.map((r) => r.cents).filter((c) => c > 0)
  const n = spend.length
  const max = n > 0 ? Math.max(...spend) : 0

  return raw.map(({ date, cents }) => {
    let level: HeatmapLevel = 0
    if (cents > 0 && n > 0) {
      if (cents === max) {
        // The window's busiest day(s) always take the darkest band, so a sparse
        // window still reads its heaviest day as heaviest.
        level = BANDS as HeatmapLevel
      } else {
        let below = 0
        let equal = 0
        for (const v of spend) {
          if (v < cents) below++
          else if (v === cents) equal++
        }
        const pct = (below + equal / 2) / n // ties-averaged percentile
        level = Math.min(BANDS, Math.max(1, Math.ceil(pct * BANDS))) as HeatmapLevel
      }
    }
    return { date, cents, level }
  })
}

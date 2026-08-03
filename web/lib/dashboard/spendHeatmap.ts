import type { Transaction } from '@/lib/types'
import type { Interval } from '@/components/dashboard/range'

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

export interface HeatmapDay {
  /** Local midnight of the calendar day. */
  date: Date
  /** Total EXPENSE cents on that day (income/transfers excluded). */
  cents: number
  /** Intensity 0 (no spend) … 4 (busiest), relative to the busiest day in range. */
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
 * heatmap). `level` is RELATIVE to the busiest day in the window: 0 for a
 * no-spend day, else 1–4 by quartile of the max, so the ramp always uses its full
 * range regardless of the household's absolute spend. Pure + deterministic; cents
 * in, buckets out (the render layer maps levels → token tints, never red).
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
  let max = 0
  let cursor = startOfLocalDay(interval.start)
  while (cursor.getTime() < endMs) {
    const cents = byDay.get(cursor.getTime()) ?? 0
    if (cents > max) max = cents
    raw.push({ date: cursor, cents })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }

  return raw.map(({ date, cents }) => {
    let level: HeatmapLevel = 0
    if (cents > 0 && max > 0) {
      const q = cents / max
      level = q > 0.75 ? 4 : q > 0.5 ? 3 : q > 0.25 ? 2 : 1
    }
    return { date, cents, level }
  })
}

'use client'

import { useApp } from '@/lib/store'
import { shortDate } from '@/lib/format'
import { buildSpendHeatmap, type HeatmapLevel } from '@/lib/dashboard/spendHeatmap'
import type { Interval } from '@/components/dashboard/range'

/** Level → token tint. A calm sand `--accent` ramp on the neutral chip track —
 *  spend is never rendered red (money-first system). */
const LEVEL_BG: Record<HeatmapLevel, string> = {
  0: 'var(--chip-bg)',
  1: 'color-mix(in srgb, var(--accent) 28%, var(--chip-bg))',
  2: 'color-mix(in srgb, var(--accent) 50%, var(--chip-bg))',
  3: 'color-mix(in srgb, var(--accent) 72%, var(--chip-bg))',
  4: 'var(--accent)',
}

/**
 * Daily-spending heatmap (spec 037) shown beside the net-summary figures. A
 * GitHub-style calendar: each day in the scope window is a small square tinted by
 * that day's expense intensity (relative to the busiest day). Weeks are columns,
 * weekdays are rows (Sun→Sat); leading spacers align the first day to its weekday.
 * Reads data from `useApp()`; the window is passed in from the hero's shared scope.
 */
export function SpendHeatmap({ interval }: { interval: Interval }) {
  const { transactions, formatMoney, t, locale } = useApp()
  const days = buildSpendHeatmap(transactions, interval)
  if (days.length === 0) return null

  const leadingSpacers = days[0].date.getDay() // 0 = Sunday

  return (
    <div
      role="img"
      aria-label={t('Daily spending')}
      className="grid grid-flow-col gap-1"
      style={{ gridTemplateRows: 'repeat(7, 11px)' }}
    >
      {Array.from({ length: leadingSpacers }).map((_, i) => (
        <span key={`spacer-${i}`} aria-hidden />
      ))}
      {days.map((d) => (
        <span
          key={d.date.getTime()}
          title={`${shortDate(d.date, locale)} · ${formatMoney(d.cents)}`}
          className="rounded-[3px]"
          style={{ width: 11, height: 11, background: LEVEL_BG[d.level] }}
        />
      ))}
    </div>
  )
}

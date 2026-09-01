'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { shortDate } from '@/lib/format'
import { buildSpendHeatmap, type HeatmapDay, type HeatmapLevel } from '@/lib/dashboard/spendHeatmap'
import type { Interval } from '@/components/dashboard/range'

/** Level → token tint. A calm sand `--accent` ramp on the neutral chip track, in
 *  six graded steps so different daily amounts separate clearly — spend is never
 *  rendered red (money-first system). The top band deepens the accent toward
 *  `--text` so the heaviest days stay distinct from the near-full steps. */
const LEVEL_BG: Record<HeatmapLevel, string> = {
  0: 'var(--chip-bg)',
  1: 'color-mix(in srgb, var(--accent) 20%, var(--chip-bg))',
  2: 'color-mix(in srgb, var(--accent) 36%, var(--chip-bg))',
  3: 'color-mix(in srgb, var(--accent) 54%, var(--chip-bg))',
  4: 'color-mix(in srgb, var(--accent) 74%, var(--chip-bg))',
  5: 'var(--accent)',
  6: 'color-mix(in srgb, var(--accent) 86%, var(--text))',
}

const CELL = 14

/** Locale-aware single-letter weekday headers, Sun→Sat (no catalog keys needed —
 *  `Intl` renders them per locale). Anchored to a known week (2024-01-07 = Sun). */
function weekdayInitials(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)))
}

/**
 * Daily-spending heatmap shown beside the net-summary figures — a calendar-style
 * grid: weekday-labelled rows (Sun→Sat), weeks as columns, each day a small square
 * tinted by that day's expense intensity (relative to the busiest day). Every day
 * is a real `<button>`: clicking it PINS a tooltip with the full date + amount, so
 * the heatmap conveys per-day detail rather than reading as anonymous dots. The
 * grid scrolls horizontally (scrollbar hidden) so a long range never overflows the
 * hero, while the tooltip sits outside the scroll area so it is never clipped.
 * Reads data from `useApp()`; the window is the hero's shared scope, and
 * `personId` its member scope — with a member picked each day shows THAT person's
 * share of the spending, so the grid agrees with the hero figures beside it.
 */
export function SpendHeatmap({
  interval,
  personId = null,
}: {
  interval: Interval
  personId?: string | null
}) {
  const { transactions, formatMoney, t, locale } = useApp()
  const days = useMemo(
    () => buildSpendHeatmap(transactions, interval, personId),
    [transactions, interval, personId]
  )
  const [selected, setSelected] = useState<HeatmapDay | null>(null)
  const [hovered, setHovered] = useState<HeatmapDay | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss the pinned tooltip on outside click / Escape (mirrors the pickers).
  useEffect(() => {
    if (!selected) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setSelected(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [selected])

  if (days.length === 0) return null

  const weekdays = weekdayInitials(locale)
  const leadingSpacers = days[0].date.getDay() // 0 = Sunday
  const active = hovered ?? selected

  return (
    <div ref={ref} className="relative flex max-w-full flex-col gap-1 pt-7">
      {/* Tooltip — pinned by click, previewed on hover. Sits above the grid and
          outside the horizontal scroll area so it is never clipped. */}
      {active ? (
        <div
          data-testid="heatmap-tooltip"
          role="status"
          className="absolute left-0 top-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] tabular-nums text-text"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-sheet)' }}
        >
          <span className="text-text-2">{shortDate(active.date, locale)}</span>
          <span className="mx-1.5 text-text-3">·</span>
          {formatMoney(active.cents)}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        {/* Weekday label column, aligned to the day rows. */}
        <div className="grid gap-1" style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }} aria-hidden>
          {weekdays.map((d, i) => (
            <span
              key={i}
              className="flex items-center text-[9px] leading-none text-text-3"
              style={{ height: CELL }}
            >
              {d}
            </span>
          ))}
        </div>

        {/* The day grid — weeks as columns. Scrolls horizontally for long ranges. */}
        <div className="no-scrollbar min-w-0 overflow-x-auto pb-1">
          <div
            role="group"
            aria-label={t('Daily spending')}
            className="grid grid-flow-col gap-1"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }}
          >
            {Array.from({ length: leadingSpacers }).map((_, i) => (
              <span key={`spacer-${i}`} aria-hidden />
            ))}
            {days.map((d) => {
              const isActive = active?.date.getTime() === d.date.getTime()
              return (
                <button
                  key={d.date.getTime()}
                  type="button"
                  aria-label={`${shortDate(d.date, locale)} · ${formatMoney(d.cents)}`}
                  onClick={() =>
                    setSelected((cur) => (cur?.date.getTime() === d.date.getTime() ? null : d))
                  }
                  onMouseEnter={() => setHovered(d)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(d)}
                  onBlur={() => setHovered(null)}
                  className="rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  style={{
                    width: CELL,
                    height: CELL,
                    background: LEVEL_BG[d.level],
                    boxShadow: isActive ? '0 0 0 1.5px var(--text-3)' : undefined,
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

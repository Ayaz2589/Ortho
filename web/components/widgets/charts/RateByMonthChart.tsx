'use client'

import { BarChart, Bar, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'

export interface RateByMonthPoint {
  key: string
  /** Rounded percent. A month with no income (undefined rate) passes `0` here
   *  and is excluded from best/leanest/selected emphasis by the caller — the
   *  panel renders its label as "—" separately, outside this chart. */
  ratePct: number
  hasRate: boolean
}

/**
 * The savings-trends panel's month-by-month rate bar chart (spec 057 US5
 * redesign) — the card's own bar-per-month identity, extended rather than
 * abandoned: a dashed window-average reference, and the best/leanest/selected
 * month emphasised by opacity and an outline, never by a second colour.
 * Axis-free, no gridlines/tooltip, matching `SavingsRateChart`'s restraint —
 * the panel renders its own rate/month label strip below this, outside
 * recharts, so it stays legible with any month count.
 */
export function RateByMonthChart({
  data,
  averagePct,
  bestKey,
  leanestKey,
  selectedKey,
}: {
  data: RateByMonthPoint[]
  averagePct: number | null
  bestKey?: string | null
  leanestKey?: string | null
  selectedKey?: string | null
}) {
  const mutedFill = 'color-mix(in srgb, var(--text) 30%, transparent)'

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={100}>
      <BarChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
        <ReferenceLine y={0} stroke="var(--hairline)" strokeWidth={1} />
        {averagePct !== null ? (
          <ReferenceLine y={averagePct} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="4 3" />
        ) : null}
        <Bar dataKey="ratePct" isAnimationActive={false} radius={[3, 3, 0, 0]}>
          {data.map((d) => {
            const isLeanest = d.key === leanestKey
            // Two mutually-exclusive emphasis modes (RateByMonthChart's
            // consumer never sets both): best/leanest tagging a multi-month
            // window, or a single selected month among de-emphasised
            // neighbours (the single-month "in context" view).
            const fillOpacity = selectedKey
              ? d.key === selectedKey
                ? 1
                : 0.16
              : d.key === bestKey
                ? 1
                : 0.32
            return (
              <Cell
                key={d.key}
                fill={d.hasRate && d.ratePct >= 0 ? 'var(--positive)' : mutedFill}
                fillOpacity={fillOpacity}
                stroke={isLeanest ? 'var(--positive)' : undefined}
                strokeWidth={isLeanest ? 1 : 0}
              />
            )
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

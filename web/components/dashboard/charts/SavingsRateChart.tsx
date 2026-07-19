'use client'

import { BarChart, Bar, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'

/**
 * The recharts time-series for `SavingsRateView` (spec 027). A calm per-month bar of
 * the savings rate (percent), no gridlines/axes/tooltip chart-junk. Split into its
 * own leaf so recharts is reached ONLY via `next/dynamic` and leaves the Dashboard
 * initial-load bundle (spec 022 pattern; guarded by test/bundle/no-eager-recharts).
 *
 * Bars use the sage `--positive` accent; a shortfall (negative rate) is drawn in the
 * muted `--text` tint (never red — loss is never red), with a hairline zero baseline.
 */
export function SavingsRateChart({ data }: { data: Array<{ label: string; rate: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={140} minWidth={0}>
      <BarChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
        <ReferenceLine y={0} stroke="var(--hairline)" strokeWidth={1} />
        <Bar dataKey="rate" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.rate >= 0 ? 'var(--positive)' : 'color-mix(in srgb, var(--text) 30%, transparent)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

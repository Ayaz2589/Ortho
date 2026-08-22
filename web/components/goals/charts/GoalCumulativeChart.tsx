'use client'

import { Area, AreaChart, Line, ResponsiveContainer } from 'recharts'
import type { CumulativePoint } from '@/lib/finance/goalSeries'

/**
 * How a goal's saved total accumulated, against the steady pace its target date
 * implies (spec 045). A recharts leaf reached ONLY via `next/dynamic`, so recharts
 * stays out of every initial-load bundle — the spec-022 rule, enforced by
 * `test/bundle/no-eager-recharts.test.ts`.
 *
 * Calm per `SavingsRateChart`: no gridlines, no axes, no tooltip chrome, no
 * animation. The saved area is the sage `--positive`; the pace line is a muted
 * hairline tint that reads in both themes — being under it is never drawn as
 * failure, and never red.
 *
 * Purely presentational: it receives cents and plots them. Every number here was
 * computed by the pure `cumulativeSeries`, whose last point is property-pinned to
 * equal the saved total printed above this chart.
 */
export function GoalCumulativeChart({ data }: { data: CumulativePoint[] }) {
  const hasPace = data.some((p) => p.paceCents !== null)
  return (
    <ResponsiveContainer width="100%" height={160} minWidth={0}>
      <AreaChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id="goal-saved-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--positive)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {hasPace && (
          <Line
            type="linear"
            dataKey="paceCents"
            stroke="var(--text-3)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="cumulativeCents"
          stroke="var(--positive)"
          strokeWidth={1.6}
          fill="url(#goal-saved-fill)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

'use client'

import { Bar, BarChart, ResponsiveContainer } from 'recharts'
import type { MonthPoint } from '@/lib/finance/goalSeries'

/**
 * How much went into a goal each month (spec 045). A recharts leaf reached ONLY via
 * `next/dynamic` — the spec-022 rule, enforced by
 * `test/bundle/no-eager-recharts.test.ts`.
 *
 * Calm per `SavingsRateChart`: bars in the sage `--positive`, no gridlines, axes,
 * tooltip, or animation. A month with nothing contributed is a real zero-height bar
 * rather than a missing column, so a quiet stretch reads as a gap — `monthlySeries`
 * fills those months deliberately.
 */
export function GoalMonthlyChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={110} minWidth={0}>
      <BarChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
        <Bar
          dataKey="cents"
          fill="var(--positive)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

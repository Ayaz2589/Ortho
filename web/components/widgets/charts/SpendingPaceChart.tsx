'use client'

import { AreaChart, Area, ResponsiveContainer } from 'recharts'

/**
 * The daily-expense area for the spending-pace widget (spec 037 — Section 2).
 * Recreated from the deleted `DailyTrendChart` leaf. recharts is heavy, so it is
 * statically imported ONLY here inside `components/**​/charts/` and reached from
 * the body via `next/dynamic({ ssr: false })`, keeping it out of the dashboard's
 * initial-load bundle (spec 022 discipline; guarded by
 * `test/bundle/no-eager-recharts.test.ts`).
 *
 * Calm and axis-free: a single sage `--positive` area, no gridlines/axes/tooltip
 * chart-junk. Spend is never rendered red.
 */
export function SpendingPaceChart({ data }: { data: Array<{ i: number; v: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={48}>
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--positive)"
          strokeWidth={1.6}
          fill="var(--positive)"
          fillOpacity={0.18}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

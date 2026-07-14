'use client'

import { AreaChart, Area, ResponsiveContainer } from 'recharts'

/**
 * The recharts sparkline for `DailySpendTrendCard`. Split into its own leaf (spec 022,
 * US1) so recharts loads on demand via `next/dynamic` and leaves the Dashboard
 * initial-load bundle. Markup is verbatim from the card — behavior/visual identical.
 */
export function DailyTrendChart({ data }: { data: Array<{ i: number; v: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={80} minWidth={0}>
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

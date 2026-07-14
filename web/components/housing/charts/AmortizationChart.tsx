'use client'

import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts'

/**
 * The recharts grouped bar chart for the `Amortization` card. Split into its own leaf
 * (spec 022, US1) so recharts loads on demand via `next/dynamic` and leaves the Housing
 * initial-load bundle. Markup is verbatim from the card — behavior/visual identical.
 */
export function AmortizationChart({
  data,
}: {
  data: Array<{ label: string; principal: number; interest: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={140} minWidth={0}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          interval={0}
        />
        {/* Grouped (side-by-side) bars per month — matches iOS's
            `.position(by:)` chart semantics, not a stack. */}
        <Bar dataKey="principal" fill="var(--positive)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="interest" fill="rgba(26,24,21,0.18)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

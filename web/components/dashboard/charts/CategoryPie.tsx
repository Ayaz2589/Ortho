'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

/**
 * The recharts donut for `SpendByCategoryCard`. Split into its own leaf (spec 022,
 * US1) so recharts is reached ONLY through `next/dynamic` and leaves the Dashboard
 * initial-load bundle. Markup is verbatim from the card — behavior/visual identical.
 */
export function CategoryPie({
  data,
}: {
  data: Array<{ cents: number; label: string; color: string }>
}) {
  return (
    <ResponsiveContainer width="100%" height={160} minWidth={0}>
      <PieChart>
        <Pie
          data={data}
          dataKey="cents"
          nameKey="label"
          innerRadius="62%"
          outerRadius="100%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((e, i) => (
            <Cell key={i} fill={e.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

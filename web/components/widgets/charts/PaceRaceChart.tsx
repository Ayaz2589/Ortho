'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

export interface PaceRacePoint {
  i: number
  current?: number
  reference?: number
}

/**
 * The spending-pace panel's "pace race" chart (spec 057 US4 redesign): two
 * cumulative-spend lines over the period — this period solid sage, the reference
 * (last period, or a straight ramp to budget) faint and dashed. Axis-free, no
 * gridlines/tooltip, matching `SpendingPaceChart`'s restraint — this panel is
 * deliberately not interactive (no scrubbing, no tooltips; that restraint is the
 * design, per the redesign brief).
 */
export function PaceRaceChart({ data }: { data: PaceRacePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={100}>
      <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 4 }}>
        <Line
          type="monotone"
          dataKey="reference"
          stroke="rgba(242,239,232,.22)"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="current"
          stroke="var(--positive)"
          strokeWidth={2}
          strokeLinecap="round"
          dot={(dotProps: { cx?: number; cy?: number; index?: number; payload?: PaceRacePoint }) => {
            const isLast = dotProps.payload?.current != null && data[(dotProps.index ?? -1) + 1]?.current == null
            if (!isLast) return <g key={`dot-${dotProps.index}`} />
            return <circle key={`dot-${dotProps.index}`} cx={dotProps.cx} cy={dotProps.cy} r={3.5} fill="var(--positive)" />
          }}
          activeDot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

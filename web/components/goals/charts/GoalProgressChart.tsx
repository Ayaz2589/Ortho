'use client'

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'

export interface ProgressPoint {
  /** Days since the item started — a numeric x so the actual line occupies only
   *  its true share of the width, rather than being stretched to fill it. */
  x: number
  /** Cumulative contributed, in cents. Absent after today. */
  actual?: number
  /** The dashed run from today to the target. Absent before today. */
  projected?: number
}

/**
 * How the balance is tracking toward the target (spec 059 US4). A recharts leaf
 * reached ONLY via `next/dynamic`, so recharts stays out of every initial-load
 * bundle (spec 022, enforced by `test/bundle/no-eager-recharts.test.ts`).
 *
 * This replaces a chart that was flat because it had nowhere to go: a cumulative
 * line with no target and no axis. The two additions that make it mean something
 * are a target line at the top and a dashed projection from today's dot to the
 * point where the target is met — so the line has both a destination and a
 * distance still to travel.
 *
 * The x-domain runs from the item's start to its PROJECTED FINISH, not to today.
 * That is deliberate: it is what makes "24% paid" legible as a share of the
 * whole journey rather than a line that fills the frame.
 *
 * Calm per the sibling charts: no gridlines, no axes, no tooltip, no animation.
 */
export function GoalProgressChart({
  data,
  targetCents,
  domainEnd,
}: {
  data: ProgressPoint[]
  targetCents: number
  /** x of the projected finish — the right edge of the journey. */
  domainEnd: number
}) {
  return (
    <ResponsiveContainer width="100%" height={152} minWidth={0}>
      <ComposedChart data={data} margin={{ top: 6, bottom: 2, left: 0, right: 6 }}>
        <defs>
          <linearGradient id="goal-progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--positive)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <XAxis type="number" dataKey="x" domain={[0, domainEnd]} hide />
        <YAxis type="number" domain={[0, targetCents]} hide />

        {/* The target: where this is going. */}
        <ReferenceLine
          y={targetCents}
          stroke="color-mix(in srgb, var(--text) 18%, transparent)"
          strokeDasharray="3 4"
          strokeWidth={0.5}
        />
        {/* The floor, so the fill has a visible base. */}
        <ReferenceLine y={0} stroke="color-mix(in srgb, var(--text) 12%, transparent)" strokeWidth={0.5} />

        {/* Where it will get there, at the current pace. */}
        <Line
          type="linear"
          dataKey="projected"
          stroke="color-mix(in srgb, var(--positive) 45%, transparent)"
          strokeWidth={1.5}
          strokeDasharray="4 5"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          connectNulls
        />

        {/* What has actually been contributed, ending in a dot at today. */}
        <Area
          type="linear"
          dataKey="actual"
          stroke="var(--positive)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="url(#goal-progress-fill)"
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number; payload?: ProgressPoint }) => {
            const i = props.index ?? -1
            const isLast = props.payload?.actual != null && data[i + 1]?.actual == null
            if (!isLast) return <g key={`dot-${i}`} />
            return <circle key={`dot-${i}`} cx={props.cx} cy={props.cy} r={3.5} fill="var(--positive)" />
          }}
          activeDot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

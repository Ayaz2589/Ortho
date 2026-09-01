'use client'

import { isBigDot, type CycleDot } from '@/lib/finance/topMerchants'
import { edgeAnchoredTransform } from '@/lib/ui/edgeAnchor'

const DOT_BASE_PX = 9
const DOT_BIG_PX = 12
const STACK_STEP_PX = 14
const STACK_BASE_PX = 12

function dayLeftPct(day: number): number {
  return ((day - 1) / 30) * 100
}

/**
 * The recurring-charges "by day of month" strip (spec 057 US6 redesign,
 * zone 2). Detection is monthly by construction (routines.ts), so day-of-
 * month is the only period-independent axis — it holds one dot and twenty
 * at the same fixed height, and a multi-month window folds onto it instead
 * of densifying. Filled = landed; a hollow ring = still ahead of today,
 * same hue, never a second colour. Pure/presentational — `computeTopMerchants`
 * already resolved which dots exist, their stacking, and whether "today"
 * applies.
 *
 * Spec 058: everything on the track is edge-anchored rather than centred with a
 * blanket `translateX(-50%)`. Centring hung the day-1 dot half off the left edge
 * and the day-31 dot half off the right, widening the strip past its panel and
 * making the whole panel pan sideways on a phone.
 */
export function CycleStrip({ dots, todayDay }: { dots: CycleDot[]; todayDay: number | null }) {
  return (
    <div>
      <div className="relative mt-3.5" style={{ height: 56 }}>
        <div className="absolute left-0 right-0" style={{ bottom: 16, height: 0.5, background: 'var(--hairline)' }} />
        {todayDay !== null ? (
          <>
            <div
              data-testid="cycle-today-line"
              className="absolute w-px"
              style={{
                left: `${dayLeftPct(todayDay)}%`,
                top: 2,
                bottom: 10,
                background: 'rgba(242,239,232,.42)',
                transform: edgeAnchoredTransform(dayLeftPct(todayDay)),
              }}
            />
            <span
              data-testid="cycle-today-label"
              className="absolute whitespace-nowrap text-[10.5px] text-text-3"
              style={{
                left: `${dayLeftPct(todayDay)}%`,
                bottom: -4,
                transform: edgeAnchoredTransform(dayLeftPct(todayDay)),
              }}
            >
              today
            </span>
          </>
        ) : null}
        {dots.map((d) => {
          const big = isBigDot(d.amountCents)
          const size = big ? DOT_BIG_PX : DOT_BASE_PX
          const bottom = STACK_BASE_PX + d.stackIndex * STACK_STEP_PX
          return (
            <div
              key={d.key}
              data-testid="cycle-dot"
              className="absolute rounded-full"
              style={{
                left: `${dayLeftPct(d.day)}%`,
                bottom,
                width: size,
                height: size,
                transform: edgeAnchoredTransform(dayLeftPct(d.day)),
                background: d.landed ? 'var(--positive)' : 'transparent',
                border: d.landed ? undefined : '1.5px solid rgba(166,196,164,.75)',
              }}
            />
          )
        })}
      </div>
      <div className="relative mt-1" style={{ height: 14 }}>
        {[1, 15, 31].map((day) => (
          <span
            key={day}
            data-testid="cycle-tick"
            className="absolute tabular-nums text-[10.5px] text-text-3"
            style={{ left: `${dayLeftPct(day)}%`, transform: edgeAnchoredTransform(dayLeftPct(day)) }}
          >
            {day}
          </span>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useApp } from '@/lib/store'
import { isBigDot, type CycleDot } from '@/lib/finance/topMerchants'

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
 */
export function CycleStrip({ dots, todayDay }: { dots: CycleDot[]; todayDay: number | null }) {
  const { t } = useApp()
  return (
    <div>
      <div className="relative mt-3.5" style={{ height: 56 }}>
        <div className="absolute left-0 right-0" style={{ bottom: 16, height: 0.5, background: 'var(--hairline)' }} />
        {todayDay !== null ? (
          <>
            <div
              className="absolute w-px"
              style={{
                left: `${dayLeftPct(todayDay)}%`,
                top: 2,
                bottom: 10,
                background: 'rgba(242,239,232,.42)',
                transform: 'translateX(-50%)',
              }}
            />
            <span
              className="absolute whitespace-nowrap text-[10.5px] text-text-3"
              style={{ left: `${dayLeftPct(todayDay)}%`, bottom: -4, transform: 'translateX(-50%)' }}
            >
              {t('today')}
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
              className="absolute rounded-full"
              style={{
                left: `${dayLeftPct(d.day)}%`,
                bottom,
                width: size,
                height: size,
                transform: 'translateX(-50%)',
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
            className="absolute tabular-nums text-[10.5px] text-text-3"
            style={{ left: `${dayLeftPct(day)}%`, transform: 'translateX(-50%)' }}
          >
            {day}
          </span>
        ))}
      </div>
    </div>
  )
}

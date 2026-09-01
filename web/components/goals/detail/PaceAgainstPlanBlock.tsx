'use client'

import { useApp } from '@/lib/store'
import { monthYear } from '@/lib/format'
import type { GoalProjection } from '@/lib/finance/goalProjection'
import { DetailBlock, BlockValueStrong, MonthStrip, BlockReading, STRIP_MAX_MONTHS } from './DetailBlock'

/** Plot height, and where a bar exactly at the plan sits within it. */
const PLOT_PX = 104
const PLAN_PX = 76

/**
 * Block 3 — pace against plan (spec 059 US4).
 *
 * This replaces the old "by month" chart, which was a picket fence of seven
 * equal bars carrying no information. The bars are the same height; what was
 * missing was something to be level WITH. Adding the plan line turns identical
 * bars into the reading "7 of 7 on plan" — the repetition becomes good news, and
 * the sentence below says so.
 *
 * A bar may exceed the plan line and is drawn at its true height, never clamped.
 * A missed month is drawn at zero with no stub — absence, not a warning.
 */
export function PaceAgainstPlanBlock({ projection }: { projection: GoalProjection }) {
  const { formatMoney, t, locale } = useApp()

  const cadence = projection.cadence
  if (!cadence || projection.months.length === 0) return null

  const planCents = cadence.amountCents
  const months = projection.months.slice(-STRIP_MAX_MONTHS)
  const truncated = projection.months.length > months.length

  // Scale so a bar at the plan is PLAN_PX tall, compressing only if the tallest
  // month would otherwise overflow the plot. The plan LINE is drawn at the same
  // scale — pinning it to a fixed height while rescaling the bars is what made a
  // perfect month appear to fall short of a plan it exactly met.
  const tallest = Math.max(planCents, ...months.map((m) => m.cents))
  const scale = tallest > 0 ? Math.min(PLAN_PX / planCents, PLOT_PX / tallest) : 0
  const planPx = Math.round(planCents * scale)

  const exactlyOnPlan = months.every((m) => m.status === 'on_plan')
  const noShortfall = months.every((m) => m.status === 'on_plan' || m.status === 'over')
  const shortMonths = months.filter((m) => m.status === 'under').length
  const missed = months.filter((m) => m.status === 'missed').length

  return (
    <DetailBlock
      label={t('Pace against plan')}
      testId="pace"
      value={
        <>
          <BlockValueStrong>
            {t('{0} of {1}', projection.onPlanCount, projection.monthCount)}
          </BlockValueStrong>{' '}
          {t('on plan')}
        </>
      }
    >
      <div className="relative flex items-end gap-3.5" style={{ height: PLOT_PX }}>
        <div
          data-testid="pace-plan-line"
          className="pointer-events-none absolute left-0 right-0"
          style={{
            bottom: planPx,
            borderTop: '1px dashed color-mix(in srgb, var(--text) 30%, transparent)',
          }}
        />
        {/* A panel-coloured chip so the dashes don't run through the caption. */}
        <span
          className="pointer-events-none absolute right-0 px-1 text-[11px] tabular-nums text-text-3"
          style={{ bottom: planPx - 8, background: 'var(--surface)' }}
        >
          {t('plan {0}', formatMoney(planCents))}
        </span>

        {months.map((m) => (
          <div key={m.monthKey} className="flex h-full flex-1 flex-col justify-end">
            <div
              data-testid="pace-bar"
              className="w-full"
              style={{
                height: `${Math.round(m.cents * scale)}px`,
                borderRadius: '3px 3px 0 0',
                background: 'var(--positive)',
                // On plan reads slightly stronger than off — one hue, two
                // opacities, no second colour and nothing red.
                opacity: m.status === 'missed' ? 0 : m.status === 'under' ? 0.6 : 0.85,
              }}
            />
          </div>
        ))}
      </div>

      <MonthStrip labels={months.map((m) => shortMonth(m.monthKey, locale))} gapClassName="gap-3.5" />

      <BlockReading testId="pace-reading">
        {exactlyOnPlan
          ? truncated
            ? t('Every payment in the last {0} months has matched the plan exactly.', months.length)
            : t('Every payment has matched the plan exactly — the projection above is as reliable as it gets.')
          : noShortfall
            ? t('Every month has met the plan, and some went beyond it.')
            : paceSentence({ shortMonths, missed, t })}
      </BlockReading>
    </DetailBlock>
  )
}

/** One sentence naming what happened, without judging it. */
function paceSentence({
  shortMonths,
  missed,
  t,
}: {
  shortMonths: number
  missed: number
  t: (k: string, ...a: Array<string | number>) => string
}): string {
  if (shortMonths > 0 && missed > 0) {
    return t(
      '{0} came in short and {1} was skipped — that’s why the projection uses your recent average.',
      shortMonths === 1 ? t('One month') : t('{0} months', shortMonths),
      missed === 1 ? t('one month') : t('{0} months', missed)
    )
  }
  if (missed > 0) {
    return t(
      '{0} with no contribution — that’s why the projection uses your recent average.',
      missed === 1 ? t('One month') : t('{0} months', missed)
    )
  }
  return t(
    '{0} came in short — that’s why the projection uses your recent average.',
    shortMonths === 1 ? t('One month') : t('{0} months', shortMonths)
  )
}

/** "Feb" for a `YYYY-MM` key. */
export function shortMonth(monthKey: string, locale: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1))
}

/** "Feb 2026" for a `YYYY-MM` key — used by the axis strips. */
export function monthYearOfKey(monthKey: string, locale: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return monthYear(new Date(y, m - 1, 1), locale)
}

'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { goalProgress } from '@/lib/finance/goals'
import { monthYear, parseLocalDate } from '@/lib/format'
import type { GoalProjection } from '@/lib/finance/goalProjection'
import type { ProgressPoint } from '@/components/goals/charts/GoalProgressChart'
import type { Goal, GoalContribution } from '@/lib/types'
import { DetailBlock, BlockValueStrong } from './DetailBlock'

// recharts is the heaviest dependency in the app and may only be reached through
// next/dynamic (spec 022, guarded by test/bundle/no-eager-recharts.test.ts).
const GoalProgressChart = dynamic(
  () => import('@/components/goals/charts/GoalProgressChart').then((m) => m.GoalProgressChart),
  { ssr: false }
)

const DAY_MS = 86_400_000

/**
 * Block 2 — progress toward the target (spec 059 US4).
 *
 * The chart this replaces was a near-straight line with no target and no axis.
 * It was flat because it had nowhere to go. Here it gets both: a target line
 * above it and a dashed projection running to the month the target is met.
 */
export function ProgressTowardTargetBlock({
  goal,
  contributions,
  projection,
  now,
}: {
  goal: Goal
  contributions: GoalContribution[]
  projection: GoalProjection
  now: Date
}) {
  const { formatMoney, t, locale } = useApp()

  const progress = goalProgress(goal.target_cents, contributions)
  const pct = Math.round(progress.fraction * 100)

  const series = useMemo(
    () => progressChartSeries(goal, contributions, projection, now),
    [goal, contributions, projection, now]
  )

  if (!series) return null

  const isDebt = goal.kind === 'debt_payoff'

  return (
    <DetailBlock
      label={t('Progress toward {0}', formatMoney(goal.target_cents))}
      testId="progress"
      value={
        <>
          <BlockValueStrong>{formatMoney(progress.saved_cents)}</BlockValueStrong>{' '}
          {isDebt ? t('paid') : t('saved')} · {t('{0}%', pct)}
        </>
      }
    >
      <GoalProgressChart data={series.points} targetCents={goal.target_cents} domainEnd={series.domainEnd} />

      <div
        data-testid="progress-axis"
        className="mt-2 flex justify-between text-[11px] tabular-nums text-text-3"
      >
        <span>{monthYear(series.startDate, locale)}</span>
        <span>{t('today')}</span>
        <span>{t('{0} · target', monthYear(series.finishDate, locale))}</span>
      </div>

      <div className="mt-2.5 flex gap-4 text-[11.5px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-3.5"
            style={{ borderTop: '1.5px solid var(--positive)' }}
          />
          {isDebt ? t('Paid to date') : t('Saved to date')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-3.5"
            style={{ borderTop: '1.5px dashed color-mix(in srgb, var(--positive) 45%, transparent)' }}
          />
          {t('Projected at {0}/mo', formatMoney(projection.pacePerMonthCents ?? 0))}
        </span>
      </div>
    </DetailBlock>
  )
}

export interface ProgressSeries {
  points: ProgressPoint[]
  /** x of the projected finish — the right edge of the journey. */
  domainEnd: number
  startDate: Date
  finishDate: Date
}

/**
 * The chart's geometry, built from the data — never transcribed from the design
 * prototype's static SVG path.
 *
 * x is *days since the item started*, and the domain runs to the projected
 * finish, so the actual line occupies only its true share of the width. The
 * cumulative run ends at today; the projection picks up from exactly that point
 * (they share a point, so the dashed segment starts on the dot rather than
 * floating beside it) and reaches the target at the finish date.
 *
 * Returns null when there is nothing honest to plot — no contributions, or a
 * projection the engine refused.
 */
export function progressChartSeries(
  goal: Pick<Goal, 'target_cents' | 'created_at'>,
  contributions: GoalContribution[],
  projection: GoalProjection,
  now: Date
): ProgressSeries | null {
  if (contributions.length === 0) return null
  if (!projection.available || !projection.finishDate) return null

  const sorted = [...contributions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  // Start at the item's creation, or its earliest contribution if that came
  // first — a contribution dated before the item existed is still real money and
  // must not fall off the left edge.
  const created = startOfLocalDay(new Date(goal.created_at))
  const earliest = startOfLocalDay(parseLocalDate(sorted[0].date))
  const startDate = earliest < created ? earliest : created

  const finishDate = projection.finishDate
  const domainEnd = Math.max(1, daysBetween(startDate, finishDate))

  // One point per distinct contribution day, carrying the running total. Two on
  // the same day collapse into one — this is a running total, not a ledger.
  const points: ProgressPoint[] = [{ x: 0, actual: 0 }]
  let running = 0
  let lastX = 0
  for (const c of sorted) {
    running += c.amount_cents
    const x = daysBetween(startDate, parseLocalDate(c.date))
    if (x === lastX && points.length > 1) {
      points[points.length - 1].actual = running
    } else {
      points.push({ x, actual: running })
      lastX = x
    }
  }

  // The projection starts on the last actual point, so the dashed line begins at
  // the dot rather than beside it.
  points[points.length - 1].projected = running
  points.push({ x: domainEnd, projected: goal.target_cents })

  return { points, domainEnd, startDate, finishDate }
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / DAY_MS)
}

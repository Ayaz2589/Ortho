'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { goalProgress, goalPacing, contributionsByGoal, type GoalProgress, type GoalPacing } from '@/lib/finance/goals'
import { monthlySeries, type MonthPoint } from '@/lib/finance/goalSeries'
import { parseLocalDate, monthYear, monthYearLong } from '@/lib/format'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import type { Goal, GoalContribution } from '@/lib/types'

/**
 * Goals detail panel (spec 057, US9). Answers what the card cannot: how the
 * balance got there (a monthly trajectory, not only the current total) and
 * when it is projected to arrive at the current contribution rate — always
 * phrased as a projection (X-8), never a stated fact. Being behind is a calm
 * accent, never red (X-7), reusing the exact pace vocabulary `GoalsBody`
 * already established.
 *
 * Honours time only (`now`, for pacing) — a goal spans its whole lifetime,
 * not the dashboard's scope window — so, like home equity (D5), no caption
 * is declared. Reads the full household goal list; whether goals should be
 * person-scoped is a separate open question this panel does not settle
 * (contracts/follow-up-brief.md).
 */

interface GoalRowData {
  goal: Goal
  contributions: GoalContribution[]
  progress: GoalProgress
  pacing: GoalPacing
  series: MonthPoint[]
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function monthFromKey(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export function GoalsPanel() {
  const { goals, goalContributions, formatMoney, t } = useApp()
  const { now } = useDashboardScopeContext()

  const rows = useMemo<GoalRowData[]>(() => {
    const byGoal = contributionsByGoal(goalContributions)
    return goals.map((goal) => {
      const contributions = byGoal[goal.id] ?? []
      const progress = goalProgress(goal.target_cents, contributions)
      const pacing = goalPacing(goal.target_cents, goal.target_date, goal.created_at, progress.saved_cents, now)
      const series = monthlySeries(contributions)
      return { goal, contributions, progress, pacing, series }
    })
  }, [goals, goalContributions, now])

  const totalMonthlyCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.pacing.suggested_monthly_cents, 0),
    [rows]
  )

  if (goals.length === 0) {
    return <PanelEmpty>{t('No goals yet.')}</PanelEmpty>
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {totalMonthlyCents > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[24px] font-light leading-none tabular-nums text-text">
            {formatMoney(totalMonthlyCents)}
          </span>
          <span className="text-xs text-text-2">{t('a month, in total, to keep every goal on time')}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <GoalPanelRow key={row.goal.id} {...row} now={now} />
        ))}
      </div>
    </div>
  )
}

function GoalPanelRow({ goal, progress, pacing, series, now }: GoalRowData & { now: Date }) {
  const { formatMoney, t, locale } = useApp()

  const dueLabel = goal.target_date ? monthYearLong(parseLocalDate(goal.target_date), locale) : null

  let paceText: string | null = null
  let paceColor = 'var(--text-2)'
  if (goal.target_date && !progress.reached) {
    if (pacing.off_track) {
      paceText = t(
        'Behind pace — set aside {0}/mo to reach it by {1}.',
        formatMoney(pacing.suggested_monthly_cents),
        dueLabel ?? ''
      )
      paceColor = 'var(--accent)'
    } else {
      paceText = t('On pace · due {0}', dueLabel ?? '')
    }
  } else if (goal.target_date && progress.reached) {
    paceText = t('Reached · by {0}', dueLabel ?? '')
    paceColor = 'var(--positive)'
  }

  const monthlyRateCents =
    series.length > 0 ? Math.round(series.reduce((sum, point) => sum + point.cents, 0) / series.length) : 0
  const monthsRemaining =
    !progress.reached && monthlyRateCents > 0 ? Math.ceil(progress.remaining_cents / monthlyRateCents) : null
  const projectedLabel = monthsRemaining !== null ? monthYearLong(addMonths(now, monthsRemaining), locale) : null

  return (
    <Link
      href={`/planning/goals?id=${goal.id}`}
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PanelRow
            label={goal.name}
            value={`${formatMoney(progress.saved_cents)} ${t('of')} ${formatMoney(goal.target_cents)}`}
            labelClassName="text-text"
            valueClassName="tabular-nums text-text-2"
          />
        </div>
        <ChevronRight size={16} className="shrink-0 text-text-3" aria-hidden />
      </div>
      <span className="text-xs text-text-3">
        {progress.reached ? t('Reached') : t('{0} to go', formatMoney(progress.remaining_cents))}
      </span>
      {paceText ? (
        <span className="text-xs" style={{ color: paceColor }}>
          {paceText}
        </span>
      ) : null}
      {projectedLabel ? (
        <span className="text-xs text-text-2">
          {t('Projected to reach {0} around {1} at the current pace.', formatMoney(goal.target_cents), projectedLabel)}
        </span>
      ) : null}
      {series.length > 0 ? (
        <div className="flex flex-col gap-1 pt-1">
          <PanelSectionLabel>{t('Recent months')}</PanelSectionLabel>
          {series.slice(-6).map((point) => (
            <PanelRow key={point.monthKey} label={monthYear(monthFromKey(point.monthKey), locale)} value={formatMoney(point.cents)} />
          ))}
        </div>
      ) : null}
    </Link>
  )
}

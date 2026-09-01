'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { goalProgress, contributionsByGoal, type GoalProgress } from '@/lib/finance/goals'
import { goalProjection, savingsDebtsSummary, type GoalProjection } from '@/lib/finance/goalProjection'
import { monthYearLong } from '@/lib/format'
import { PanelEmpty, PanelSectionLabel } from '@/components/widgets/panels/kit'
import type { Goal } from '@/lib/types'

/**
 * Savings & Debts detail panel (spec 057 US9 → reworked by spec 059 US5).
 *
 * Answers what the cell cannot: what the whole set costs each month, and when
 * each item is projected to finish.
 *
 * The projections come from the SHARED engine rather than being derived here.
 * That is the point of this rework: the panel used to compute its own
 * months-remaining figure from an average of monthly totals, which could — and
 * did — disagree with the Planning card it links to. Four surfaces, one
 * function, one answer (spec 059 contract C7).
 *
 * Honours time only (`now`, for the projection) — an item spans its whole
 * lifetime, not the dashboard's scope window — so, like home equity (D5), no
 * caption is declared.
 */
export function GoalsPanel() {
  const { goals, goalContributions, formatMoney, t } = useApp()
  const { now } = useDashboardScopeContext()

  const byGoal = useMemo(() => contributionsByGoal(goalContributions), [goalContributions])
  const summary = useMemo(() => savingsDebtsSummary(goals, byGoal, now), [goals, byGoal, now])

  const rows = useMemo(
    () =>
      goals.map((goal) => {
        const contributions = byGoal[goal.id] ?? []
        return {
          goal,
          progress: goalProgress(goal.target_cents, contributions),
          projection: goalProjection(goal, contributions, now),
        }
      }),
    [goals, byGoal, now]
  )

  if (goals.length === 0) {
    return <PanelEmpty>{t('Nothing here yet.')}</PanelEmpty>
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {summary.monthlyCommitmentCents > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[24px] font-light leading-none tabular-nums text-text">
            {formatMoney(summary.monthlyCommitmentCents)}
          </span>
          <span className="text-xs text-text-2">{t('a month, across everything you’re paying into')}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <GoalPanelRow key={row.goal.id} {...row} />
        ))}
      </div>
    </div>
  )
}

function GoalPanelRow({
  goal,
  progress,
  projection,
}: {
  goal: Goal
  progress: GoalProgress
  projection: GoalProjection
}) {
  const { formatMoney, t, locale } = useApp()
  const isDebt = goal.kind === 'debt_payoff'
  const pct = Math.round(progress.fraction * 100)
  const remainingPct = Math.max(0, 100 - pct)
  const cadence = projection.cadence

  return (
    <Link
      href={`/planning/goals?id=${goal.id}`}
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-text">{goal.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-2">
          {isDebt
            ? t('{0} left', formatMoney(progress.remaining_cents))
            : t('{0} saved', formatMoney(progress.saved_cents))}
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-3" aria-hidden />
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('{0}% complete', pct)}
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--hairline)' }}
      >
        {isDebt ? (
          <>
            <span
              className="absolute bottom-0 top-0 rounded-full"
              style={{ left: 0, width: `${pct}%`, background: 'color-mix(in srgb, var(--positive) 22%, transparent)' }}
            />
            <span
              className="absolute bottom-0 top-0 rounded-full"
              style={{ right: 0, width: `${remainingPct}%`, background: 'var(--positive)' }}
            />
          </>
        ) : (
          <span
            className="absolute bottom-0 top-0 rounded-full"
            style={{ left: 0, width: `${pct}%`, background: 'var(--positive)' }}
          />
        )}
      </div>

      <div className="flex justify-between gap-2 text-xs tabular-nums text-text-3">
        <span className="min-w-0 truncate">
          {cadence
            ? t(
                '{0} · {1}/mo',
                isDebt ? t('Debt') : t('Savings'),
                formatMoney(cadence.amountCents)
              )
            : isDebt
              ? t('Debt')
              : t('Savings')}
        </span>
        <span className="shrink-0">{isDebt ? t('{0}% paid', pct) : t('{0}% funded', pct)}</span>
      </div>

      <span data-testid="panel-eta" className="text-xs tabular-nums text-text-2">
        {projection.available && projection.finishDate && projection.paymentsToGo !== null ? (
          isDebt ? (
            <>
              {t('Clear by')} <span className="text-text">{monthYearLong(projection.finishDate, locale)}</span> —{' '}
              {t('{0} more payments', projection.paymentsToGo)}
            </>
          ) : (
            <>
              {t('Funded by')} <span className="text-text">{monthYearLong(projection.finishDate, locale)}</span> —{' '}
              {t('{0} more deposits', projection.paymentsToGo)}
            </>
          )
        ) : projection.unavailableReason === 'reached' ? (
          t('Reached')
        ) : (
          t('Not enough history to project yet')
        )}
      </span>

      {projection.monthCount > 0 ? (
        <div className="flex flex-col gap-1 pt-1">
          <PanelSectionLabel>{t('Consistency')}</PanelSectionLabel>
          <div className="flex gap-1">
            {projection.months.slice(-12).map((m) => (
              <span
                key={m.monthKey}
                className="h-3 flex-1 rounded-sm"
                style={
                  m.status === 'missed'
                    ? {
                        background: 'transparent',
                        border: '0.5px dashed color-mix(in srgb, var(--text) 22%, transparent)',
                      }
                    : { background: 'var(--positive)', opacity: m.status === 'under' ? 0.4 : 0.75 }
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </Link>
  )
}

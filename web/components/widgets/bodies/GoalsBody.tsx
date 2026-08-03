'use client'

import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { goalProgress, goalPacing, contributionsByGoal } from '@/lib/finance/goals'
import { parseLocalDate } from '@/lib/format'
import type { Goal } from '@/lib/types'

/**
 * Goals widget body (spec 039 — Section 4). Savings/debt-payoff progress per goal,
 * borrowing the GoalCard vocabulary: saved-of-target money headline, a hairline
 * sage `--positive` progress bar, and a calm pace line for dated goals — the sand
 * `--accent` when behind, NEVER red. Reads PROPLESS from `useApp()` +
 * `useDashboardScopeContext()` (only `now`, for pacing — goals span their whole
 * lifetime, not the scope window).
 */
export function GoalsBody() {
  const { goals, goalContributions, t } = useApp()
  const { now } = useDashboardScopeContext()

  if (goals.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('No goals yet.')}</p>
      </div>
    )
  }

  const byGoal = contributionsByGoal(goalContributions)

  return (
    <div className="flex h-full flex-col gap-3">
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} contributions={byGoal[goal.id] ?? []} now={now} />
      ))}
    </div>
  )
}

function GoalRow({
  goal,
  contributions,
  now,
}: {
  goal: Goal
  contributions: { amount_cents: number }[]
  now: Date
}) {
  const { formatMoney, t, locale } = useApp()
  const progress = goalProgress(goal.target_cents, contributions)
  const pct = Math.round(progress.fraction * 100)
  const pacing = goalPacing(goal.target_cents, goal.target_date, goal.created_at, progress.saved_cents, now)

  const dueLabel = goal.target_date
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        parseLocalDate(goal.target_date)
      )
    : null

  // Pace line — behind is calm accent (never red); reached is sage.
  let paceText: string | null = null
  let paceColor = 'var(--text-2)'
  if (goal.target_date && !progress.reached) {
    if (pacing.off_track) {
      paceText = t('Behind pace — set aside {0}/mo to reach it by {1}.', formatMoney(pacing.suggested_monthly_cents), dueLabel ?? '')
      paceColor = 'var(--accent)'
    } else {
      paceText = t('On pace · due {0}', dueLabel ?? '')
    }
  } else if (goal.target_date && progress.reached) {
    paceText = t('Reached · by {0}', dueLabel ?? '')
    paceColor = 'var(--positive)'
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-text">{goal.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-2">
          {formatMoney(progress.saved_cents)} {t('of')} {formatMoney(goal.target_cents)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('{0}% complete', pct)}
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--hairline)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--positive)' }} />
      </div>
      <span className="text-xs text-text-3">
        {progress.reached ? t('Reached') : t('{0} to go', formatMoney(progress.remaining_cents))}
      </span>
      {paceText ? (
        <span className="text-xs" style={{ color: paceColor }}>
          {paceText}
        </span>
      ) : null}
    </div>
  )
}

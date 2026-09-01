'use client'

import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { goalProgress, contributionsByGoal } from '@/lib/finance/goals'
import type { Goal } from '@/lib/types'

/**
 * Savings & Debts widget body (spec 039 → reworked by spec 059 US5).
 *
 * Adopts the Planning section's vocabulary — a headline chosen by kind, and a bar
 * whose DIRECTION carries the type — and deliberately nothing else. This is a
 * fixed, uniform grid cell: the card is a glance, one number per row. No
 * aggregate header, no projected finish, no disclosure, no chart (spec 059
 * research R6); the depth belongs to the panel this cell opens, and putting it
 * here would overflow the cell.
 *
 * Reads PROPLESS from `useApp()` + `useDashboardScopeContext()` (only `now` —
 * an item spans its whole lifetime, not the scope window).
 */
export function GoalsBody() {
  const { goals, goalContributions, t } = useApp()
  const { now } = useDashboardScopeContext()

  if (goals.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('Nothing here yet.')}</p>
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
}: {
  goal: Goal
  contributions: { amount_cents: number }[]
  now: Date
}) {
  const { formatMoney, t } = useApp()
  const isDebt = goal.kind === 'debt_payoff'
  const progress = goalProgress(goal.target_cents, contributions)
  const pct = Math.round(progress.fraction * 100)
  const remainingPct = Math.max(0, 100 - pct)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-text">{goal.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-2">
          {isDebt
            ? t('{0} left', formatMoney(progress.remaining_cents))
            : t('{0} saved', formatMoney(progress.saved_cents))}
        </span>
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
              data-testid="widget-fill-remaining"
              className="absolute bottom-0 top-0 rounded-full"
              style={{ right: 0, width: `${remainingPct}%`, background: 'var(--positive)' }}
            />
          </>
        ) : (
          <span
            data-testid="widget-fill-saved"
            className="absolute bottom-0 top-0 rounded-full"
            style={{ left: 0, width: `${pct}%`, background: 'var(--positive)' }}
          />
        )}
      </div>
      <span className="text-xs tabular-nums text-text-3">
        {progress.reached
          ? t('Reached')
          : isDebt
            ? t('{0}% paid', pct)
            : t('{0}% funded', pct)}
      </span>
    </div>
  )
}

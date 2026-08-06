'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { contributionsByGoal } from '@/lib/finance/goals'
import {
  scoreFinancialHealth,
  deriveProfile,
  weightsToRecord,
} from '@/lib/finance/financialHealth'
import type { HealthBand } from '@/lib/types'

/**
 * Financial Health widget body (spec 041). A calm, NEVER-red baseline health score:
 * band label + 0–100 score in the sand `--accent` ramp (Constitution I — loss/health
 * is never red), a first-vs-latest progress line, and one encouraging next step. When
 * the user has no profile yet it shows a "set up" prompt instead of leaning on a number.
 * Propless: reads household + user-scoped data from `useApp()` and `now` from the scope
 * context; the score is derived live via the pure engine in a `useMemo`.
 */

const BAND_LABEL: Record<HealthBand, string> = {
  strong: 'Strong',
  steady: 'Steady',
  building: 'Building',
  getting_started: 'Getting started',
}

export function FinancialHealthBody() {
  const {
    userFinancialProfile,
    userFixedCosts,
    userDimensionWeights,
    healthSnapshots,
    transactions,
    budgets,
    goals,
    goalContributions,
    t,
    locale,
  } = useApp()
  const { now } = useDashboardScopeContext()

  const result = useMemo(
    () =>
      scoreFinancialHealth({
        profile: deriveProfile(userFinancialProfile, userFixedCosts),
        transactions,
        budgets,
        goals,
        contributionsByGoal: contributionsByGoal(goalContributions),
        weights: weightsToRecord(userDimensionWeights),
        now,
      }),
    [userFinancialProfile, userFixedCosts, userDimensionWeights, transactions, budgets, goals, goalContributions, now]
  )

  if (!result.hasProfile) {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5">
        <p className="text-sm text-text">{t('Set up your financial profile')}</p>
        <p className="text-xs text-text-3">{t('Answer a few questions to see your financial health.')}</p>
      </div>
    )
  }

  // First-vs-now progress: the earliest snapshot is the baseline.
  const baseline = healthSnapshots[0]
  const movedBand = baseline && baseline.band !== result.band
  const sinceLabel = baseline
    ? new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(baseline.created_at))
    : null

  const pct = result.score

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl tabular-nums text-text" style={{ color: 'var(--accent)' }}>
          {result.score}
        </span>
        <span className="text-sm text-text-2">{t(BAND_LABEL[result.band])}</span>
      </div>

      {/* Sand ramp progress bar — never red. */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('{0} out of 100', result.score)}
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--hairline)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>

      {movedBand && sinceLabel ? (
        <p className="text-xs text-text-2">
          {t('{0} → {1} since {2}', t(BAND_LABEL[baseline.band]), t(BAND_LABEL[result.band]), sinceLabel)}
        </p>
      ) : null}

      <p className="mt-auto text-xs text-text-3">{t(result.topAction.key, ...result.topAction.args)}</p>
    </div>
  )
}

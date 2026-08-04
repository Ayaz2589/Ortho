'use client'

import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { buildPlanSummary, currentMonthKey } from '@/lib/planning/planSummary'
import { PlanningMonthBar } from '@/components/planning/PlanningMonthBar'
import { PlanHealthHero } from '@/components/planning/PlanHealthHero'
import { BudgetSummaryCard } from '@/components/planning/BudgetSummaryCard'
import { GoalsSummaryCard } from '@/components/planning/GoalsSummaryCard'
import { SinkingFundsPanel } from '@/components/planning/SinkingFundsPanel'

/**
 * Planning hub (spec 036) — a top-level destination alongside Dashboard,
 * Transactions, Housing, and Settings. A calm, month-scoped composition that
 * summarizes budgets + goals and links out to their detail pages:
 *  - the "Left to plan" health hero (income − budgeted − goal contributions),
 *  - a pace-aware budget summary,
 *  - a goals summary (behind-first, with catch-up amounts),
 *  - a non-monthly sinking-funds panel.
 *
 * The whole summary is computed ONCE per render via the pure
 * `lib/planning/planSummary` engine (injected reference date) and its slices are
 * passed to the presentational cards, so the ledger is scanned once — not once per
 * card. Selecting a month re-scopes everything.
 */
export default function PlanningPage() {
  const { budgets, goals, goalContributions, transactions, t } = useApp()
  const now = useMemo(() => new Date(), [])
  const [monthKey, setMonthKey] = useState(() => currentMonthKey(now))

  const summary = useMemo(
    () => buildPlanSummary({ budgets, goals, goalContributions, transactions, monthKey }, now),
    [budgets, goals, goalContributions, transactions, monthKey, now],
  )

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader title={t('Planning')} />
      <PlanningMonthBar monthKey={monthKey} now={now} onChange={setMonthKey} />
      <PlanHealthHero health={summary.health} />
      <BudgetSummaryCard summary={summary.budgets} />
      <GoalsSummaryCard summary={summary.goals} />
      <SinkingFundsPanel funds={summary.sinkingFunds} />
    </div>
  )
}

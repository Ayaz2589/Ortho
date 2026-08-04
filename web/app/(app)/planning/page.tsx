'use client'

import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { currentMonthKey } from '@/lib/planning/planSummary'
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
 * All figures are month-scoped via the pure `lib/planning/planSummary` engine with
 * an injected reference date, so changing the month recomputes everything.
 */
export default function PlanningPage() {
  const { t } = useApp()
  const now = useMemo(() => new Date(), [])
  const [monthKey, setMonthKey] = useState(() => currentMonthKey(now))

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader title={t('Planning')} />
      <PlanningMonthBar monthKey={monthKey} now={now} onChange={setMonthKey} />
      <PlanHealthHero monthKey={monthKey} now={now} />
      <BudgetSummaryCard monthKey={monthKey} now={now} />
      <GoalsSummaryCard monthKey={monthKey} now={now} />
      <SinkingFundsPanel monthKey={monthKey} now={now} />
    </div>
  )
}

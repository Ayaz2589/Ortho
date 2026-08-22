'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalForm } from '@/components/goals/GoalForm'
import { ContributionForm } from '@/components/goals/ContributionForm'
import { cumulativeSeries, monthlySeries } from '@/lib/finance/goalSeries'
import type { Goal, GoalContribution } from '@/lib/types'

// recharts is the heaviest dependency in the app and may only be reached through
// next/dynamic (spec 022, guarded by test/bundle/no-eager-recharts.test.ts).
const GoalCumulativeChart = dynamic(
  () => import('@/components/goals/charts/GoalCumulativeChart').then((m) => m.GoalCumulativeChart),
  { ssr: false }
)
const GoalMonthlyChart = dynamic(
  () => import('@/components/goals/charts/GoalMonthlyChart').then((m) => m.GoalMonthlyChart),
  { ssr: false }
)

/**
 * One goal, in depth (spec 045 US2). The headline figures reuse `GoalCard` — the
 * same component the Planning hub renders — so the two surfaces can never state
 * different progress or a different pace for the same goal. Here it is given the
 * FULL ledger and the per-contribution edit/delete handlers; the hub's card gets a
 * capped ledger and neither handler.
 *
 * Below it, two charts derived from the pure `goalSeries`: how the total
 * accumulated against the steady pace the target implies, and what went in each
 * month. With no contributions there is nothing honest to plot, so both are
 * replaced by a calm invitation rather than an empty grid.
 */
export function GoalDetail({ goal, contributions }: { goal: Goal; contributions: GoalContribution[] }) {
  const { t, deleteGoal, deleteContribution } = useApp()
  const [editingGoal, setEditingGoal] = useState(false)
  const [addingTo, setAddingTo] = useState<Goal | null>(null)
  const [editingContribution, setEditingContribution] = useState<GoalContribution | null>(null)

  const now = useMemo(() => new Date(), [])
  const cumulative = useMemo(
    () =>
      cumulativeSeries(contributions, {
        targetCents: goal.target_cents,
        targetDate: goal.target_date,
        createdAt: goal.created_at,
        now,
      }),
    [contributions, goal.target_cents, goal.target_date, goal.created_at, now]
  )
  const monthly = useMemo(() => monthlySeries(contributions), [contributions])
  const hasHistory = cumulative.length > 0

  return (
    <>
      <div className="pt-2">
        <Link href="/planning" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Planning')}
        </Link>
      </div>

      <div className="mt-3 flex flex-col gap-5">
        <GoalCard
          goal={goal}
          contributions={contributions}
          now={now}
          onAddContribution={setAddingTo}
          onEdit={() => setEditingGoal(true)}
          onEditContribution={setEditingContribution}
          onDeleteContribution={(c) => deleteContribution(c.id)}
        />

        {hasHistory ? (
          <>
            <section aria-label={t('Saved over time')}>
              <h2 className="mb-2 text-[11px] font-normal uppercase tracking-[0.6px] text-text-3">
                {t('Saved over time')}
              </h2>
              <GoalCumulativeChart data={cumulative} />
              {goal.target_date ? (
                <p className="mt-1 text-[12px] text-text-3">{t('Dashed line: steady pace to your target date.')}</p>
              ) : null}
            </section>

            <section aria-label={t('By month')}>
              <h2 className="mb-2 text-[11px] font-normal uppercase tracking-[0.6px] text-text-3">
                {t('By month')}
              </h2>
              <GoalMonthlyChart data={monthly} />
            </section>
          </>
        ) : (
          <p data-testid="goal-charts-empty" className="text-sm text-text-2">
            {t('Add your first contribution to see how this goal builds up over time.')}
          </p>
        )}
      </div>

      <GoalForm
        open={editingGoal}
        editing={goal}
        onClose={() => setEditingGoal(false)}
        onDelete={(g) => deleteGoal(g.id)}
      />
      <ContributionForm goal={addingTo} onClose={() => setAddingTo(null)} />
      <ContributionForm
        goal={editingContribution ? goal : null}
        editing={editingContribution}
        onClose={() => setEditingContribution(null)}
      />
    </>
  )
}

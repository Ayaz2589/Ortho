'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import { contributionsByGoal } from '@/lib/finance/goals'
import { parseLocalDate } from '@/lib/format'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalForm } from '@/components/goals/GoalForm'
import { ContributionForm } from '@/components/goals/ContributionForm'
import type { GoalsSummary } from '@/lib/planning/planSummary'
import type { Goal } from '@/lib/types'
import { PlanningSection } from './PlanningSection'

/** How many contributions a hub card shows before deferring to the detail page.
 *  Capped so cards stay a comparable, scannable size (spec 045 Assumptions). */
const CARD_CONTRIBUTIONS = 3

/**
 * Goals on the Planning hub (spec 038 US4, reworked by spec 045).
 *
 * Each goal is now its own `GoalCard` — the same component the detail page uses —
 * rather than a thin local `GoalRow`. That was a near-duplicate of the card and had
 * already drifted from it ("On track · due" here vs "On pace · due" there), so
 * collapsing to one component removes a real correctness hazard, not just code.
 *
 * The "View all goals" link is gone with the goals index it pointed at: a goal is
 * reached from its own card now. Goal CREATION moved here with it — this section is
 * the only place goals are made, so the New-goal action lives in its header.
 *
 * Off-track goals are listed first, from the order `summary.rows` already computes.
 * Behind is calm sand `--accent`, reached is sage `--positive`, never red.
 */
export function GoalsSummaryCard({ summary, referenceDate }: { summary: GoalsSummary; referenceDate: Date }) {
  const { goals, goalContributions, deleteGoal, t } = useApp()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributingTo, setContributingTo] = useState<Goal | null>(null)

  // The summary is month-scoped end to end (contribsAsOf) — the cards must
  // reflect the SAME point in time, not today's balance beside a month-scoped
  // hero (review 2026-08-24).
  const asOfContributions = useMemo(
    () => goalContributions.filter((c) => parseLocalDate(c.date).getTime() <= referenceDate.getTime()),
    [goalContributions, referenceDate]
  )
  const byGoal = useMemo(() => contributionsByGoal(asOfContributions), [asOfContributions])
  // `summary.rows` carries the behind-first order; resolve each back to its Goal.
  const ordered = useMemo(
    () =>
      summary.rows
        .map((r) => goals.find((g) => g.id === r.goalId))
        .filter((g): g is Goal => g != null),
    [summary.rows, goals]
  )

  const newGoal = (
    <button
      type="button"
      onClick={() => {
        setEditing(null)
        setFormOpen(true)
      }}
      className="ortho-interactive inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <Plus size={14} />
      {t('New goal')}
    </button>
  )

  return (
    <>
      <PlanningSection title={t('Goals')} action={newGoal}>
        {summary.goalCount === 0 ? (
          <p data-testid="goals-empty" className="py-2 text-sm text-text-2">
            {t('No goals yet — create one to start saving toward it.')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {ordered.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                contributions={byGoal[g.id] ?? []}
                href={`/planning/goals?id=${g.id}`}
                maxContributions={CARD_CONTRIBUTIONS}
                onAddContribution={setContributingTo}
                onEdit={(goal) => {
                  setEditing(goal)
                  setFormOpen(true)
                }}
              />
            ))}
          </div>
        )}
      </PlanningSection>

      <GoalForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDelete={(g) => deleteGoal(g.id)}
      />
      <ContributionForm goal={contributingTo} onClose={() => setContributingTo(null)} />
    </>
  )
}

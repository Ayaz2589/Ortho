'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import { contributionsByGoal } from '@/lib/finance/goals'
import { savingsDebtsSummary } from '@/lib/finance/goalProjection'
import { SavingsDebtCard } from '@/components/goals/SavingsDebtCard'
import { SavingsDebtsHeader } from '@/components/goals/SavingsDebtsHeader'
import { ContributionLedger } from '@/components/goals/ContributionLedger'
import { GoalForm } from '@/components/goals/GoalForm'
import { ContributionForm } from '@/components/goals/ContributionForm'
import type { GoalsSummary } from '@/lib/planning/planSummary'
import type { Goal, GoalContribution } from '@/lib/types'
import { PlanningSection } from './PlanningSection'

/** Rows a card's inline ledger shows before deferring to the detail page. */
const CARD_LEDGER_ROWS = 12

/**
 * Savings & Debts on the Planning hub (spec 038 US4 → spec 045 → reworked by
 * spec 059).
 *
 * The section is now three things the old one wasn't: an aggregate verdict above
 * the cards, projection-first cards that state a finish date, and a contribution
 * list that opens in place instead of sitting permanently on the front of every
 * card.
 *
 * `expandedId` lives HERE rather than inside each card because "at most one open"
 * is a statement about the SET — per-card local state would need cards reaching
 * into each other, with an ordering bug waiting in it (spec 059 research R8).
 */
export function GoalsSummaryCard({ summary, now }: { summary: GoalsSummary; now?: Date }) {
  const { goals, goalContributions, deleteGoal, deleteContribution, formatMoney, t } = useApp()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributingTo, setContributingTo] = useState<Goal | null>(null)
  const [editingContribution, setEditingContribution] = useState<GoalContribution | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reference = useMemo(() => now ?? new Date(), [now])
  const byGoal = useMemo(() => contributionsByGoal(goalContributions), [goalContributions])

  // `summary.rows` carries the behind-first order; resolve each back to its Goal.
  const ordered = useMemo(
    () => summary.rows.map((r) => goals.find((g) => g.id === r.goalId)).filter((g): g is Goal => g != null),
    [summary.rows, goals]
  )

  const aggregate = useMemo(
    () => savingsDebtsSummary(ordered, byGoal, reference),
    [ordered, byGoal, reference]
  )

  const expandedGoal = expandedId ? ordered.find((g) => g.id === expandedId) ?? null : null

  const newItem = (
    <button
      type="button"
      onClick={() => {
        setEditing(null)
        setFormOpen(true)
      }}
      className="ortho-interactive inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <Plus size={14} />
      {t('New item')}
    </button>
  )

  return (
    <>
      <PlanningSection title={t('Savings & Debts')} action={newItem}>
        {summary.goalCount === 0 ? (
          <p data-testid="goals-empty" className="py-2 text-sm text-text-2">
            {t('Nothing here yet — add something you’re saving for, or a debt you’re paying down.')}
          </p>
        ) : (
          <>
            <SavingsDebtsHeader summary={aggregate} />
            <div className="border-t" style={{ borderColor: 'var(--hairline)' }}>
              {ordered.map((g, i) => (
                <div
                  key={g.id}
                  className={i === ordered.length - 1 ? '' : 'border-b'}
                  style={i === ordered.length - 1 ? undefined : { borderColor: 'var(--hairline)' }}
                >
                  <SavingsDebtCard
                    goal={g}
                    contributions={byGoal[g.id] ?? []}
                    now={reference}
                    href={`/planning/goals?id=${g.id}`}
                    onAddContribution={setContributingTo}
                    onEdit={(goal) => {
                      setEditing(goal)
                      setFormOpen(true)
                    }}
                    expanded={expandedId === g.id}
                    onToggleExpanded={(goal) => setExpandedId((cur) => (cur === goal.id ? null : goal.id))}
                    ledger={
                      <ContributionLedger
                        contributions={byGoal[g.id] ?? []}
                        maxRows={CARD_LEDGER_ROWS}
                        seeAllHref={`/planning/goals?id=${g.id}`}
                        onEdit={setEditingContribution}
                        onDelete={(c) => deleteContribution(c.id)}
                      />
                    }
                  />
                </div>
              ))}
            </div>
            <div
              data-testid="sd-section-footer"
              className="mt-4 flex justify-between gap-3 border-t pt-3.5 text-[13px] tabular-nums text-text-3"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <span>
                {aggregate.activeCount === 1 ? t('1 active') : t('{0} active', aggregate.activeCount)}
              </span>
              <span>{t('{0} a month committed', formatMoney(aggregate.monthlyCommitmentCents))}</span>
            </div>
          </>
        )}
      </PlanningSection>

      <GoalForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDelete={(g) => deleteGoal(g.id)}
      />
      <ContributionForm goal={contributingTo} onClose={() => setContributingTo(null)} />
      <ContributionForm
        goal={editingContribution ? expandedGoal : null}
        editing={editingContribution}
        onClose={() => setEditingContribution(null)}
      />
    </>
  )
}


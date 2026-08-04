'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Target } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, EmptyState, IconButton } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalForm } from '@/components/goals/GoalForm'
import { ContributionForm } from '@/components/goals/ContributionForm'
import { contributionsByGoal } from '@/lib/finance/goals'
import type { Goal } from '@/lib/types'

export default function GoalsPage() {
  const { goals, goalContributions, currentHousehold, deleteGoal, t } = useApp()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributingTo, setContributingTo] = useState<Goal | null>(null)

  const byGoal = useMemo(() => contributionsByGoal(goalContributions), [goalContributions])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (g: Goal) => {
    setEditing(g)
    setFormOpen(true)
  }

  return (
    <ReadingColumn>
      <div className="pt-2">
        <Link href="/planning" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Planning')}
        </Link>
      </div>
      <PageHeader
        title={t('Goals')}
        right={
          <IconButton onClick={openNew} ariaLabel={t('New goal')} disabled={!currentHousehold}>
            <Plus size={20} />
          </IconButton>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={40} strokeWidth={1.5} />}
          title={t('No goals yet')}
          body={t('Name something you’re saving toward or paying off, set a target, and track your progress.')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              contributions={byGoal[g.id] ?? []}
              onAddContribution={setContributingTo}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <GoalForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDelete={(g) => deleteGoal(g.id)}
      />
      <ContributionForm goal={contributingTo} onClose={() => setContributingTo(null)} />
    </ReadingColumn>
  )
}

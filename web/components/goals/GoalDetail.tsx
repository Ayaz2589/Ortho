'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import { goalProgress } from '@/lib/finance/goals'
import { goalProjection, whatIfScenarios } from '@/lib/finance/goalProjection'
import { monthYear } from '@/lib/format'
import { GoalForm } from '@/components/goals/GoalForm'
import { ContributionForm } from '@/components/goals/ContributionForm'
import { ContributionLedger } from '@/components/goals/ContributionLedger'
import { DetailBlock } from '@/components/goals/detail/DetailBlock'
import { ProjectedFinishBlock } from '@/components/goals/detail/ProjectedFinishBlock'
import { ProgressTowardTargetBlock } from '@/components/goals/detail/ProgressTowardTargetBlock'
import { PaceAgainstPlanBlock } from '@/components/goals/detail/PaceAgainstPlanBlock'
import { ConsistencyBlock } from '@/components/goals/detail/ConsistencyBlock'
import type { Goal, GoalContribution } from '@/lib/types'

/**
 * One savings target or debt, in depth (spec 059 US4 — rebuilt from spec 045).
 *
 * The page this replaces repeated the card wholesale and then added two charts
 * that carried no information: a near-straight cumulative line with no target,
 * and a "by month" bar chart that was a picket fence of equal bars. Five blocks
 * now each answer something that page didn't — when this finishes and what would
 * move that date, how the balance is tracking toward the target, whether each
 * payment matched the plan, whether any month was missed, and the full ledger.
 *
 * With fewer than three contributions there is nothing honest to project, so the
 * four analysis blocks collapse to a single line saying exactly that — and the
 * ledger still renders in full, because what has already happened is still true.
 */
export function GoalDetail({ goal, contributions }: { goal: Goal; contributions: GoalContribution[] }) {
  const { formatMoney, t, locale, deleteGoal, deleteContribution } = useApp()
  const [editingGoal, setEditingGoal] = useState(false)
  const [addingTo, setAddingTo] = useState<Goal | null>(null)
  const [editingContribution, setEditingContribution] = useState<GoalContribution | null>(null)

  const now = useMemo(() => new Date(), [])
  const isDebt = goal.kind === 'debt_payoff'

  const progress = useMemo(() => goalProgress(goal.target_cents, contributions), [goal.target_cents, contributions])
  const projection = useMemo(() => goalProjection(goal, contributions, now), [goal, contributions, now])
  const scenarios = useMemo(
    () => whatIfScenarios(projection, progress.remaining_cents, now),
    [projection, progress.remaining_cents, now]
  )

  const pct = Math.round(progress.fraction * 100)
  const remainingPct = Math.max(0, 100 - pct)
  const cadence = projection.cadence
  const Icon = isDebt ? ArrowDown : ArrowUp

  return (
    <>
      <div className="pt-2">
        <Link href="/planning" className="inline-flex items-center gap-1 text-[13.5px] text-text-2">
          <ChevronLeft size={16} />
          {t('Planning')}
        </Link>
      </div>

      {/* Hero */}
      <div className="mt-4 flex items-start gap-3.5">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={
            isDebt
              ? { background: 'var(--surface-2)', color: 'var(--text-2)' }
              : {
                  background: 'transparent',
                  border: '0.5px solid color-mix(in srgb, var(--positive) 35%, transparent)',
                  color: 'var(--positive)',
                }
          }
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="min-w-0 truncate text-[22px] tracking-[-0.5px] text-text">{goal.name}</h1>
            <button
              type="button"
              onClick={() => setEditingGoal(true)}
              className="ortho-interactive -my-1 inline-flex shrink-0 items-center gap-1 rounded py-1 text-[12.5px] text-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Pencil size={12} />
              {t('Edit')}
            </button>
          </div>
          {cadence ? (
            <p data-testid="detail-cadence" className="mt-1 text-[12.5px] tabular-nums text-text-3">
              {t(
                '{0} · {1} every {2} since {3}',
                isDebt ? t('Debt') : t('Savings'),
                formatMoney(cadence.amountCents),
                ordinal(cadence.dayOfMonth, locale),
                monthYear(monthStart(cadence.firstMonthKey), locale)
              )}
            </p>
          ) : (
            <p className="mt-1 text-[12.5px] text-text-3">{isDebt ? t('Debt') : t('Savings')}</p>
          )}
        </div>
      </div>

      <p
        data-testid="detail-headline"
        className="mb-0.5 mt-3.5 text-[34px] font-semibold tracking-[-1.1px] tabular-nums text-text"
      >
        {formatMoney(isDebt ? progress.remaining_cents : progress.saved_cents)}
        <small className="ml-2 text-[14px] font-normal tracking-[-0.1px] text-text-3">
          {isDebt
            ? t('left of {0}', formatMoney(goal.target_cents))
            : t('saved of {0}', formatMoney(goal.target_cents))}
        </small>
      </p>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('{0}% complete', pct)}
        className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)' }}
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

      <div className="mt-2 flex justify-between gap-3 text-[12.5px] tabular-nums text-text-3">
        <span className="min-w-0 truncate">
          {isDebt
            ? t('{0} paid · {1}%', formatMoney(progress.saved_cents), pct)
            : t('{0} saved · {1}%', formatMoney(progress.saved_cents), pct)}
        </span>
        <span className="shrink-0">
          {projection.available && projection.paymentsToGo !== null
            ? isDebt
              ? t('{0} payments to go', projection.paymentsToGo)
              : t('{0} deposits to go', projection.paymentsToGo)
            : t('{0} to go', formatMoney(progress.remaining_cents))}
        </span>
      </div>

      {projection.available ? (
        <>
          <ProjectedFinishBlock goal={goal} projection={projection} scenarios={scenarios} now={now} />
          <ProgressTowardTargetBlock goal={goal} contributions={contributions} projection={projection} now={now} />
          <PaceAgainstPlanBlock projection={projection} />
          <ConsistencyBlock projection={projection} />
        </>
      ) : (
        <section
          data-testid="detail-no-projection"
          className="mt-[26px] border-t pt-5"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <p className="text-[13px] text-text-2">
            {projection.unavailableReason === 'reached'
              ? t('Reached — nothing left to project.')
              : t('Not enough history to project yet. Add a few more contributions and this fills in.')}
          </p>
        </section>
      )}

      <DetailBlock
        label={t('Contributions')}
        value={
          <button
            type="button"
            onClick={() => setAddingTo(goal)}
            className="ortho-interactive -my-1 rounded py-1 text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Plus size={12} className="mr-0.5 inline" aria-hidden />
            {t('Add')}
          </button>
        }
      >
        <ContributionLedger
          contributions={contributions}
          onEdit={setEditingContribution}
          onDelete={(c) => deleteContribution(c.id)}
        />
      </DetailBlock>

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

function monthStart(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function ordinal(day: number, locale: string): string {
  try {
    const pr = new Intl.PluralRules(locale, { type: 'ordinal' })
    const suffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
    const suffix = suffixes[pr.select(day)]
    return suffix ? `${day}${suffix}` : String(day)
  } catch {
    return String(day)
  }
}

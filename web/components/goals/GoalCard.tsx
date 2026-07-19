'use client'

import { Plus, Pencil, PiggyBank, TrendingDown } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { goalProgress, goalPacing } from '@/lib/finance/goals'
import { parseLocalDate } from '@/lib/format'
import type { Goal, GoalContribution } from '@/lib/types'

/** The calm progress view for one goal (spec 027). Money is the headline; the
 *  bar is a hairline fill in the sage `--positive`; the pace line for a dated
 *  goal is the sand `--accent` when behind — NEVER red (behind is never red). */
export function GoalCard({
  goal,
  contributions,
  now,
  onAddContribution,
  onEdit,
}: {
  goal: Goal
  contributions: GoalContribution[]
  now?: Date
  onAddContribution?: (goal: Goal) => void
  onEdit?: (goal: Goal) => void
}) {
  const { formatMoney, t, locale } = useApp()
  const progress = goalProgress(goal.target_cents, contributions)
  const pct = Math.round(progress.fraction * 100)
  const pacing = goalPacing(
    goal.target_cents,
    goal.target_date,
    goal.created_at,
    progress.saved_cents,
    now ?? new Date()
  )

  const kindLabel = goal.kind === 'debt_payoff' ? t('Debt payoff') : t('Savings')
  const Icon = goal.kind === 'debt_payoff' ? TrendingDown : PiggyBank

  const dueLabel = goal.target_date
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        parseLocalDate(goal.target_date)
      )
    : null

  // Pace line for a dated goal. Behind → calm accent + a nudge; on pace → muted.
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
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-2"
          style={{ background: 'var(--chip-bg, color-mix(in srgb, var(--text) 6%, transparent))' }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[17px] font-normal text-text">{goal.name}</p>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(goal)}
                aria-label={t('Edit {0}', goal.name)}
                className="ortho-interactive shrink-0 rounded-full p-1.5 text-text-3"
              >
                <Pencil size={15} />
              </button>
            ) : null}
          </div>
          <p className="text-[13px] text-text-3">{kindLabel}</p>

          {/* Money headline: saved of target, tabular. */}
          <p className="mt-2 text-[15px] tabular-nums text-text">
            <span className="text-text">{formatMoney(progress.saved_cents)}</span>
            <span className="text-text-3"> {t('of')} </span>
            <span className="text-text-2">{formatMoney(goal.target_cents)}</span>
          </p>

          {/* Accessible progress bar (hairline track, sage fill). */}
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={t('{0}% complete', pct)}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--hairline)' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'var(--positive)' }}
            />
          </div>

          {/* Status line. */}
          <p className="mt-1.5 text-[13px] text-text-2">
            {progress.reached
              ? t('Reached')
              : t('{0} to go', formatMoney(progress.remaining_cents))}
          </p>

          {paceText ? (
            <p className="mt-0.5 text-[13px]" style={{ color: paceColor }}>
              {paceText}
            </p>
          ) : null}

          {onAddContribution ? (
            <button
              type="button"
              onClick={() => onAddContribution(goal)}
              className="ortho-interactive mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-accent"
              style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
            >
              <Plus size={14} />
              {t('Add contribution')}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

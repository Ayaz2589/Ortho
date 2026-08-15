'use client'

import Link from 'next/link'
import { Plus, Pencil, PiggyBank, TrendingDown, Trash2, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { goalProgress, goalPacing } from '@/lib/finance/goals'
import { parseLocalDate } from '@/lib/format'
import type { Goal, GoalContribution } from '@/lib/types'

/** The calm progress view for one goal (spec 027). Money is the headline; the
 *  bar is a hairline fill in the sage `--positive`; the pace line for a dated
 *  goal is the sand `--accent` when behind — NEVER red (behind is never red).
 *
 *  Spec 045: this is now the Planning hub's per-goal card AND the detail page's
 *  summary — one component, so the two surfaces cannot drift apart (the old hub
 *  `GoalRow` and this card already disagreed on the on-pace wording). `href`
 *  turns the name into a link to the goal's own page; `maxContributions` caps the
 *  ledger on the hub, where cards must stay a comparable, scannable size (the full
 *  ledger lives on the detail page); the contribution handlers are passed only by
 *  the detail page, so the hub card shows no per-row actions. */
export function GoalCard({
  goal,
  contributions,
  now,
  onAddContribution,
  onEdit,
  href,
  maxContributions,
  onEditContribution,
  onDeleteContribution,
}: {
  goal: Goal
  contributions: GoalContribution[]
  now?: Date
  onAddContribution?: (goal: Goal) => void
  onEdit?: (goal: Goal) => void
  /** When set, the goal's name becomes a link to its detail page. */
  href?: string
  /** Cap the ledger to the most recent N. Undefined shows every contribution. */
  maxContributions?: number
  onEditContribution?: (c: GoalContribution) => void
  onDeleteContribution?: (c: GoalContribution) => void
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

  const dateFmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  const dueLabel = goal.target_date ? dateFmt.format(parseLocalDate(goal.target_date)) : null

  // Individual payments behind the saved total, newest first (spec 040) — so the
  // headline number is auditable. Date desc, then most-recently-recorded first.
  const sorted = [...contributions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  })
  const ledger = maxContributions != null ? sorted.slice(0, maxContributions) : sorted
  const hidden = sorted.length - ledger.length

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

  const title = <span className="truncate text-[17px] font-normal text-text">{goal.name}</span>

  return (
    <Card className="p-4">
      {/* The testid sits here, not on Card — the shared primitive takes only
          className/children and would silently drop it. */}
      <div data-testid="goal-card" className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-2"
          style={{ background: 'var(--chip-bg, color-mix(in srgb, var(--text) 6%, transparent))' }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            {href ? (
              <Link
                href={href}
                className="ortho-interactive flex min-w-0 items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {title}
                <ChevronRight size={16} className="shrink-0 text-text-3" aria-hidden />
              </Link>
            ) : (
              title
            )}
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
          <p data-testid="goal-headline" className="mt-2 text-[15px] tabular-nums text-text">
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

          {/* Payment breakdown — the individual contributions behind the total. */}
          <p className="mt-3 text-[11px] font-normal uppercase tracking-[0.6px] text-text-3">
            {t('Contributions')}
          </p>
          {ledger.length > 0 ? (
            <ul data-testid="contribution-list" className="mt-1 flex flex-col gap-1">
              {ledger.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-text-2">
                    <span className="tabular-nums">{dateFmt.format(parseLocalDate(c.date))}</span>
                    {c.note ? <span className="text-text-3"> · {c.note}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="tabular-nums text-text">{formatMoney(c.amount_cents)}</span>
                    {onEditContribution ? (
                      <button
                        type="button"
                        onClick={() => onEditContribution(c)}
                        aria-label={t('Edit contribution')}
                        className="ortho-interactive rounded-full p-1.5 text-text-3"
                      >
                        <Pencil size={13} />
                      </button>
                    ) : null}
                    {onDeleteContribution ? (
                      <button
                        type="button"
                        onClick={() => onDeleteContribution(c)}
                        aria-label={t('Delete contribution')}
                        className="ortho-interactive rounded-full p-1.5 text-text-3"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-text-3">{t('No contributions yet')}</p>
          )}

          {hidden > 0 ? (
            <p className="mt-1 text-[12px] text-text-3">{t('{0} more', hidden)}</p>
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

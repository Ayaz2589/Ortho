'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { parseLocalDate } from '@/lib/format'
import type { GoalsSummary, GoalRowSummary } from '@/lib/planning/planSummary'
import { PlanningSection } from './PlanningSection'

/**
 * Goals summary (spec 038 — US4). Per goal: progress, saved-of-target, on/off-track
 * status, projected/due outlook, and — when behind — the suggested monthly
 * contribution to catch up. Off-track goals are listed first. Links out to the full
 * Goals page. Behind is calm sand `--accent`, reached is sage `--positive`, never
 * red. Presentational — the page passes the computed `GoalsSummary` in.
 */
export function GoalsSummaryCard({ summary }: { summary: GoalsSummary }) {
  const { t } = useApp()

  const viewAll = (
    <Link
      href="/goals"
      className="inline-flex items-center gap-1 rounded-lg text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {t('View all goals')}
      <ArrowRight size={14} />
    </Link>
  )

  if (summary.goalCount === 0) {
    return (
      <PlanningSection title={t('Goals')} action={viewAll}>
        <p data-testid="goals-empty" className="py-2 text-sm text-text-2">
          {t('No goals yet — create one to start saving toward it.')}
        </p>
      </PlanningSection>
    )
  }

  return (
    <PlanningSection title={t('Goals')} action={viewAll}>
      <ul className="flex flex-col gap-4">
        {summary.rows.map((row) => (
          <GoalRow key={row.goalId} row={row} />
        ))}
      </ul>
    </PlanningSection>
  )
}

function GoalRow({ row }: { row: GoalRowSummary }) {
  const { formatMoney, t, locale } = useApp()
  const pct = Math.round(row.fraction * 100)

  const dueLabel = row.targetDate
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        parseLocalDate(row.targetDate),
      )
    : null

  // Status line — behind is calm accent (never red); reached is sage.
  let statusText: string | null = null
  let statusColor = 'var(--text-2)'
  if (row.reached) {
    statusText = dueLabel ? t('Reached · by {0}', dueLabel) : t('Reached')
    statusColor = 'var(--positive)'
  } else if (row.dated && row.offTrack) {
    statusText = t('Behind pace — set aside {0}/mo to reach it by {1}.', formatMoney(row.suggestedMonthlyCents), dueLabel ?? '')
    statusColor = 'var(--accent)'
  } else if (row.dated) {
    statusText = t('On track · due {0}', dueLabel ?? '')
  }

  return (
    <li data-testid="goal-row" className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-text">{row.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-2">
          {formatMoney(row.savedCents)} {t('of')} {formatMoney(row.targetCents)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('{0}% complete', pct)}
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--hairline)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--positive)' }} />
      </div>
      {statusText ? (
        <span className="text-xs" style={{ color: statusColor }}>
          {statusText}
        </span>
      ) : null}
    </li>
  )
}

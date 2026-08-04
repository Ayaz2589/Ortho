'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import type { BudgetSummary, PaceState } from '@/lib/planning/planSummary'
import { PlanningSection } from './PlanningSection'

/** Bar/label tint: sand `--accent` when at/over or ahead of pace, else sage
 *  `--positive`. NEVER red — an overspend is a nudge, not an alarm. */
function paceColor(pace: PaceState): string {
  return pace === 'under' ? 'var(--positive)' : 'var(--accent)'
}

/**
 * Budget summary (spec 038 — US3). An overall spent-vs-budgeted pace bar plus the
 * few categories closest to or over their allowance, health judged by PACE (spend
 * vs. how far into the month), with rollover carry surfaced. Links out to the full
 * Budgets page. Presentational — the page passes the computed `BudgetSummary` in.
 */
export function BudgetSummaryCard({ summary }: { summary: BudgetSummary }) {
  const { formatMoney, t } = useApp()

  const viewAll = (
    <Link
      href="/budgets"
      className="inline-flex items-center gap-1 rounded-lg text-[13px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {t('View all budgets')}
      <ArrowRight size={14} />
    </Link>
  )

  if (summary.budgetCount === 0) {
    return (
      <PlanningSection title={t('Budgets')} action={viewAll}>
        <p data-testid="budget-empty" className="py-2 text-sm text-text-2">
          {t('No budgets yet — set one up to plan your spending.')}
        </p>
      </PlanningSection>
    )
  }

  const overallFraction =
    summary.totalLimitCents > 0 ? Math.min(1, summary.totalSpentCents / summary.totalLimitCents) : 0

  return (
    <PlanningSection title={t('Budgets')} action={viewAll}>
      {/* Overall spent vs budgeted */}
      <div className="mb-4 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-text-2">{t('This month')}</span>
          <span className="tabular-nums text-text-3">
            {formatMoney(summary.totalSpentCents)} {t('of')} {formatMoney(summary.totalLimitCents)}
          </span>
        </div>
        <div
          data-testid="budget-overall-bar"
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--chip-bg)' }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${overallFraction * 100}%`, background: paceColor(summary.overallPace) }}
          />
        </div>
      </div>

      {/* Top at-risk categories */}
      <ul className="flex flex-col gap-3.5">
        {summary.atRisk.map((row) => {
          const meta = categoryMeta(row.category)
          const Icon = meta.icon
          const color = paceColor(row.pace)
          const remainingLabel =
            row.remainingCents >= 0
              ? t('{0} left', formatMoney(row.remainingCents))
              : t('{0} over', formatMoney(-row.remainingCents))
          const carriedLabel =
            row.carriedInCents > 0
              ? t('{0} rolled over', formatMoney(row.carriedInCents))
              : row.carriedInCents < 0
                ? t('{0} carried shortfall', formatMoney(-row.carriedInCents))
                : null
          return (
            <li key={row.budgetId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2">
                  <Icon size={14} style={{ color: meta.tint }} />
                  <span className="text-sm text-text">{t(meta.label)}</span>
                </span>
                <span className="text-xs tabular-nums" style={{ color }}>
                  {remainingLabel}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--chip-bg)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(1, row.fraction) * 100}%`, background: color }}
                />
              </div>
              {carriedLabel ? (
                <span className="text-xs tabular-nums text-text-3">{carriedLabel}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </PlanningSection>
  )
}

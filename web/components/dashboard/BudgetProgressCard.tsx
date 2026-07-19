'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import { budgetStatusForMonth } from '@/lib/finance/budgets'
import type { Interval } from './range'

/** Sage under; sand --accent near/over limit. Loss/cost is never red — the full
 *  bar position conveys "over limit", not color. */
function barColor(fraction: number): string {
  if (fraction >= 0.85) return 'var(--accent)'
  return 'var(--positive)'
}

/**
 * Spend vs the rollover-aware EFFECTIVE limit, one row per budgeted category
 * (spec 027). Shows per-bucket remaining and, when a bucket carried surplus (or a
 * non-monthly shortfall) into the month, a caption naming it. Defaults to the
 * current month; a selected month scopes it via `interval` + `label`.
 * Hides itself when no budgets with a positive base limit are set.
 */
export function BudgetProgressCard({
  interval,
  label,
}: {
  interval?: Interval
  label?: string
} = {}) {
  const { budgets, transactions, formatMoney, t } = useApp()

  const now = new Date()
  const monthStart = interval ? interval.start : new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = interval ? interval.end : new Date(now.getFullYear(), now.getMonth() + 1, 1)
  // Reference month = the interval midpoint (~the 15th): local-calendar-stable, so
  // the carry anchor/series can't be flipped a month by the process timezone.
  const referenceMonth = useMemo(
    () => new Date((monthStart.getTime() + monthEnd.getTime()) / 2),
    [monthStart, monthEnd],
  )

  // One rollover-aware status per positive-limit budget (memoized — unrelated
  // store changes don't recompute). budgetStatusForMonth derives carry from the
  // ledger, so effective limit / remaining reflect prior-month surplus.
  const rows = useMemo(() => {
    return budgets
      .filter((b) => b.monthly_limit_cents > 0)
      .map((b) => {
        const status = budgetStatusForMonth(b, transactions, referenceMonth)
        const fraction =
          status.effectiveLimitCents > 0 ? status.spentCents / status.effectiveLimitCents : 0
        return { budget: b, status, fraction }
      })
      .sort((a, b) => b.fraction - a.fraction)
  }, [transactions, budgets, referenceMonth])

  if (rows.length === 0) return null

  return (
    <Card className="p-5">
      <SectionLabel right={label ?? t('This month')}>{t('Budgets')}</SectionLabel>
      <div className="mt-3 flex flex-col gap-3.5">
        {rows.map((row) => {
          const meta = categoryMeta(row.budget.category)
          const Icon = meta.icon
          const color = barColor(row.fraction)
          const { spentCents, effectiveLimitCents, remainingCents, carriedInCents } = row.status
          const remainingLabel =
            remainingCents >= 0
              ? t('{0} left', formatMoney(remainingCents))
              : t('{0} over', formatMoney(-remainingCents))
          const carriedLabel =
            carriedInCents > 0
              ? t('{0} rolled over', formatMoney(carriedInCents))
              : carriedInCents < 0
                ? t('{0} carried shortfall', formatMoney(-carriedInCents))
                : null
          return (
            <div key={row.budget.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: meta.tint }} />
                  <span className="text-sm font-normal text-text">{t(meta.label)}</span>
                </div>
                <span className="text-xs font-normal tabular-nums" style={{ color }}>
                  {remainingLabel}
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: 'var(--chip-bg)' }}
              >
                <div
                  data-testid="budget-bar-fill"
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(1, row.fraction) * 100}%`, background: color }}
                />
              </div>
              <div className="flex items-baseline justify-between text-xs font-normal text-text-3">
                <span className="tabular-nums">
                  {formatMoney(spentCents)} {t('of')} {formatMoney(effectiveLimitCents)}
                </span>
                {carriedLabel && <span className="tabular-nums">{carriedLabel}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import type { Interval } from './range'

/** Sage under; sand --accent near/over limit. Loss/cost is never red — the full
 *  bar position conveys "over limit", not color. */
function barColor(fraction: number): string {
  if (fraction >= 0.85) return 'var(--accent)'
  return 'var(--positive)'
}

/**
 * Spend vs monthly limit, one row per budgeted category. Defaults to the current
 * month; when a specific month is selected on the dashboard, `interval` scopes it
 * to that month and `label` overrides the "This month" caption.
 * Hides itself when no budgets with a positive limit are set.
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
  const startMs = monthStart.getTime()
  const endMs = monthEnd.getTime()

  // One pass over the ledger builds the in-range expense total per category —
  // was one whole-array rescan per budgeted category via categoryExpenseTotal —
  // memoized so unrelated store changes don't recompute it (spec 023 P3).
  const rows = useMemo(() => {
    const spentByCategory = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      const ms = new Date(tx.date).getTime()
      if (ms < startMs || ms >= endMs) continue
      spentByCategory.set(tx.category, (spentByCategory.get(tx.category) ?? 0) + tx.amount_cents)
    }
    return budgets
      .filter((b) => b.monthly_limit_cents > 0)
      .map((b) => {
        const spent = spentByCategory.get(b.category) ?? 0
        return { budget: b, spent, fraction: spent / b.monthly_limit_cents }
      })
      .sort((a, b) => b.fraction - a.fraction)
  }, [transactions, budgets, startMs, endMs])

  if (rows.length === 0) return null

  return (
    <Card className="p-5">
      <SectionLabel right={label ?? t('This month')}>{t('Budgets')}</SectionLabel>
      <div className="mt-3 flex flex-col gap-3.5">
        {rows.map((row) => {
          const meta = categoryMeta(row.budget.category)
          const Icon = meta.icon
          const color = barColor(row.fraction)
          return (
            <div key={row.budget.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: meta.tint }} />
                  <span className="text-sm font-normal text-text">{t(meta.label)}</span>
                </div>
                <span className="text-xs font-normal tabular-nums" style={{ color }}>
                  {formatMoney(row.spent)} / {formatMoney(row.budget.monthly_limit_cents)}
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: 'var(--chip-bg)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(1, row.fraction) * 100}%`, background: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

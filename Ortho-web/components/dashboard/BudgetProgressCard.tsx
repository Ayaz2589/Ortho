'use client'

import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'

/** Sage under, accent in the warning band, destructive at/over limit. */
function barColor(fraction: number): string {
  if (fraction >= 1) return 'var(--destructive)'
  if (fraction >= 0.85) return 'var(--accent)'
  return 'var(--positive)'
}

/**
 * Month-to-date spend vs monthly limit, one row per budgeted category.
 * Hides itself when no budgets with a positive limit are set.
 */
export function BudgetProgressCard() {
  const { budgets, categoryExpenseTotal, formatMoney } = useApp()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const rows = budgets
    .filter((b) => b.monthly_limit_cents > 0)
    .map((b) => {
      const spent = categoryExpenseTotal(b.category, monthStart, monthEnd)
      return { budget: b, spent, fraction: spent / b.monthly_limit_cents }
    })
    .sort((a, b) => b.fraction - a.fraction)

  if (rows.length === 0) return null

  return (
    <Card className="p-5">
      <SectionLabel right="This month">Budgets</SectionLabel>
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
                  <span className="text-sm font-medium text-text">{meta.label}</span>
                </div>
                <span className="text-xs font-medium tabular-nums" style={{ color }}>
                  {formatMoney(row.spent)} / {formatMoney(row.budget.monthly_limit_cents)}
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: 'rgba(0,0,0,0.05)' }}
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

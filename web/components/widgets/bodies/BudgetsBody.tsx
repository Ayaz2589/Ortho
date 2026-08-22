'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { categoryMeta } from '@/lib/categories'
import { budgetStatusForMonth } from '@/lib/finance/budgets'
import { scopeBudgets } from '@/lib/scope/moneyScope'

/** Bar tint: the sand `--accent` near/over the limit, else sage `--positive`.
 *  Never red — an overspend is a nudge, not an alarm (money-first system). */
function barColor(fraction: number): string {
  return fraction >= 0.85 ? 'var(--accent)' : 'var(--positive)'
}

/**
 * Budgets widget body (spec 038 — Section 3). Ports the deleted
 * `BudgetProgressCard`: rollover-aware spend vs effective limit for each budget
 * via `budgetStatusForMonth` (carry derived from the ledger). Reads PROPLESS from
 * `useApp()` + `useDashboardScopeContext()`; the reference month is the shared
 * scope's `referenceDate` (the selected month, else now). Rows sort by how full
 * they are; CSS bars only, no chart.
 *
 * spec 056 — BOTH halves of "spent X of Y" are projected by the SAME scope, which
 * is the whole point of spec 054's `scopeBudgets` existing beside
 * `scopeTransactions`. Under the household the rows are the household's limits
 * measured against household spend; under a person, that person's limits measured
 * against their share. There is deliberately NO fallback to a household limit for
 * a person who has set none (FR-011) — a household allowance is sized for everyone,
 * so measuring one person's share against it is the spec-052 error class.
 */
export function BudgetsBody() {
  const { budgets, transactions: allTransactions, formatMoney, t } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { referenceDate } = useDashboardScopeContext()

  const rows = useMemo(() => {
    return scopeBudgets(budgets, scope)
      .filter((b) => b.monthly_limit_cents > 0)
      .map((b) => {
        const status = budgetStatusForMonth(b, transactions, referenceDate)
        const fraction =
          status.effectiveLimitCents > 0 ? status.spentCents / status.effectiveLimitCents : 0
        return { budget: b, status, fraction }
      })
      .sort((a, b) => b.fraction - a.fraction)
  }, [budgets, scope, transactions, referenceDate])

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('No budgets yet.')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3.5">
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
                <span className="text-sm text-text">{t(meta.label)}</span>
              </div>
              <span className="text-xs tabular-nums" style={{ color }}>
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
            <div className="flex items-baseline justify-between text-xs text-text-3">
              <span className="tabular-nums">
                {formatMoney(spentCents)} {t('of')} {formatMoney(effectiveLimitCents)}
              </span>
              {carriedLabel ? <span className="tabular-nums">{carriedLabel}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { scopeBudgets } from '@/lib/scope/moneyScope'
import { categoryMeta } from '@/lib/categories'
import { budgetLedgerForMonth, type RolloverMonth } from '@/lib/finance/budgets'
import { currentMonthKey, monthElapsedFraction } from '@/lib/planning/planSummary'
import { usePanelCaption } from '@/components/widgets/WidgetPanel'
import type { Budget, Transaction, TransactionCategory } from '@/lib/types'

/**
 * Budgets detail panel (spec 057, US3 — the second reference panel). Answers
 * three things the card cannot: which purchases composed this month's spend,
 * how a carried balance accumulated over recent months (D8 — the rollover
 * ledger `budgetStatusForMonth` already built and discarded every render),
 * and where the category is projected to land at month end.
 *
 * Honours BOTH scope axes, projected at the same entry point exactly as
 * `BudgetsBody` does: `scopeBudgets` for limits, scoped transactions for
 * spend. Under person scope there is deliberately NO fallback to a household
 * limit for a category the person has none of (spec 054 FR-011, the spec-052
 * error class) — it is named as having no personal limit instead.
 */

interface BudgetSection {
  budget: Budget
  status: RolloverMonth
  ledger: RolloverMonth[]
  composing: Transaction[]
  projectedSpentCents: number | null
}

interface UnlimitedCategory {
  category: TransactionCategory
  spentCents: number
}

function monthLabelAt(referenceMonth: Date, ledgerLength: number, index: number): Date {
  const monthsBack = ledgerLength - 1 - index
  return new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() - monthsBack, 1)
}

export function BudgetsPanel() {
  const { budgets, transactions: allTransactions, formatMoney, t, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { referenceDate, periodLabel } = useDashboardScopeContext()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: periodLabel })

  const monthKey = currentMonthKey(referenceDate)
  const elapsedFraction = monthElapsedFraction(monthKey, new Date())

  const sections = useMemo<BudgetSection[]>(() => {
    return scopeBudgets(budgets, scope)
      .filter((b) => b.monthly_limit_cents > 0)
      .map((budget) => {
        const ledger = budgetLedgerForMonth(budget, transactions, referenceDate)
        const status = ledger[ledger.length - 1]
        const composing = transactions.filter(
          (tx) =>
            tx.kind === 'expense' &&
            tx.category === budget.category &&
            currentMonthKey(new Date(tx.date)) === monthKey
        )
        const projectedSpentCents =
          elapsedFraction > 0 && elapsedFraction < 1 ? Math.round(status.spentCents / elapsedFraction) : null
        return { budget, status, ledger, composing, projectedSpentCents }
      })
  }, [budgets, scope, transactions, referenceDate, monthKey, elapsedFraction])

  const unlimitedCategories = useMemo<UnlimitedCategory[]>(() => {
    if (scope.kind !== 'person') return []
    const limited = new Set(sections.map((s) => s.budget.category))
    const spentByCategory = new Map<TransactionCategory, number>()
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      if (currentMonthKey(new Date(tx.date)) !== monthKey) continue
      if (limited.has(tx.category)) continue
      spentByCategory.set(tx.category, (spentByCategory.get(tx.category) ?? 0) + tx.amount_cents)
    }
    return [...spentByCategory.entries()].map(([category, spentCents]) => ({ category, spentCents }))
  }, [scope, sections, transactions, monthKey])

  if (budgets.length === 0 || (sections.length === 0 && unlimitedCategories.length === 0)) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[13px] text-text-3">
        {t('No budgets yet.')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {sections.map((section) => (
        <BudgetSectionView key={section.budget.id} section={section} referenceDate={referenceDate} />
      ))}
      {unlimitedCategories.map((c) => (
        <div key={c.category} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-text">{t(categoryMeta(c.category).label)}</span>
            <span className="text-sm tabular-nums text-text-2">{formatMoney(c.spentCents)}</span>
          </div>
          <span className="text-xs text-text-3">{t('No personal limit set for this category.')}</span>
        </div>
      ))}
    </div>
  )
}

function BudgetSectionView({ section, referenceDate }: { section: BudgetSection; referenceDate: Date }) {
  const { formatMoney, t, locale } = useApp()
  const { budget, status, ledger, composing, projectedSpentCents } = section
  const meta = categoryMeta(budget.category)

  const remainingLabel =
    status.remainingCents >= 0 ? t('{0} left', formatMoney(status.remainingCents)) : t('{0} over', formatMoney(-status.remainingCents))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text">{t(meta.label)}</span>
        <span className="text-xs tabular-nums text-text-2">{remainingLabel}</span>
      </div>
      <div className="text-xs tabular-nums text-text-3">
        {formatMoney(status.spentCents)} {t('of')} {formatMoney(status.effectiveLimitCents)}
      </div>

      {projectedSpentCents != null ? (
        <div className="text-xs text-text-2">
          {t('Projected to reach {0} by month end at the current pace.', formatMoney(projectedSpentCents))}
        </div>
      ) : null}

      {ledger.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.4px] text-text-2">{t('Recent months')}</span>
          {ledger.slice(0, -1).map((month, idx) => {
            const label = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
              monthLabelAt(referenceDate, ledger.length, idx)
            )
            const carryLabel =
              month.carriedInCents > 0
                ? t('{0} rolled over', formatMoney(month.carriedInCents))
                : month.carriedInCents < 0
                  ? t('{0} carried shortfall', formatMoney(-month.carriedInCents))
                  : null
            return (
              <div key={idx} className="flex items-baseline justify-between text-xs text-text-3">
                <span>{label}</span>
                {carryLabel ? <span className="tabular-nums">{carryLabel}</span> : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {composing.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.4px] text-text-2">{t('Transactions this month')}</span>
          {composing.map((tx) => (
            <div key={tx.id} className="flex items-baseline justify-between text-sm">
              <span className="text-text-2">{tx.merchant}</span>
              <span className="tabular-nums text-text">{formatMoney(tx.amount_cents)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

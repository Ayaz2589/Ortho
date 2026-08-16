'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { CATEGORY_GROUPS, CATEGORIES } from '@/lib/categories'
import type { BudgetType, TransactionCategory } from '@/lib/types'
import { BudgetDrawer } from '@/components/budgets/BudgetDrawer'
import { PlanScopeBar } from '@/components/planning/PlanScopeBar'
import { HOUSEHOLD_SCOPE, resolveScope, scopeBudgets, type MoneyScope } from '@/lib/scope/moneyScope'

// A non-fixed bucket surfaces its type as a small caption; fixed is the quiet default.
const TYPE_LABEL: Record<BudgetType, string> = {
  fixed: 'Fixed',
  flex: 'Flex',
  non_monthly: 'Non-monthly',
}

export default function BudgetsPage() {
  const { budgets, householdMembers, formatMoney, t } = useApp()
  const [editing, setEditing] = useState<TransactionCategory | null>(null)
  // spec 054 — whose budgets. Re-resolved every render so a person removed mid-session
  // degrades to the household instead of showing an empty page (the resolveScope rule).
  const [rawScope, setScope] = useState<MoneyScope>(HOUSEHOLD_SCOPE)
  const scope = resolveScope(rawScope, householdMembers.map((m) => m.id))
  const personId = scope.kind === 'person' ? scope.personId : null
  const personName = householdMembers.find((m) => m.id === personId)?.name ?? null
  // Only the selected scope's limits — a personal budget is a separate row, and the
  // household number is never borrowed for a person who hasn't set one (FR-003).
  const visible = scopeBudgets(budgets, scope)

  return (
    <ReadingColumn>
      <div className="pt-2">
        <Link href="/planning" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Planning')}
        </Link>
      </div>
      <PageHeader title={t('Budgets')} />

      <PlanScopeBar scope={scope} onChange={setScope} />

      <div className="flex flex-col gap-4">
        {CATEGORY_GROUPS.expense.map((group) => (
          <div key={group.key}>
            <div
              className="px-1 pb-2"
              style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}
            >
              {t(group.label)}
            </div>
            <div
              className="divide-y divide-hairline overflow-hidden rounded-2xl bg-surface"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            >
              {group.children.map((cat) => {
                const meta = CATEGORIES[cat]
                const Icon = meta.icon
                const budget = visible.find((b) => b.category === cat) ?? null
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEditing(cat)}
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: meta.tint }}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="text-[17px] font-normal text-text">{t(meta.label)}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="flex flex-col items-end">
                        <span
                          className={
                            'text-[15px] font-normal tabular-nums ' +
                            (budget ? 'text-text-2' : 'text-text-3')
                          }
                        >
                          {budget ? t('{0} / mo', formatMoney(budget.monthly_limit_cents)) : t('Not set')}
                        </span>
                        {budget && budget.budget_type !== 'fixed' && (
                          <span className="text-[12px] font-normal text-text-3">
                            {t(TYPE_LABEL[budget.budget_type])}
                          </span>
                        )}
                      </span>
                      <ChevronRight size={16} className="text-text-3" />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        {personName
          ? t(
              "Only {0}'s limits are shown here, measured against their share of what the household spends. The household's own budgets stay under Everyone.",
              personName,
            )
          : t("Budgets drive the spending insights on your dashboard. Set a monthly limit for any category and you'll see progress + alerts when you're close to or over the limit.")}
      </p>

      <BudgetDrawer
        category={editing}
        personId={personId}
        personName={personName}
        onClose={() => setEditing(null)}
      />
    </ReadingColumn>
  )
}

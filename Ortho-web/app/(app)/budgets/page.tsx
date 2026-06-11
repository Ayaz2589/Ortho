'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SPEND_CATEGORIES, CATEGORIES } from '@/lib/categories'
import type { TransactionCategory } from '@/lib/types'
import { EditBudgetModal } from '@/components/budgets/EditBudgetModal'

export default function BudgetsPage() {
  const { budgets, formatMoney } = useApp()
  const [editing, setEditing] = useState<TransactionCategory | null>(null)

  return (
    <ReadingColumn>
      <div className="pt-2">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          Settings
        </Link>
      </div>
      <PageHeader title="Budgets" />

      <div
        className="divide-y divide-hairline overflow-hidden rounded-2xl bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        {SPEND_CATEGORIES.map((cat) => {
          const meta = CATEGORIES[cat]
          const Icon = meta.icon
          const budget = budgets.find((b) => b.category === cat) ?? null
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
              <span className="text-[17px] font-medium text-text">{meta.label}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span
                  className={
                    'text-[15px] font-medium tabular-nums ' +
                    (budget ? 'text-text-2' : 'text-text-3')
                  }
                >
                  {budget ? `${formatMoney(budget.monthly_limit_cents)} /mo` : 'Not set'}
                </span>
                <ChevronRight size={16} className="text-text-3" />
              </span>
            </button>
          )
        })}
      </div>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        Budgets drive the spending insights on your dashboard. Set a monthly limit for any category
        and you&apos;ll see progress and alerts when you&apos;re close to or over the limit.
      </p>

      {editing && (
        <EditBudgetModal open={!!editing} onClose={() => setEditing(null)} category={editing} />
      )}
    </ReadingColumn>
  )
}

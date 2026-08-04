'use client'

import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import type { SinkingFund } from '@/lib/planning/planSummary'
import { PlanningSection } from './PlanningSection'

/**
 * Sinking-funds panel (spec 036 — US5). Surfaces `non_monthly` budget categories
 * and how much is currently set aside (carried forward) for each — the app uniquely
 * models these irregular expenses. non_monthly carry is signed, so a category that
 * was overspent shows a "carried shortfall" rather than a contradictory negative
 * "set aside". Renders nothing when there are no non-monthly categories.
 */
export function SinkingFundsPanel({ funds }: { funds: SinkingFund[] }) {
  const { formatMoney, t } = useApp()

  if (funds.length === 0) return null

  return (
    <div data-testid="sinking-funds">
      <PlanningSection title={t('Sinking funds')}>
        <ul className="flex flex-col gap-3">
          {funds.map((fund) => {
            const meta = categoryMeta(fund.category)
            const Icon = meta.icon
            const label =
              fund.setAsideCents < 0
                ? t('{0} carried shortfall', formatMoney(-fund.setAsideCents))
                : t('{0} set aside', formatMoney(fund.setAsideCents))
            return (
              <li key={fund.budgetId} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon size={14} style={{ color: meta.tint }} />
                  <span className="text-sm text-text">{t(meta.label)}</span>
                </span>
                <span className="text-xs tabular-nums text-text-2">{label}</span>
              </li>
            )
          })}
        </ul>
      </PlanningSection>
    </div>
  )
}

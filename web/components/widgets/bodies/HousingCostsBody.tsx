'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { housingSummary } from '@/lib/finance/housing-summary'

/**
 * Housing-costs widget body (spec 036 US1). Total monthly housing cost across every
 * property (mortgage payments + lease rents), the property count, and — only for a
 * multifamily household — the net monthly rental cashflow. Reads PROPLESS from
 * `useApp()` and derives its figures from the pure `housingSummary()` roll-up; no new
 * finance math. Housing figures are point-in-time, so this body ignores the dashboard
 * scope window (like `ActivityBody`). Cost is never shown in red — the money formatter
 * conveys sign with the minus glyph.
 */
export function HousingCostsBody() {
  const { properties, formatMoney, t } = useApp()
  const summary = useMemo(() => housingSummary(properties), [properties])

  if (summary.count === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">
          {t('No properties yet.')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <span className="text-[28px] font-light leading-none tabular-nums text-text">
        {formatMoney(summary.cost)}
      </span>
      <span className="mt-1 text-xs text-text-2">{t('per month')}</span>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-2">
            {summary.count === 1 ? t('1 property') : t('{0} properties', summary.count)}
          </span>
        </div>
        {summary.multi ? (
          <>
            <div className="h-px bg-hairline" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-2">{t('Net rental')}</span>
              <span className="text-sm tabular-nums text-text">
                {formatMoney(summary.netRental, { leadingPlus: true })}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

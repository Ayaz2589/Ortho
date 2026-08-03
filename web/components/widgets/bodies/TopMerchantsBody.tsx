'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'

/**
 * Top-merchants widget body (spec 040 — Section 5). Ports the deleted
 * `TopMerchantsCard`: expenses within the scope window grouped by merchant, the
 * top 5 by total spend, each with a visit count. Reads PROPLESS from `useApp()` +
 * `useDashboardScopeContext()`. Text rows only.
 */
export function TopMerchantsBody() {
  const { transactions, formatMoney, t } = useApp()
  const { interval } = useDashboardScopeContext()

  const entries = useMemo(() => {
    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    const map = new Map<string, { merchant: string; cents: number; count: number }>()
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      const ms = new Date(tx.date).getTime()
      if (ms < startMs || ms >= endMs) continue
      const entry = map.get(tx.merchant) ?? { merchant: tx.merchant, cents: 0, count: 0 }
      entry.cents += tx.amount_cents
      entry.count += 1
      map.set(tx.merchant, entry)
    }
    return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, 5)
  }, [transactions, interval.start, interval.end])

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">
          {t('No expenses in this period yet.')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {entries.map((entry, idx) => (
        <div key={entry.merchant}>
          {idx > 0 ? <div className="h-px bg-hairline" /> : null}
          <div className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{entry.merchant}</p>
              <p className="text-xs text-text-3">
                {entry.count === 1 ? t('1 visit') : t('{0} visits', entry.count)}
              </p>
            </div>
            <span className="text-sm tabular-nums text-text">{formatMoney(entry.cents)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import { shortDate } from '@/lib/format'

/** Most-recent transactions to show. A short live feed reads better than a
 *  windowed one (O-2), and 6 fits the `wide` tier without scrolling. */
const RECENT_LIMIT = 6

/**
 * Activity widget body (spec 041 — Section 6). A live feed of the most-recent
 * transactions household-wide — it deliberately IGNORES the scope window (O-2), so
 * it reads only `useApp()` and never the scope context. Each row: category icon +
 * merchant + owner + amount + date, newest first.
 */
export function ActivityBody() {
  const { transactions, ownersDisplay, formatMoney, t, locale } = useApp()

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, RECENT_LIMIT),
    [transactions]
  )

  if (recent.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('No transactions yet.')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {recent.map((tx, idx) => {
        const meta = categoryMeta(tx.category)
        const Icon = meta.icon
        return (
          <div key={tx.id}>
            {idx > 0 ? <div className="h-px bg-hairline" /> : null}
            <div className="flex items-center gap-3 py-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--chip-bg)' }}
              >
                <Icon size={15} style={{ color: meta.tint }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{tx.merchant}</p>
                <p className="text-xs text-text-3">{ownersDisplay(tx).label}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm tabular-nums text-text">{formatMoney(tx.amount_cents)}</span>
                <span className="text-xs tabular-nums text-text-3">
                  {shortDate(new Date(tx.date), locale)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

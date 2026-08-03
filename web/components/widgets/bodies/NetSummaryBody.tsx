'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'

/**
 * Net-summary widget body (spec 036 — Section 1). Income minus expenses over the
 * shared scope window, read PROPLESS from `useApp()` (data) +
 * `useDashboardScopeContext()` (the active window). Ports the math from the
 * deleted `MonthSummaryCard`: a single sweep summing income vs expense over
 * `[interval.start, interval.end)`; transfers (member-to-member reimbursement)
 * count as neither. Numbers-only, CSS-only (O-3 resolved — no recharts here).
 * Loss is NEVER red: a negative net keeps the neutral `--text` tint.
 */
export function NetSummaryBody() {
  const { transactions, formatMoney, t } = useApp()
  const { interval, now } = useDashboardScopeContext()

  const { income, expenses } = useMemo(() => {
    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    let inc = 0
    let exp = 0
    for (const tx of transactions) {
      const ms = new Date(tx.date).getTime()
      if (ms < startMs || ms >= endMs) continue
      if (tx.kind === 'income') inc += tx.amount_cents
      else if (tx.kind === 'expense') exp += tx.amount_cents
    }
    return { income: inc, expenses: exp }
  }, [transactions, interval.start, interval.end])

  const net = income - expenses
  const gross = income + expenses
  const incomePct = gross > 0 ? (income / gross) * 100 : 0

  // Day-of-month pace note only when the active window is a SINGLE calendar month
  // that contains `now` — i.e. the current month, reached either via the range
  // ("This month") or the month picker. It reads nonsense over a 3M/6M/1Y span.
  const monthsSpanned =
    (interval.end.getFullYear() - interval.start.getFullYear()) * 12 +
    (interval.end.getMonth() - interval.start.getMonth())
  const nowMs = now.getTime()
  const isCurrentMonthWindow =
    monthsSpanned === 1 && nowMs >= interval.start.getTime() && nowMs < interval.end.getTime()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  return (
    <div className="flex h-full flex-col">
      <span className="text-[13px] text-text-2">{t('Net')}</span>
      <span
        className="mt-0.5 truncate text-[36px] font-light leading-none tracking-[-0.6px] tabular-nums"
        style={{ color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}
      >
        {formatMoney(net)}
      </span>

      {/* Income vs expense proportion — sage income fill on the neutral track.
          Expense is the remainder; it is never drawn red (loss is never red). */}
      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--chip-bg)' }}
        aria-hidden
      >
        <div className="h-full rounded-full" style={{ width: `${incomePct}%`, background: 'var(--positive)' }} />
      </div>

      <div className="mt-3 flex gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-text-2">{t('Income')}</span>
          <span className="text-[15px] tabular-nums" style={{ color: 'var(--positive)' }}>
            {formatMoney(income)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-text-2">{t('Expenses')}</span>
          <span className="text-[15px] tabular-nums text-text">{formatMoney(expenses)}</span>
        </div>
      </div>

      {isCurrentMonthWindow ? (
        <span className="mt-auto pt-3 text-xs tabular-nums text-text-3">
          {t('Day {0} of {1}', dayOfMonth, daysInMonth)}
        </span>
      ) : null}
    </div>
  )
}

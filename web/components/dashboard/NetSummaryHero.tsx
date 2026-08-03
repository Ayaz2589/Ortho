'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { SpendHeatmap } from '@/components/dashboard/SpendHeatmap'

/**
 * Net-summary HERO (spec 036 follow-up). Income minus expenses over the shared
 * scope window, rendered as the dashboard's most prominent element — baked
 * directly into the overview, NOT a toggleable widget and NOT wrapped in a card
 * (no `ow-card` surface): the big net figure sits on the page background above the
 * widget board. Reads the same data + shared scope as everything else
 * (`useApp()` + `useDashboardScopeContext()`); transfers count as neither income
 * nor expense; loss is NEVER red (a negative net keeps the neutral `--text` tint).
 * Deliberately minimal for now — income/expense split + a proportion bar — with
 * room to extend later.
 */
export function NetSummaryHero() {
  const { transactions, formatMoney, t } = useApp()
  const { interval, now, periodLabel } = useDashboardScopeContext()

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

  // Day-of-month pace note only when the active window is a single calendar month
  // that contains `now` (this month, via the range or the month picker).
  const monthsSpanned =
    (interval.end.getFullYear() - interval.start.getFullYear()) * 12 +
    (interval.end.getMonth() - interval.start.getMonth())
  const nowMs = now.getTime()
  const isCurrentMonthWindow =
    monthsSpanned === 1 && nowMs >= interval.start.getTime() && nowMs < interval.end.getTime()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  return (
    <section aria-label={t('Net summary')} className="mb-7">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: the net figure + income/expense split. */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] uppercase tracking-[0.6px] text-text-2">{t('Net')}</span>
            <span className="text-[13px] tabular-nums text-text-3">{t(periodLabel)}</span>
          </div>

          <p
            className="mt-1 truncate text-[44px] font-light leading-none tracking-[-1px] tabular-nums sm:text-[56px]"
            style={{ color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}
          >
            {formatMoney(net)}
          </p>

          {/* Income vs expense proportion — sage income fill on a neutral track;
              expense is the remainder and is never drawn red. */}
          <div
            className="mt-5 h-2 w-full max-w-[420px] overflow-hidden rounded-full"
            style={{ background: 'var(--chip-bg)' }}
            aria-hidden
          >
            <div className="h-full rounded-full" style={{ width: `${incomePct}%`, background: 'var(--positive)' }} />
          </div>

          <div className="mt-3 flex items-baseline gap-8">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-2">{t('Income')}</span>
              <span className="text-[17px] tabular-nums" style={{ color: 'var(--positive)' }}>
                {formatMoney(income)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-2">{t('Expenses')}</span>
              <span className="text-[17px] tabular-nums text-text">{formatMoney(expenses)}</span>
            </div>
            {isCurrentMonthWindow ? (
              <div className="ml-auto self-end">
                <span className="text-xs tabular-nums text-text-3">
                  {t('Day {0} of {1}', dayOfMonth, daysInMonth)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: daily-spending heatmap for the same window. */}
        <div className="shrink-0">
          <SpendHeatmap interval={interval} />
        </div>
      </div>
    </section>
  )
}

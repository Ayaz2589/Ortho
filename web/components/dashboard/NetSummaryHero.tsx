'use client'

import { useMemo, type CSSProperties } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { SpendHeatmap } from '@/components/dashboard/SpendHeatmap'
import { personSummary } from '@/lib/finance/personSummary'

/**
 * Net-summary HERO (spec 036 follow-up). Income minus expenses over the shared
 * scope window, rendered as the dashboard's most prominent element — baked
 * directly into the overview, NOT a toggleable widget and NOT wrapped in a card
 * (no `ow-card` surface): the big net figure sits on the page background above the
 * widget board. Reads the same data + shared scope as everything else
 * (`useApp()` + `useDashboardScopeContext()`); loss is NEVER red (a negative net
 * keeps the neutral `--text` tint).
 *
 * `personId` is the dashboard's member scope, set by `MemberScopePicker` above.
 * Null is the household: transfers count as neither income nor expense, so no
 * transfers figure is shown. With a member picked, the SAME hero — figure, bar,
 * split, and heatmap — becomes theirs, via the pure `personSummary` (their income
 * share, their share of shared expenses); at that scope transfers between members
 * are real money in and out, so a net Transfers figure joins the row.
 */
export function NetSummaryHero({ personId = null }: { personId?: string | null }) {
  const { transactions, formatMoney, t } = useApp()
  const { interval, now, periodLabel } = useDashboardScopeContext()

  const { income, expenses, transfers } = useMemo(() => {
    if (personId) {
      const s = personSummary(transactions, personId, interval.start, interval.end)
      return { income: s.income, expenses: s.expenses, transfers: s.transfersReceived - s.transfersSent }
    }
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
    return { income: inc, expenses: exp, transfers: null as number | null }
  }, [personId, transactions, interval.start, interval.end])

  const net = income - expenses + (transfers ?? 0)
  // Share of this period's income that spending has consumed — the bar FILLS as
  // income is run down (expenses ÷ income), clamped at 100% and drawn in calm
  // sand, never red. With no income, a full bar iff any spend.
  const spentPct =
    income > 0 ? Math.min(100, (expenses / income) * 100) : expenses > 0 ? 100 : 0

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
            data-testid="hero-net"
            className="mt-1 truncate text-[44px] font-light leading-none tracking-[-1px] tabular-nums sm:text-[56px]"
            style={{ color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}
          >
            {formatMoney(net)}
          </p>

          {/* Spend-against-income bar — a calm sand fill grows across a neutral
              track as spending consumes the period's income; it is the remainder
              of income and is never drawn red. */}
          <div
            className="mt-5 h-2 w-full max-w-[420px] overflow-hidden rounded-full"
            style={{ background: 'var(--chip-bg)' }}
            aria-hidden
          >
            <div
              data-testid="net-spend-fill"
              className="h-full rounded-full"
              style={{ width: `${spentPct}%`, background: 'var(--accent)' }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Figure testid="hero-income" label={t('Income')} value={formatMoney(income)} color="var(--positive)" />
            <Figure testid="hero-expenses" label={t('Expenses')} value={formatMoney(expenses)} color="var(--text)" />
            {transfers !== null ? (
              <Figure
                testid="hero-transfers"
                label={t('Transfers')}
                value={formatMoney(transfers)}
                color="var(--text)"
              />
            ) : null}
            {isCurrentMonthWindow ? (
              <div className="ml-auto self-end">
                <span className="text-xs tabular-nums text-text-3">
                  {t('Day {0} of {1}', dayOfMonth, daysInMonth)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: daily-spending heatmap over the same window and the same member
            scope. The heatmap owns its own horizontal scroll (scrollbar hidden)
            and click-to-pin tooltip, so the wrapper just lets it shrink without
            clipping the tooltip. */}
        <div className="min-w-0">
          <SpendHeatmap interval={interval} personId={personId} />
        </div>
      </div>
    </section>
  )
}

function Figure({
  label,
  value,
  testid,
  color,
}: {
  label: string
  value: string
  testid: string
  color: CSSProperties['color']
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-2">{label}</span>
      <span data-testid={testid} className="text-[17px] tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

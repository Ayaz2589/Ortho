'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { savingsRate } from '@/lib/reports/savings'
import { monthBoundsInterval } from '@/lib/useDashboardRange'

// The savings-rate bar time-series stays behind next/dynamic so recharts never
// enters the dashboard initial-load chunk (spec 022; the leaf is already a
// registered charts/ leaf reached only this way).
const SavingsRateChart = dynamic(
  () => import('@/components/dashboard/charts/SavingsRateChart').then((m) => m.SavingsRateChart),
  { ssr: false, loading: () => null }
)

interface MonthBucket {
  yyyymm: string
  income: number
  expense: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Percent with tabular figures; "—" when the rate is undefined (no income); a
 *  Unicode minus for shortfalls (never red). Mirrors the old SavingsRateView. */
function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  const pct = Math.round(rate * 100)
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

/**
 * Savings-trends widget body (spec 036 follow-up — replaces the removed Reports
 * mode). The savings rate `(income − expense) / income` per calendar month across
 * the shared scope window, plus the window's overall rate as the headline. Reads
 * PROPLESS from `useApp()` + `useDashboardScopeContext()` and computes LOCALLY from
 * `transactions` (like every other widget — no server aggregate fetch), reusing the
 * pure `savingsRate` helper and the existing `SavingsRateChart` leaf. A shortfall
 * reads via sign/position — never red.
 */
/** The `YYYY-MM` calendar month immediately before the given one. */
function previousMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`
}

/** Income/expense cents for a single `YYYY-MM` from the transactions. Uses the
 *  shared UTC `monthBoundsInterval` (the same window the dashboard scope resolves
 *  a specific month to), so the comparison buckets identically to the headline. */
function monthTotals(transactions: Array<{ kind: string; amount_cents: number; date: string }>, yyyymm: string) {
  const { start, end } = monthBoundsInterval(yyyymm)
  const startMs = start.getTime()
  const endMs = end.getTime()
  let income = 0
  let expense = 0
  for (const tx of transactions) {
    const ms = new Date(tx.date).getTime()
    if (ms < startMs || ms >= endMs) continue
    if (tx.kind === 'income') income += tx.amount_cents
    else if (tx.kind === 'expense') expense += tx.amount_cents
  }
  return { income, expense }
}

export function SavingsTrendsBody() {
  const { transactions, t, locale } = useApp()
  const { interval, isSpecificMonth, selectedMonth, availableMonths } = useDashboardScopeContext()

  const buckets = useMemo<MonthBucket[]>(() => {
    // Enumerate the calendar months the window spans, in order.
    const order: string[] = []
    const index = new Map<string, MonthBucket>()
    let cursor = new Date(interval.start.getFullYear(), interval.start.getMonth(), 1)
    while (cursor.getTime() < interval.end.getTime()) {
      const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
      const b: MonthBucket = { yyyymm: key, income: 0, expense: 0 }
      order.push(key)
      index.set(key, b)
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    for (const tx of transactions) {
      const d = new Date(tx.date)
      const ms = d.getTime()
      if (ms < startMs || ms >= endMs) continue
      const b = index.get(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
      if (!b) continue
      if (tx.kind === 'income') b.income += tx.amount_cents
      else if (tx.kind === 'expense') b.expense += tx.amount_cents
    }
    return order.map((k) => index.get(k)!)
  }, [transactions, interval.start, interval.end])

  const totals = buckets.reduce(
    (acc, b) => ({ income: acc.income + b.income, expense: acc.expense + b.expense }),
    { income: 0, expense: 0 }
  )
  const hasActivity = totals.income > 0 || totals.expense > 0
  const overallRate = savingsRate(totals.income, totals.expense)

  const monthShort = (yyyymm: string) => {
    const [y, m] = yyyymm.split('-').map(Number)
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1))
  }
  const chartData = buckets.map((b) => {
    const r = savingsRate(b.income, b.expense)
    return { label: monthShort(b.yyyymm), rate: r === null ? 0 : Math.round(r * 100) }
  })

  // Single-month view (spec 043 US3): show the previous calendar month's rate as
  // a comparison. When that month has no data (e.g. the earliest month), show a
  // calm "no comparison" note rather than a misleading 0%.
  const comparison = (() => {
    if (!isSpecificMonth || !selectedMonth) return null
    const prev = previousMonth(selectedMonth)
    if (!availableMonths?.includes(prev)) return { available: false as const }
    const pt = monthTotals(transactions, prev)
    return { available: true as const, rate: savingsRate(pt.income, pt.expense) }
  })()

  if (!hasActivity) {
    return (
      <div className="flex h-full flex-col">
        <span className="text-xs text-text-2">{t('Savings rate')}</span>
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('Not enough data yet.')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <span className="text-xs text-text-2">{t('Savings rate')}</span>
      <span
        className="mt-0.5 text-[28px] font-light leading-none tabular-nums"
        style={{ color: overallRate !== null && overallRate < 0 ? 'var(--text)' : 'var(--positive)' }}
      >
        {formatRate(overallRate)}
      </span>

      {comparison ? (
        <p className="mt-1 text-xs text-text-3" data-testid="savings-comparison">
          {comparison.available ? t('Last month {0}', formatRate(comparison.rate)) : t('No comparison yet')}
        </p>
      ) : null}

      {/* Per-month rate bars grow to fill the remaining height of the tier. */}
      <div className="mt-4 min-h-0 flex-1">
        <SavingsRateChart data={chartData} />
      </div>
    </div>
  )
}

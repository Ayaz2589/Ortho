'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { savingsRate } from '@/lib/reports/savings'
import { usePanelCaption } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelRow } from '@/components/widgets/panels/kit'

interface MonthBucket {
  yyyymm: string
  income: number
  expense: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Percent with a Unicode minus for shortfalls, never colour. Mirrors the
 *  card's own `formatRate` (SavingsTrendsBody) — not exported, so the shape
 *  is duplicated rather than reused across a file this panel must not touch. */
function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  const pct = Math.round(rate * 100)
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

/**
 * Savings-trends detail panel (spec 057, US5). Answers what the card's single
 * rate cannot: the income and expense terms behind it, month by month, plus
 * the amount actually saved, and which months in the window ran strongest
 * and weakest.
 *
 * Honours BOTH scope axes. Re-derives the same per-month income/expense
 * buckets `SavingsTrendsBody` already computes and discards down to a rate —
 * that file is off-limits to this sandbox, so the shape is mirrored rather
 * than imported. A shortfall (a month with more expense than income) reads
 * through its sign and its position in the list, never through colour
 * (FR-021); a single-month window shows that month plainly, with no
 * best/worst flag that would imply a trend across one data point.
 */
export function SavingsTrendsPanel() {
  const { transactions: allTransactions, formatMoney, t, locale, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, periodLabel } = useDashboardScopeContext()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: periodLabel })

  const buckets = useMemo<MonthBucket[]>(() => {
    const order: string[] = []
    const index = new Map<string, MonthBucket>()
    let cursor = new Date(interval.start.getFullYear(), interval.start.getMonth(), 1)
    while (cursor.getTime() < interval.end.getTime()) {
      const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
      const bucket: MonthBucket = { yyyymm: key, income: 0, expense: 0 }
      order.push(key)
      index.set(key, bucket)
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    const startMs = interval.start.getTime()
    const endMs = interval.end.getTime()
    for (const t of transactions) {
      const d = new Date(t.date)
      const ms = d.getTime()
      if (ms < startMs || ms >= endMs) continue
      const bucket = index.get(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
      if (!bucket) continue
      if (t.kind === 'income') bucket.income += t.amount_cents
      else if (t.kind === 'expense') bucket.expense += t.amount_cents
    }
    return order.map((key) => index.get(key)!)
  }, [transactions, interval.start, interval.end])

  const hasActivity = buckets.some((b) => b.income > 0 || b.expense > 0)

  // Best/worst are only meaningful with more than one month to compare, and
  // only among months with a defined rate (income > 0) — a single month, or
  // a window where every month is tied, shows no flag at all (US5 AC3).
  const { bestKey, worstKey } = useMemo(() => {
    if (buckets.length < 2) return { bestKey: null as string | null, worstKey: null as string | null }
    let best: MonthBucket | null = null
    let worst: MonthBucket | null = null
    let bestRate = -Infinity
    let worstRate = Infinity
    for (const b of buckets) {
      const rate = savingsRate(b.income, b.expense)
      if (rate === null) continue
      if (rate > bestRate) {
        bestRate = rate
        best = b
      }
      if (rate < worstRate) {
        worstRate = rate
        worst = b
      }
    }
    if (!best || !worst || best.yyyymm === worst.yyyymm) {
      return { bestKey: null as string | null, worstKey: null as string | null }
    }
    return { bestKey: best.yyyymm, worstKey: worst.yyyymm }
  }, [buckets])

  if (!hasActivity) {
    return <PanelEmpty>{t('Not enough data yet.')}</PanelEmpty>
  }

  const monthLabel = (yyyymm: string) => {
    const [y, m] = yyyymm.split('-').map(Number)
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {buckets.map((b) => {
        const rate = savingsRate(b.income, b.expense)
        const saved = b.income - b.expense
        const flag = b.yyyymm === bestKey ? t('Best month') : b.yyyymm === worstKey ? t('Lowest month') : null
        return (
          <div key={b.yyyymm} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-text">{monthLabel(b.yyyymm)}</span>
              <span className="text-xs tabular-nums text-text-2">{formatRate(rate)}</span>
            </div>
            {flag ? <span className="text-xs text-text-3">{flag}</span> : null}
            <PanelRow label={t('Income')} value={formatMoney(b.income)} />
            <PanelRow label={t('Expenses')} value={formatMoney(b.expense)} />
            <PanelRow
              label={t('Amount saved')}
              value={formatMoney(saved)}
              labelClassName="text-text"
              valueClassName="tabular-nums text-text"
            />
          </div>
        )
      })}
    </div>
  )
}

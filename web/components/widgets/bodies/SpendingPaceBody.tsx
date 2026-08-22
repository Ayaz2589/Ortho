'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { startOfDay } from '@/lib/format'

// recharts stays behind next/dynamic (ssr:false) so it loads on demand and never
// enters the dashboard's initial-load chunk (spec 022; no-eager-recharts guard).
const SpendingPaceChart = dynamic(
  () => import('@/components/widgets/charts/SpendingPaceChart').then((m) => m.SpendingPaceChart),
  { ssr: false, loading: () => null }
)

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Spending-pace widget body (spec 037 — Section 2). Ports the deleted
 * `DailySpendTrendCard`: a 60-day daily-expense buckets series, split into the
 * trailing 30 vs the prior 30. Reads PROPLESS from `useApp()` +
 * `useDashboardScopeContext()`; the trailing window is anchored at the END of the
 * active scope window (clamped to `now`) so a selected past month shows that
 * month's pace, while the live view tracks today. Avg/day + delta vs the prior 30;
 * a spending DROP is sage `--positive` — never red.
 */
export function SpendingPaceBody() {
  const { transactions, formatMoney, t } = useApp()
  const { interval, now } = useDashboardScopeContext()

  // Anchor the trailing 30 at the last day of the window, but never in the future.
  const anchorMs = Math.min(interval.end.getTime() - 1, now.getTime())

  const allDays = useMemo(() => {
    const days = new Array<number>(60).fill(0)
    const anchorStart = startOfDay(new Date(anchorMs)).getTime()
    const oldest = anchorStart - 59 * DAY_MS
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      const d = startOfDay(new Date(tx.date)).getTime()
      if (d < oldest || d > anchorStart) continue
      const idx = Math.round((d - oldest) / DAY_MS)
      if (idx >= 0 && idx < 60) days[idx] += tx.amount_cents
    }
    return days
  }, [transactions, anchorMs])

  const recent = allDays.slice(30)
  const prior = allDays.slice(0, 30)
  const recentTotal = recent.reduce((s, v) => s + v, 0)
  const priorTotal = prior.reduce((s, v) => s + v, 0)
  const avgPerDay = Math.round(recentTotal / 30)
  const trendDelta = priorTotal > 0 ? (recentTotal - priorTotal) / priorTotal : null
  const allZero = recent.every((v) => v === 0)

  const chartData = recent.map((cents, i) => ({ i, v: cents / 100 }))

  if (allZero) {
    return (
      <div className="flex h-full flex-col">
        <span className="text-xs text-text-2">{t('Last 30 days')}</span>
        <p className="flex flex-1 items-center text-[13px] text-text-3">
          {t('No expenses in the last 30 days.')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-2">{t('Daily trend')}</span>
        <span className="text-xs text-text-3">{t('Last 30 days')}</span>
      </div>

      {/* The area grows to fill the remaining height of the tier. */}
      <div className="my-3 min-h-0 flex-1">
        <SpendingPaceChart data={chartData} />
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-text-2">{t('Avg / day')}</span>
          <span className="text-[17px] tabular-nums text-text">{formatMoney(avgPerDay)}</span>
        </div>
        {trendDelta != null ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs text-text-2">{t('vs. prior 30')}</span>
            <span
              className="text-[17px] tabular-nums"
              style={{ color: trendDelta >= 0 ? 'var(--text-2)' : 'var(--positive)' }}
            >
              {deltaString(trendDelta)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Signed percent delta with a typographic minus; never negative-as-red. */
function deltaString(delta: number): string {
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${Math.round(Math.abs(delta) * 100)}%`
}

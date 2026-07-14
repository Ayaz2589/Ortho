'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { startOfDay } from '@/lib/format'

// Deferred so recharts leaves the Dashboard initial-load bundle (spec 022, US1).
// The Avg/day + trend readouts stay eager; the sparkline streams in. The wrapping
// `h-20` div reserves its height → no layout shift.
const DailyTrendChart = dynamic(
  () => import('./charts/DailyTrendChart').then((m) => m.DailyTrendChart),
  { ssr: false, loading: () => null }
)

/**
 * 30-day sparkline of daily expense totals, plus an average-per-day
 * readout and a delta vs the prior 30 days. Always trailing 30 days —
 * ignores the dashboard range.
 */
export function DailySpendTrendCard({ now }: { now: Date }) {
  const { transactions, formatMoney, t } = useApp()

  // 60 days of daily expense cents, index 0 oldest .. 59 = today.
  const allDays = useMemo(() => {
    const days = new Array<number>(60).fill(0)
    const todayStart = startOfDay(now).getTime()
    const DAY = 24 * 60 * 60 * 1000
    const oldest = todayStart - 59 * DAY
    for (const t of transactions) {
      if (t.kind !== 'expense') continue
      const d = startOfDay(new Date(t.date)).getTime()
      if (d < oldest || d > todayStart) continue
      const idx = Math.round((d - oldest) / DAY)
      if (idx >= 0 && idx < 60) days[idx] += t.amount_cents
    }
    return days
  }, [transactions, now])

  const recent = allDays.slice(30)
  const prior = allDays.slice(0, 30)

  const recentTotal = recent.reduce((s, v) => s + v, 0)
  const priorTotal = prior.reduce((s, v) => s + v, 0)
  const avgPerDay = Math.round(recentTotal / 30)
  const trendDelta = priorTotal > 0 ? (recentTotal - priorTotal) / priorTotal : null

  const allZero = recent.every((v) => v === 0)

  const chartData = recent.map((cents, i) => ({ i, v: cents / 100 }))

  return (
    <Card className="p-5">
      <SectionLabel right={t('Last 30 days')}>{t('Daily trend')}</SectionLabel>

      {allZero ? (
        <p className="py-5 text-[13px] text-text-3">{t('No expenses in the last 30 days.')}</p>
      ) : (
        <>
          <div className="mt-3 h-20 w-full">
            <DailyTrendChart data={chartData} />
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <Readout label={t('Avg / day')} value={formatMoney(avgPerDay)} />
            {trendDelta != null && (
              <Readout
                label={t('vs. prior 30')}
                value={deltaString(trendDelta)}
                tint={trendDelta >= 0 ? 'var(--text-2)' : 'var(--positive)'}
              />
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function deltaString(delta: number): string {
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${Math.round(Math.abs(delta) * 100)}%`
}

function Readout({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-2">{label}</span>
      <span
        className="text-[17px] font-normal tabular-nums"
        style={{ color: tint ?? 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  )
}

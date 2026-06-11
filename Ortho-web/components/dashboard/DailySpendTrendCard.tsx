'use client'

import { useMemo } from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { startOfDay } from '@/lib/format'

/**
 * 30-day sparkline of daily expense totals, plus an average-per-day
 * readout and a delta vs the prior 30 days. Always trailing 30 days —
 * ignores the dashboard range.
 */
export function DailySpendTrendCard({ now }: { now: Date }) {
  const { transactions, formatMoney } = useApp()

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
      <SectionLabel right="Last 30 days">Daily trend</SectionLabel>

      {allZero ? (
        <p className="py-5 text-[13px] text-text-3">No expenses in the last 30 days.</p>
      ) : (
        <>
          <div className="mt-3 h-20 w-full">
            <ResponsiveContainer width="100%" height={80} minWidth={0}>
              <AreaChart data={chartData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="var(--positive)"
                  strokeWidth={1.6}
                  fill="var(--positive)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <Readout label="Avg / day" value={formatMoney(avgPerDay)} />
            {trendDelta != null && (
              <Readout
                label="vs. prior 30"
                value={deltaString(trendDelta)}
                tint={trendDelta >= 0 ? 'var(--destructive)' : 'var(--positive)'}
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
        className="text-[17px] font-semibold tabular-nums"
        style={{ color: tint ?? 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  )
}

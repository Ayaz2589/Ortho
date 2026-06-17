'use client'

import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { longLabel, type DashboardRange, type Interval } from './range'

/**
 * Hero card. Net income (income − expenses) over the selected range, with
 * income (positive tint) and expenses sub-columns. For `thisMonth` a thin
 * progress capsule shows days-into-month elapsed.
 */
export function MonthSummaryCard({
  range,
  interval,
  now,
  label,
  isSpecificMonth = false,
}: {
  range: DashboardRange
  interval: Interval
  now: Date
  /** Period label override (e.g. "June 2026" when a month is selected). */
  label?: string
  /** True when a specific month is selected — suppresses the this-month capsule. */
  isSpecificMonth?: boolean
}) {
  const { transactions, formatMoney, locale } = useApp()
  const isThisMonth = range === 'thisMonth' && !isSpecificMonth

  const inRange = (date: string) => {
    const t = new Date(date).getTime()
    return t >= interval.start.getTime() && t < interval.end.getTime()
  }

  let income = 0
  let expenses = 0
  for (const t of transactions) {
    if (!inRange(t.date)) continue
    if (t.kind === 'income') income += t.amount_cents
    else expenses += t.amount_cents
  }
  const net = income - expenses

  const sign = net > 0 ? '+' : net < 0 ? '−' : ''
  const netDisplay = `${sign}${formatMoney(Math.abs(net))}`

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const monthProgress = dayOfMonth / daysInMonth

  let rightCaption: string
  if (isThisMonth) {
    rightCaption = `Day ${dayOfMonth} of ${daysInMonth}`
  } else {
    const endDate = new Date(interval.end.getTime() - 1)
    rightCaption = `${shortDate(interval.start, locale)} – ${shortDate(endDate, locale)}`
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
            {label ?? longLabel(range)}
          </span>
          <span className="text-xs text-text-3 tabular-nums">{rightCaption}</span>
        </div>

        <div
          className="truncate text-[36px] font-light tracking-[-0.6px] tabular-nums"
          style={{ color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}
        >
          {netDisplay}
        </div>

        <div className="mt-0.5 flex gap-4">
          <StatColumn label="Income" amount={formatMoney(income)} tint="var(--positive)" />
          <StatColumn label="Expenses" amount={formatMoney(expenses)} tint="var(--text)" />
        </div>

        {isThisMonth && (
          <div
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(0,0,0,0.05)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, monthProgress * 100)}%`,
                background: 'color-mix(in srgb, var(--text) 20%, transparent)',
              }}
            />
          </div>
        )}
      </div>
    </Card>
  )
}

function StatColumn({
  label,
  amount,
  tint,
}: {
  label: string
  amount: string
  tint: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-2">{label}</span>
      <span className="text-[15px] font-normal tabular-nums" style={{ color: tint }}>
        {amount}
      </span>
    </div>
  )
}

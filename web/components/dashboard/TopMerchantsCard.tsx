'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { longLabel, type DashboardRange, type Interval } from './range'

export function TopMerchantsCard({
  range,
  interval,
}: {
  range: DashboardRange
  interval: Interval
}) {
  const { transactions, formatMoney } = useApp()

  const entries = useMemo(() => {
    const inRange = (date: string) => {
      const t = new Date(date).getTime()
      return t >= interval.start.getTime() && t < interval.end.getTime()
    }
    const map = new Map<string, { merchant: string; cents: number; count: number }>()
    for (const t of transactions) {
      if (t.kind !== 'expense' || !inRange(t.date)) continue
      const entry = map.get(t.merchant) ?? { merchant: t.merchant, cents: 0, count: 0 }
      entry.cents += t.amount_cents
      entry.count += 1
      map.set(t.merchant, entry)
    }
    return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, 5)
  }, [transactions, interval.start, interval.end])

  return (
    <Card className="p-5">
      <SectionLabel right={longLabel(range)}>Top merchants</SectionLabel>

      {entries.length === 0 ? (
        <p className="py-2 text-[13px] text-text-3">No expenses in this period yet.</p>
      ) : (
        <div className="mt-2 flex flex-col">
          {entries.map((entry, idx) => (
            <div key={entry.merchant}>
              {idx > 0 && <div className="h-px bg-hairline" />}
              <div className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-normal text-text">
                    {entry.merchant}
                  </p>
                  <p className="text-xs text-text-3">
                    {entry.count} {entry.count === 1 ? 'visit' : 'visits'}
                  </p>
                </div>
                <span className="text-[15px] font-normal tabular-nums text-text">
                  {formatMoney(entry.cents)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

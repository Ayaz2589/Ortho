'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { useReportsData } from '@/lib/useReportsData'
import { RangePicker } from './RangePicker'
import { SavingsRateView } from './SavingsRateView'
import { CategoryDeepDiveView } from './CategoryDeepDiveView'
import {
  availableRanges,
  rangeInterval,
  type DashboardRange,
} from './range'

/**
 * The Reports surface (spec 027), rendered in place when the Dashboard mode is
 * "Reports". Has its OWN relative date-range scope (This month / 3M / 6M / 1Y) —
 * independent of the Overview's month picker — resolved to a month-aligned window
 * via `rangeInterval` (local first-of-month, so `monthsInInterval` labels never
 * drift across timezones). Fetches on demand via `useReportsData` and renders the
 * calm report views. Width is capped/centered per the responsive contract.
 */
export function ReportsView() {
  const { transactions, currentHousehold, t } = useApp()
  const now = useMemo(() => new Date(), [])
  const [range, setRange] = useState<DashboardRange>('thisMonth')

  const rangeOptions = useMemo(() => availableRanges(transactions, now), [transactions, now])
  const activeRange: DashboardRange = rangeOptions.includes(range) ? range : rangeOptions[0] ?? 'thisMonth'
  const interval = useMemo(() => rangeInterval(activeRange, now), [activeRange, now])

  const data = useReportsData(currentHousehold?.id ?? '', interval)

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="flex flex-col gap-4">
        {rangeOptions.length > 1 && (
          <RangePicker options={rangeOptions} value={activeRange} onChange={setRange} />
        )}
        <SavingsRateView status={data.status} rows={data.savings} onRetry={data.retry} />
        <CategoryDeepDiveView
          status={data.status}
          categories={data.categories}
          onRetry={data.retry}
        />
      </div>
    </div>
  )
}

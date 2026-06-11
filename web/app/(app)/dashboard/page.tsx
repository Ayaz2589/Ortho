'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { useIsExpanded } from '@/lib/useMediaQuery'
import {
  DASHBOARD_RANGES,
  availableRanges,
  rangeInterval,
  type DashboardRange,
} from '@/components/dashboard/range'
import { RangePicker } from '@/components/dashboard/RangePicker'
import { MonthSummaryCard } from '@/components/dashboard/MonthSummaryCard'
import { InsightsCardStack } from '@/components/dashboard/InsightsCardStack'
import { BudgetProgressCard } from '@/components/dashboard/BudgetProgressCard'
import { SpendByCategoryCard } from '@/components/dashboard/SpendByCategoryCard'
import { PerOwnerBreakdownCard } from '@/components/dashboard/PerOwnerBreakdownCard'
import { TopMerchantsCard } from '@/components/dashboard/TopMerchantsCard'
import { HousingSnapshotCard } from '@/components/dashboard/HousingSnapshotCard'
import { DailySpendTrendCard } from '@/components/dashboard/DailySpendTrendCard'
import { DashboardDesktop } from '@/components/web/DashboardDesktop'

export default function DashboardPage() {
  const isExpanded = useIsExpanded()
  const { transactions } = useApp()
  const now = useMemo(() => new Date(), [])

  const ranges = useMemo(() => availableRanges(transactions, now), [transactions, now])
  const [range, setRange] = useState<DashboardRange>('thisMonth')
  const activeRange: DashboardRange = ranges.includes(range) ? range : ranges[0] ?? 'thisMonth'
  const interval = useMemo(() => rangeInterval(activeRange, now), [activeRange, now])
  const options = DASHBOARD_RANGES.filter((r) => ranges.includes(r))

  // Desktop (≥1024px): the 12-column grid composition.
  if (isExpanded) return <DashboardDesktop />

  // Mobile / medium: single-column stack.
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader title="Dashboard" />
      <div className="flex flex-col gap-4">
        {options.length > 1 && (
          <RangePicker options={options} value={activeRange} onChange={setRange} />
        )}
        <MonthSummaryCard range={activeRange} interval={interval} now={now} />
        <InsightsCardStack />
        <BudgetProgressCard />
        <SpendByCategoryCard range={activeRange} interval={interval} />
        <PerOwnerBreakdownCard range={activeRange} interval={interval} />
        <TopMerchantsCard range={activeRange} interval={interval} />
        <HousingSnapshotCard />
        <DailySpendTrendCard now={now} />
      </div>
    </div>
  )
}

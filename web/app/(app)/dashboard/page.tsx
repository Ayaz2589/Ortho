'use client'

import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { useDashboardScope } from '@/lib/useDashboardRange'
import { RangePicker } from '@/components/dashboard/RangePicker'
import { MonthPicker } from '@/components/dashboard/MonthPicker'
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
  const { t } = useApp()
  const isExpanded = useIsExpanded()
  // One scope source for the whole dashboard — lifted here so the mobile and
  // desktop layouts share the same relative range AND the same (transient)
  // selected month, and a resize across the breakpoint preserves the selection.
  const scope = useDashboardScope()

  // Desktop (≥1024px): the 12-column grid composition.
  if (isExpanded) return <DashboardDesktop scope={scope} />

  // Mobile / medium: single-column stack.
  const monthLabel = scope.isSpecificMonth ? scope.periodLabel : undefined
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader title={t('Dashboard')} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {scope.rangeOptions.length > 1 && (
            <RangePicker options={scope.rangeOptions} value={scope.range} onChange={scope.setRange} />
          )}
          <MonthPicker
            availableMonths={scope.availableMonths}
            selectedMonth={scope.selectedMonth}
            onSelectMonth={scope.setMonth}
            onClear={scope.clearMonth}
          />
        </div>
        <MonthSummaryCard
          range={scope.range}
          interval={scope.interval}
          now={scope.now}
          label={monthLabel}
          isSpecificMonth={scope.isSpecificMonth}
        />
        <InsightsCardStack now={scope.referenceDate} />
        <BudgetProgressCard
          interval={scope.isSpecificMonth ? scope.interval : undefined}
          label={monthLabel}
        />
        <SpendByCategoryCard range={scope.range} interval={scope.interval} label={monthLabel} />
        <PerOwnerBreakdownCard range={scope.range} interval={scope.interval} label={monthLabel} />
        <TopMerchantsCard range={scope.range} interval={scope.interval} label={monthLabel} />
        <HousingSnapshotCard />
        <DailySpendTrendCard now={scope.now} />
      </div>
    </div>
  )
}

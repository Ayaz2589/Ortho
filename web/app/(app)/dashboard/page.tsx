'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { HouseholdBalancesWidget } from '@/components/web/HouseholdBalancesWidget'
import type { TransferPrefill } from '@/components/web/TxForm'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { useDashboardScope } from '@/lib/useDashboardRange'
import { useSettleThreshold } from '@/lib/useSettleThreshold'
import { ModeSwitch, type DashboardMode } from '@/components/dashboard/ModeSwitch'
import { ReportsView } from '@/components/dashboard/ReportsView'
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

// Deferred so a mobile/iOS session never downloads the desktop composition
// (spec 022, US3). The synchronous useIsExpanded() gate below still selects the
// branch before paint (no wrong-layout flash); the desktop chunk loads only when
// isExpanded is true.
const DashboardDesktop = dynamic(
  () => import('@/components/web/DashboardDesktop').then((m) => m.DashboardDesktop),
  { ssr: false, loading: () => null }
)

export default function DashboardPage() {
  const router = useRouter()
  const { t, currentHousehold } = useApp()
  const isExpanded = useIsExpanded()

  function openSettle(prefill: TransferPrefill) {
    const q = new URLSearchParams({ from: prefill.from, to: prefill.to, amount: String(prefill.amountCents) })
    router.push(`/transactions/new?${q.toString()}`)
  }
  // One scope source for the whole dashboard — lifted here so the mobile and
  // desktop layouts share the same relative range AND the same (transient)
  // selected month, and a resize across the breakpoint preserves the selection.
  const scope = useDashboardScope()
  const [settleThresholdCents] = useSettleThreshold(currentHousehold?.id ?? '')
  // Reports is a MODE within Dashboard (spec 027), not a new route/destination —
  // the four destinations are preserved. State lives here so it survives
  // Overview↔Reports toggles while the page stays mounted.
  const [mode, setMode] = useState<DashboardMode>('overview')
  const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />

  // Reports mode: the calm reports surface in place of the overview content
  // (shared by mobile and desktop; ReportsView caps/centres its own width).
  if (mode === 'reports') {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <PageHeader title={t('Dashboard')} />
        <div className="mb-4">{modeSwitch}</div>
        <ReportsView />
      </div>
    )
  }

  // Desktop (≥1024px): the 12-column grid composition.
  if (isExpanded) return <DashboardDesktop scope={scope} modeSwitch={modeSwitch} onSettle={openSettle} settleThresholdCents={settleThresholdCents} />

  // Mobile / medium: single-column stack.
  const monthLabel = scope.isSpecificMonth ? scope.periodLabel : undefined
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader title={t('Dashboard')} />
      <div className="mb-4">{modeSwitch}</div>
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
        <HouseholdBalancesWidget onSettle={openSettle} settleThresholdCents={settleThresholdCents} />
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

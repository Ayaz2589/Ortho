'use client'

import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { MonthPicker } from '@/components/dashboard/MonthPicker'
import { RangePicker } from '@/components/dashboard/RangePicker'
import { NetSummaryHero } from '@/components/dashboard/NetSummaryHero'
import {
  DashboardScopeProvider,
  useDashboardScopeContext,
} from '@/lib/widgets/DashboardScopeContext'

/**
 * The overview's shared time-scope bar (spec 035). Renders the relative-range
 * segmented control and the specific-month picker (mutually exclusive — choosing a
 * month overrides the range, "Latest" returns to it) plus the active period
 * caption. It reads the SINGLE shared scope from context, so the net-summary hero
 * and every widget below reflect the same window.
 */
function DashboardScopeBar() {
  const { t } = useApp()
  const scope = useDashboardScopeContext()
  return (
    <div className="mb-4 mx-auto flex max-w-[1080px] flex-wrap items-center gap-2">
      <RangePicker options={scope.rangeOptions} value={scope.range} onChange={scope.setRange} />
      <MonthPicker
        availableMonths={scope.availableMonths}
        selectedMonth={scope.selectedMonth}
        onSelectMonth={scope.setMonth}
        onClear={scope.clearMonth}
      />
      <p className="ml-auto text-[13px] tabular-nums text-text-2">{t(scope.periodLabel)}</p>
    </div>
  )
}

/**
 * Dashboard.
 *
 * The overview is a single responsive composition (spec 034): the shared
 * time-scope bar, the baked-in **net-summary hero** (`NetSummaryHero` — the most
 * prominent element, always shown, not a toggleable widget), and the
 * `WidgetBoard` below. All three read one shared period via `DashboardScopeProvider`
 * so the whole dashboard reflects the same window; which widgets appear is a
 * per-browser preference toggled in Settings → Widgets.
 *
 * The former Reports MODE (spec 027) is gone — its savings-rate view now lives on
 * the board as the `savings-trends` widget (spec 036 follow-up), so the Dashboard
 * is a single view with no Overview/Reports toggle.
 */
export default function DashboardPage() {
  const { t } = useApp()
  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <PageHeader title={t('Dashboard')} />
      <DashboardScopeProvider>
        <DashboardScopeBar />
        <NetSummaryHero />
        <WidgetBoard />
      </DashboardScopeProvider>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { ModeSwitch, type DashboardMode } from '@/components/dashboard/ModeSwitch'
import { ReportsView } from '@/components/dashboard/ReportsView'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { MonthPicker } from '@/components/dashboard/MonthPicker'
import { RangePicker } from '@/components/dashboard/RangePicker'
import {
  DashboardScopeProvider,
  useDashboardScopeContext,
} from '@/lib/widgets/DashboardScopeContext'

/**
 * The overview's shared time-scope bar (spec 035 — Section 0). Renders the
 * relative-range segmented control and the specific-month picker (mutually
 * exclusive — choosing a month overrides the range, "Latest" returns to it) plus
 * the active period caption. It reads the SINGLE shared scope from context, so the
 * board and every widget below reflect the same window. Lives inside the provider
 * (overview only); Reports mode never renders it.
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
 * Overview is a WIDGET BOARD (spec 034): a single responsive composition —
 * <WidgetBoard/> reflows from a phone column to a desktop grid on its own, so
 * there is no separate desktop layout file and no wrong-layout flash. Spec 035
 * wraps it in a <DashboardScopeProvider> and adds the shared time-scope bar so the
 * whole board reads one period; which widgets appear is a per-browser preference
 * toggled in Settings → Widgets.
 *
 * Reports remains a MODE within Dashboard (spec 027), not a new route — the four
 * destinations are preserved. Mode state lives here so it survives
 * Overview↔Reports toggles while the page stays mounted. Reports mode is untouched
 * by the scope work (no scope bar, no provider).
 */
export default function DashboardPage() {
  const { t } = useApp()
  const [mode, setMode] = useState<DashboardMode>('overview')
  const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />

  if (mode === 'reports') {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <PageHeader title={t('Dashboard')} />
        <div className="mb-4">{modeSwitch}</div>
        <ReportsView />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <PageHeader title={t('Dashboard')} />
      <div className="mb-4 mx-auto max-w-[1080px]">{modeSwitch}</div>
      <DashboardScopeProvider>
        <DashboardScopeBar />
        <WidgetBoard />
      </DashboardScopeProvider>
    </div>
  )
}

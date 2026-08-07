'use client'

import { useApp } from '@/lib/store'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { MonthPicker } from '@/components/dashboard/MonthPicker'
import { RangePicker } from '@/components/dashboard/RangePicker'
import { NetSummaryHero } from '@/components/dashboard/NetSummaryHero'
import { MemberSummary } from '@/components/dashboard/MemberSummary'
import {
  DashboardScopeProvider,
  useDashboardScopeContext,
} from '@/lib/widgets/DashboardScopeContext'

/**
 * The overview header (spec 035; dashboard polish). The "Dashboard" title and the
 * shared time-scope controls (relative-range segmented control + specific-month
 * picker — mutually exclusive, "Latest" returns to the range) share ONE row on
 * desktop, controls right-aligned. On phones the controls drop to their own line
 * below the title but stay on a single line together (`shrink-0`, no wrap). The
 * controls read the SINGLE shared scope from context, so the hero and every widget
 * below reflect the same window; the active period caption lives on the hero, so
 * the header carries no duplicate.
 */
function DashboardHeader() {
  const { t } = useApp()
  const scope = useDashboardScopeContext()
  return (
    <div className="mb-4 flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-[32px] font-light tracking-[-0.6px] text-text">{t('Dashboard')}</h1>
      {/* On a narrow phone the range picker + month picker together exceed the
          viewport, so they wrap onto separate lines (the month picker drops below
          the range control) instead of forcing horizontal overflow. Desktop keeps
          them on one right-aligned line (sm:flex-nowrap + sm:shrink-0). */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0">
        <RangePicker options={scope.rangeOptions} value={scope.range} onChange={scope.setRange} />
        <MonthPicker
          availableMonths={scope.availableMonths}
          selectedMonth={scope.selectedMonth}
          onSelectMonth={scope.setMonth}
          onClear={scope.clearMonth}
        />
      </div>
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
  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <DashboardScopeProvider>
        <DashboardHeader />
        <NetSummaryHero />
        <MemberSummary />
        <WidgetBoard />
      </DashboardScopeProvider>
    </div>
  )
}

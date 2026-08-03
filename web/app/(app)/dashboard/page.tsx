'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useApp } from '@/lib/store'
import { ModeSwitch, type DashboardMode } from '@/components/dashboard/ModeSwitch'
import { ReportsView } from '@/components/dashboard/ReportsView'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'

/**
 * Dashboard.
 *
 * Overview is a WIDGET BOARD (spec 034): a single responsive composition —
 * <WidgetBoard/> reflows from a phone column to a desktop grid on its own, so
 * there is no separate desktop layout file and no wrong-layout flash. Which
 * widgets appear is a per-browser preference toggled in Settings → Widgets.
 *
 * Reports remains a MODE within Dashboard (spec 027), not a new route — the four
 * destinations are preserved. Mode state lives here so it survives
 * Overview↔Reports toggles while the page stays mounted.
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
      <WidgetBoard />
    </div>
  )
}

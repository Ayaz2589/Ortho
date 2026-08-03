'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import { useWidgetPrefs } from '@/lib/widgets/useWidgetPrefs'
import type { WidgetDefinition } from '@/lib/widgets/registry'
import { Widget } from './Widget'
import { WidgetEmptyState } from './WidgetEmptyState'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'

/**
 * The Dashboard's widget board (spec 034; spec 037 makes it a uniform grid + opens
 * a detail panel on click). ONE composition for every width — responsiveness is
 * pure CSS (`.ow-board` steps its column count by breakpoint). Every widget is the
 * same height (uniform `grid-auto-rows`), so the enabled subset always tiles
 * cleanly with no interior holes for any toggled combination. Renders only the
 * enabled widgets, in registry order; a calm empty state when none are enabled.
 *
 * Clicking any widget opens the shared right-side `Drawer` with that widget's
 * title; the panel is intentionally empty for now (spec 037) — a placeholder for
 * the future drill-down — with the standard close button.
 */
export function WidgetBoard() {
  const { t } = useApp()
  const { enabled } = useWidgetPrefs()
  const [openWidget, setOpenWidget] = useState<WidgetDefinition | null>(null)

  if (enabled.length === 0) {
    return <WidgetEmptyState />
  }

  const close = () => setOpenWidget(null)

  return (
    <>
      <div className="ow-board" role="list" aria-label={t('Dashboard widgets')}>
        {enabled.map((def) => (
          <Widget key={def.id} definition={def} onOpen={setOpenWidget} />
        ))}
      </div>

      <Drawer open={openWidget !== null} onClose={close} label={openWidget ? t(openWidget.title) : ''}>
        {openWidget ? (
          <div className="flex h-full flex-col">
            <DrawerHeader title={t(openWidget.title)} onClose={close} />
            <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-text-3">
              {t('Details coming soon.')}
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
  )
}

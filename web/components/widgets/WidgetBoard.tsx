'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import { useWidgetPrefs } from '@/lib/widgets/useWidgetPrefs'
import type { WidgetDefinition } from '@/lib/widgets/registry'
import { Widget } from './Widget'
import { WidgetEmptyState } from './WidgetEmptyState'
import { WidgetPanel } from './WidgetPanel'

/**
 * The Dashboard's widget board (spec 034; spec 037 made it a uniform grid +
 * opens a detail panel on click; spec 057 makes good on that panel). ONE
 * composition for every width — responsiveness is pure CSS (`.ow-board` steps
 * its column count by breakpoint). Every widget is the same height (uniform
 * `grid-auto-rows`), so the enabled subset always tiles cleanly with no
 * interior holes for any toggled combination. Renders only the enabled
 * widgets, in registry order; a calm empty state when none are enabled.
 *
 * Clicking a widget opens the shared `WidgetPanel` frame, labelled by that
 * widget's title: its registered `Panel` when one exists, or the spec-037
 * "Details coming soon." placeholder otherwise (FR-001..FR-003). `WidgetPanel`
 * owns the drawer/caption/second-level machinery itself — this board only
 * ever tracks which widget is open, which is what keeps a follow-up panel's
 * diff to its own file plus this one registry line (SC-006).
 */
export function WidgetBoard() {
  const { t } = useApp()
  const { enabled } = useWidgetPrefs()
  const [openWidget, setOpenWidget] = useState<WidgetDefinition | null>(null)

  if (enabled.length === 0) {
    return <WidgetEmptyState />
  }

  const close = () => setOpenWidget(null)
  const Panel = openWidget?.Panel

  return (
    <>
      <div className="ow-board" role="list" aria-label={t('Dashboard widgets')}>
        {enabled.map((def) => (
          <Widget key={def.id} definition={def} onOpen={setOpenWidget} />
        ))}
      </div>

      <WidgetPanel open={openWidget !== null} title={openWidget ? t(openWidget.title) : ''} onClose={close}>
        {Panel ? (
          <Panel />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-[13px] text-text-3">
            {t('Details coming soon.')}
          </div>
        )}
      </WidgetPanel>
    </>
  )
}

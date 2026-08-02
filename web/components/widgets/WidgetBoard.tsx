'use client'

import { useApp } from '@/lib/store'
import { useWidgetPrefs } from '@/lib/widgets/useWidgetPrefs'
import { Widget } from './Widget'
import { WidgetEmptyState } from './WidgetEmptyState'

/**
 * The Dashboard's widget board (spec 034). ONE composition for every width —
 * responsiveness is pure CSS (`.ow-board` steps its column count by breakpoint),
 * so there is no separate desktop layout file and no wrong-layout flash. The grid
 * uses `grid-auto-flow: dense` + equal-height rows so the enabled widgets pack
 * with no empty cells and no blank bands (FR-003, FR-005). Renders only the
 * enabled widgets, in registry order; a calm empty state when none are enabled.
 *
 * Each `Widget` renders its own labelled <section> and carries its size-span
 * class, so it is the grid item directly (no wrapper) — the board stays a clean
 * grid with no intermediate element to disturb packing.
 */
export function WidgetBoard() {
  const { t } = useApp()
  const { enabled } = useWidgetPrefs()

  if (enabled.length === 0) {
    return <WidgetEmptyState />
  }

  return (
    <div className="ow-board" role="region" aria-label={t('Dashboard widgets')}>
      {enabled.map((def) => (
        <Widget key={def.id} definition={def} />
      ))}
    </div>
  )
}

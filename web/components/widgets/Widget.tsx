'use client'

import type { WidgetDefinition, WidgetSize } from '@/lib/widgets/registry'
import { useApp } from '@/lib/store'

/** Size → board span class (defined in globals.css, `ow-*` block). */
const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: 'ow-w-sm',
  md: 'ow-w-md',
  lg: 'ow-w-lg',
  wide: 'ow-w-wide',
}

/**
 * A single widget's calm card frame (spec 034). Reuses the `.ow-card` vocabulary
 * (surface fill, card radius, hairline in dark, NO shadow — Principle II). The
 * frame is `h-full` with a flex-column body that `flex-1`, so the widget always
 * FILLS the grid cell it is given: short placeholder content never leaves a blank
 * band and the card never collapses to a sliver (FR-004). It never renders null.
 */
export function Widget({ definition }: { definition: WidgetDefinition }) {
  const { t } = useApp()
  const { title, size, Body } = definition
  return (
    <section
      aria-label={t(title)}
      className={`ow-card ${SIZE_CLASS[size]} flex h-full flex-col`}
      style={{ padding: 20 }}
    >
      <h2
        className="mb-3 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2"
      >
        {t(title)}
      </h2>
      <div className="min-h-0 flex-1">
        <Body />
      </div>
    </section>
  )
}

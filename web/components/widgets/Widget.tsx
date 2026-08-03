'use client'

import type { WidgetDefinition, WidgetSize } from '@/lib/widgets/registry'
import { useApp } from '@/lib/store'

/** Size → board class (defined in globals.css, `ow-*` block): a height tier, plus
 *  `ow-w-wide` which spans every column. Widths are uniform (one masonry column). */
const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: 'ow-w-sm',
  md: 'ow-w-md',
  lg: 'ow-w-lg',
  wide: 'ow-w-wide',
}

/**
 * A single widget's calm card frame (spec 034). Reuses the `.ow-card` vocabulary
 * (surface fill, card radius, hairline in dark, NO shadow — Principle II). The
 * frame is a flex column whose body `flex-1`, so the widget always FILLS its size
 * tier: short placeholder content never leaves a blank band (FR-004). It never
 * renders null. It is a `listitem` within the board's list (the heading names it —
 * no extra region landmark, no duplicated accessible name).
 */
export function Widget({ definition }: { definition: WidgetDefinition }) {
  const { t } = useApp()
  const { title, size, Body } = definition
  return (
    <div role="listitem" className={`ow-card ${SIZE_CLASS[size]} flex flex-col p-5`}>
      <h2 className="mb-3 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
        {t(title)}
      </h2>
      <div className="min-h-0 flex-1">
        <Body />
      </div>
    </div>
  )
}

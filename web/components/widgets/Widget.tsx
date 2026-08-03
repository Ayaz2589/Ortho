'use client'

import type { WidgetDefinition } from '@/lib/widgets/registry'
import { useApp } from '@/lib/store'

/**
 * A single widget's calm card frame (spec 034; spec 037 makes it uniform-height +
 * clickable). Reuses the `.ow-card` vocabulary (surface fill, card radius, hairline
 * in dark, NO shadow — Principle II). Every widget is the SAME height — the board
 * is a uniform grid — so the frame is a flex column whose body `flex-1` fills the
 * cell. It is a `listitem` within the board's list (the heading names it).
 *
 * The whole card is a click target that opens the widget's detail panel: a
 * full-bleed overlay `<button>` sits above the (display-only) body. The button is
 * an OVERLAY rather than wrapping the card so the title stays a real `<h2>` — a
 * button may not contain heading/flow content.
 */
export function Widget({
  definition,
  onOpen,
}: {
  definition: WidgetDefinition
  onOpen: (def: WidgetDefinition) => void
}) {
  const { t } = useApp()
  const { title, Body } = definition
  return (
    <div role="listitem" className="ow-card relative flex flex-col p-5">
      <h2 className="mb-3 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
        {t(title)}
      </h2>
      <div className="min-h-0 flex-1">
        <Body />
      </div>
      <button
        type="button"
        aria-label={t('Open {0}', t(title))}
        onClick={() => onOpen(definition)}
        className="ortho-interactive absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </div>
  )
}

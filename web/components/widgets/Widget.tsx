'use client'

import Link from 'next/link'
import type { WidgetDefinition } from '@/lib/widgets/registry'
import { useApp } from '@/lib/store'

/**
 * A single widget's calm card frame (spec 034; spec 037 makes it uniform-height +
 * clickable + scrollable). Reuses the `.ow-card` vocabulary (surface fill, card
 * radius, soft shadow). Every widget is the SAME height — the board is a uniform
 * grid — and the body SCROLLS when its content overflows that height, so nothing is
 * clipped. It is a `listitem` within the board's list (the heading names it).
 *
 * A DATA widget's whole card opens the widget's detail panel:
 *  - pointer clicks are handled by the card's `onClick` (so the body can still
 *    scroll — a full overlay button would swallow wheel/touch);
 *  - an overlay `<button>` provides the keyboard + assistive-tech affordance. It is
 *    `pointer-events-none` so it never intercepts scrolling, but stays Tab-focusable
 *    and Enter/Space-activatable. The title stays a real `<h2>` (a `<button>` may not
 *    contain heading/flow content), so it is not nested inside the button.
 *
 * A NAVIGATION widget (spec 039 — `definition.href` set) instead routes to a Settings
 * page: the overlay is a real `<Link>` covering the card (pointer-events auto — safe
 * because shortcut bodies have no scrollable content), and the card no longer opens
 * the drawer. Both variants share the same focus ring and heading.
 */
export function Widget({
  definition,
  onOpen,
}: {
  definition: WidgetDefinition
  onOpen: (def: WidgetDefinition) => void
}) {
  const { t } = useApp()
  const { title, Body, href } = definition
  const open = () => onOpen(definition)
  // `ring-inset` so the focus ring draws INSIDE the card — `.ow-card` clips overflow,
  // which would otherwise crop an outset ring on this full-cover overlay.
  const overlayClass =
    'absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]'
  return (
    <div
      role="listitem"
      className="ow-card relative flex flex-col p-5"
      onClick={href ? undefined : open}
    >
      <h2 className="mb-3 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
        {t(title)}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body />
      </div>
      {href ? (
        <Link href={href} aria-label={t('Open {0}', t(title))} className={overlayClass} />
      ) : (
        <button
          type="button"
          aria-label={t('Open {0}', t(title))}
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          className={`pointer-events-none ${overlayClass}`}
        />
      )}
    </div>
  )
}

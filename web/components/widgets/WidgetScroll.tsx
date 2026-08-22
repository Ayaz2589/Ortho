'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { scrollFadeState } from '@/lib/dashboard/scrollFade'

/**
 * Scroll container for a widget body (dashboard polish). The body still SCROLLS
 * when its content overflows the uniform card height, but:
 *  - the native scrollbar is HIDDEN (`.no-scrollbar`) so the calm card face is not
 *    interrupted by a track;
 *  - the overflowed edge is FADED (top/bottom gradient into the card surface) so a
 *    cut-off row dissolves instead of hard-clipping — the fade shows only on an
 *    edge that still has hidden content (via `scrollFadeState`), so a widget whose
 *    content fits shows none.
 *
 * The overlays are `aria-hidden`, `pointer-events-none` (never intercept the wheel
 * or a card click), and cross-faded with opacity so appearing/disappearing is calm.
 */
export function WidgetScroll({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ top: false, bottom: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setFade(
      scrollFadeState({
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      })
    )
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    // ResizeObserver may be absent (jsdom); the scroll handler still keeps the
    // fades honest once the user interacts, so guard rather than require it.
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update])

  return (
    <div className={cn('relative', className)}>
      <div ref={ref} onScroll={update} className="no-scrollbar h-full overflow-y-auto">
        {children}
      </div>
      <div aria-hidden className={cn('ow-fade-top', !fade.top && 'opacity-0')} />
      <div aria-hidden className={cn('ow-fade-bottom', !fade.bottom && 'opacity-0')} />
    </div>
  )
}

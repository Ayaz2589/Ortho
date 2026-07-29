'use client'

import type { ReactNode } from 'react'

/**
 * Accessible busy wrapper for a loading skeleton (spec 032). Replaces the visible
 * "Loading…" string's implicit meaning with a proper status region for assistive
 * tech, while the placeholder blocks inside stay `aria-hidden`. Exposes a stable
 * `data-testid` so the route dispatcher's shape can be asserted in tests.
 */
export function SkeletonRegion({
  testId,
  className,
  children,
}: {
  testId: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid={testId} className={className}>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  )
}

/** Clamp a remembered count to at least one row so a recorded 0 (or a first-load
 *  default of 0) never renders a blank screen mid-load. */
export function atLeastOne(n: number): number {
  return Math.max(1, n)
}

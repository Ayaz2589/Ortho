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

/** A card-shaped surface placeholder that matches the app's real `Card` chrome
 *  (rounded-2xl on `--surface` with the same faint lift). Box-shadow is written
 *  inline exactly like `components/ui.tsx`'s Card — the quoted string is a shadow
 *  value, not a background fill, so it does not trip the tokens-only guard. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-2xl bg-surface p-5 ${className ?? ''}`}
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {children}
    </div>
  )
}

/** Clamp a remembered count to at least one row so a recorded 0 (or a first-load
 *  default of 0) never renders a blank screen mid-load. */
export function atLeastOne(n: number): number {
  return Math.max(1, n)
}

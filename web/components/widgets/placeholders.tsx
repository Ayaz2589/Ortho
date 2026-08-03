'use client'

import { type ReactNode } from 'react'

/**
 * Shared calm-placeholder scaffold for widget bodies.
 *
 * Spec 034 introduced one placeholder per widget here. Spec 035 (Section 0) splits
 * the per-widget bodies into their own files under `bodies/` so each later section
 * can wire real data into exactly one file without colliding (decision D2); this
 * module keeps only the SHARED scaffold those body files import.
 *
 * The scaffold is token-only, carries no shadow, uses no red, and — critically —
 * FILLS the cell it is given (`h-full` + a `flex-1` filler) so no widget ever shows
 * a blank band or collapses to a sliver (FR-004). Real data is layered on per
 * section, replacing each body's `Placeholder` with live content.
 */
export function Placeholder({
  icon,
  note,
  rows = 3,
}: {
  icon: ReactNode
  note: string
  rows?: number
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 text-text-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--chip-bg)' }}
        >
          {icon}
        </span>
        <span className="text-[13px]">{note}</span>
      </div>
      {/* flex-1 filler: token-tinted bars that share the remaining height so the
          card is always fully occupied, at any cell size (sm through lg/wide). */}
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              height: 8,
              width: `${[92, 68, 80, 54, 74][i % 5]}%`,
              background: 'var(--chip-bg)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

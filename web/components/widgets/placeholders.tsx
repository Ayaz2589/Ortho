'use client'

import { type ReactNode } from 'react'
import {
  Wallet,
  Gauge,
  Target,
  PieChart,
  Store,
  ListOrdered,
} from 'lucide-react'
import { useApp } from '@/lib/store'

/**
 * Calm placeholder bodies for the widget framework (spec 034 — foundation).
 *
 * This feature builds the *foundations* of the widget system, so widgets render
 * quiet placeholder content, NOT live household data. Each placeholder is
 * token-only, carries no shadow, uses no red, and — critically — FILLS the cell
 * it is given (`h-full` + a `flex-1` filler) so no widget ever shows a blank
 * band or collapses to a sliver (FR-004). Real data is layered on later.
 */

/** Shared scaffold: an icon + caption header and a flexible filler that grows to
 *  fill whatever height the board's cell gives this widget. `rows` token blocks
 *  give the body visible, calm structure without inventing data. */
function Placeholder({
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

export function NetSummaryPlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<Wallet size={15} />} note={t('Preview')} rows={4} />
}

export function SpendingPacePlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<Gauge size={15} />} note={t('Preview')} rows={3} />
}

export function BudgetsPlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<PieChart size={15} />} note={t('Preview')} rows={3} />
}

export function GoalsPlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<Target size={15} />} note={t('Preview')} rows={2} />
}

export function TopMerchantsPlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<Store size={15} />} note={t('Preview')} rows={2} />
}

export function ActivityPlaceholder() {
  const { t } = useApp()
  return <Placeholder icon={<ListOrdered size={15} />} note={t('Preview')} rows={3} />
}

'use client'

import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'

export type DashboardMode = 'overview' | 'reports'

const MODES: { mode: DashboardMode; label: string }[] = [
  { mode: 'overview', label: 'Overview' },
  { mode: 'reports', label: 'Reports' },
]

/**
 * Overview | Reports segmented control at the top of the Dashboard (spec 027).
 * Reports is a MODE within Dashboard — not a new route or primary destination — so
 * the four destinations are preserved. Same calm segmented-pill vocabulary as the
 * range picker; each option is a real button with `aria-pressed` for the active
 * state and the token focus ring.
 */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: DashboardMode
  onChange: (m: DashboardMode) => void
}) {
  const { t } = useApp()
  return (
    <div
      className="flex gap-1 rounded-[10px] p-1"
      style={{ background: 'var(--chip-bg)' }}
      role="group"
      aria-label={t('Dashboard view')}
    >
      {MODES.map(({ mode: m, label }) => {
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-normal transition-colors',
              active ? 'text-text' : 'text-text-2'
            )}
            style={
              active
                ? { background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                : undefined
            }
          >
            {t(label)}
          </button>
        )
      })}
    </div>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { shortLabel, type DashboardRange } from './range'

/** Segmented pill matching the iOS Dashboard range picker. */
export function RangePicker({
  options,
  value,
  onChange,
}: {
  options: DashboardRange[]
  value: DashboardRange
  onChange: (r: DashboardRange) => void
}) {
  return (
    <div
      className="flex gap-1 rounded-[10px] p-1"
      style={{ background: 'rgba(0,0,0,0.05)' }}
    >
      {options.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              active ? 'text-text' : 'text-text-2'
            )}
            style={
              active
                ? { background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                : undefined
            }
          >
            {shortLabel(o)}
          </button>
        )
      })}
    </div>
  )
}

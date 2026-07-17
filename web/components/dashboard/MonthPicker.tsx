'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { stepMonth } from './range'
import { monthLabel } from '@/lib/useDashboardRange'

/**
 * Specific-month selector that sits beside the relative range picker. A prev/next
 * stepper (clamped to the months the data spans) with a tap-to-open list to jump,
 * plus a "Latest" control to return to the relative ranges. Selecting a month is a
 * transient override handled by the dashboard scope hook.
 */
export function MonthPicker({
  availableMonths,
  selectedMonth,
  onSelectMonth,
  onClear,
}: {
  availableMonths: string[]
  selectedMonth: string | null
  onSelectMonth: (m: string) => void
  onClear: () => void
}) {
  const { locale, t } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // No months in the data → nothing to pick; the relative range stands alone.
  if (availableMonths.length === 0) return null

  const older = selectedMonth ? stepMonth(availableMonths, selectedMonth, 'prev') : null
  const newer = selectedMonth ? stepMonth(availableMonths, selectedMonth, 'next') : null
  const label = selectedMonth ? monthLabel(selectedMonth, locale) : t('Pick a month')

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        type="button"
        aria-label={t('Previous month')}
        disabled={!older}
        onClick={() => older && onSelectMonth(older)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-[var(--chip-bg)] disabled:pointer-events-none disabled:text-text-3 disabled:opacity-40"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'min-w-[124px] rounded-lg px-3 py-2.5 text-sm font-normal tabular-nums transition-colors',
          selectedMonth ? 'text-text' : 'text-text-2'
        )}
        style={{ background: 'var(--chip-bg)' }}
      >
        {label}
      </button>

      <button
        type="button"
        aria-label={t('Next month')}
        disabled={!newer}
        onClick={() => newer && onSelectMonth(newer)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-[var(--chip-bg)] disabled:pointer-events-none disabled:text-text-3 disabled:opacity-40"
      >
        <ChevronRight size={18} />
      </button>

      {selectedMonth && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded-lg px-2 py-2 text-[13px] font-normal text-text-3 transition-colors hover:text-text"
        >
          {t('Latest')}
        </button>
      )}

      {open && (
        <div
          role="listbox"
          aria-label={t('Select a month')}
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-44 overflow-auto rounded-xl border border-hairline bg-surface py-1"
          style={{ boxShadow: 'var(--shadow-sheet)' }}
        >
          {availableMonths.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === selectedMonth}
              onClick={() => {
                onSelectMonth(m)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center px-3 py-2 text-left text-sm tabular-nums transition-colors hover:bg-[var(--chip-bg)]',
                m === selectedMonth ? 'text-text' : 'text-text-2'
              )}
            >
              {monthLabel(m, locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

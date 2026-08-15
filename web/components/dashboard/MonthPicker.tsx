'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { monthLabel } from '@/lib/useDashboardRange'

/**
 * Specific-month selector that sits beside the relative range picker.
 *
 * One control: a trigger showing the active month over a list of every month the
 * data spans, with "Latest" at the top to return to the relative ranges.
 * Previously this was a prev/next stepper AND the list AND a separate "Latest"
 * button — three affordances for one choice, and the two extra ones only became
 * usable once a month had already been picked, so choosing a month made the
 * control sprout controls. Selecting a month is a transient override handled by
 * the dashboard scope hook.
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

  const label = selectedMonth ? monthLabel(selectedMonth, locale) : t('Pick a month')

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex min-w-[124px] items-center justify-between gap-1.5 rounded-lg px-3 py-2.5 text-sm font-normal tabular-nums transition-colors',
          selectedMonth ? 'text-text' : 'text-text-2'
        )}
        style={{ background: 'var(--chip-bg)' }}
      >
        {label}
        <ChevronDown size={14} className="shrink-0 text-text-3" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('Select a month')}
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-44 overflow-auto rounded-xl border border-hairline bg-surface py-1"
          style={{ boxShadow: 'var(--shadow-sheet)' }}
        >
          {/* The way back to the relative ranges lives in the list, so the
              control never grows a second button. Absent when already there. */}
          {selectedMonth && (
            <Option
              label={t('Latest')}
              selected={false}
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            />
          )}
          {availableMonths.map((m) => (
            <Option
              key={m}
              label={monthLabel(m, locale)}
              selected={m === selectedMonth}
              onClick={() => {
                onSelectMonth(m)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Option({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center px-3 py-2 text-left text-sm tabular-nums transition-colors hover:bg-[var(--chip-bg)]',
        selected ? 'text-text' : 'text-text-2'
      )}
    >
      {label}
    </button>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import type { User } from '@/lib/types'

/**
 * Who the dashboard is about. Sits ABOVE the net hero and re-scopes it: with
 * "Everyone" the hero is the household's, with a member picked the same hero and
 * heatmap show that person's share (spec 043 US2, reworked).
 *
 * The earlier version was a native `<select>` below the hero that revealed a
 * SECOND row of personal figures, so the same four numbers appeared twice in two
 * shapes. One selector, one set of figures, and it reads as the question the page
 * answers rather than as a form field. Visually it matches `MonthPicker` — the
 * dashboard's other scope control — so the two header-level choices look alike.
 *
 * A single-person household gets nothing: the hero is already that person's.
 */
export function MemberScopePicker({
  personId,
  onChange,
  members,
}: {
  personId: string | null
  onChange: (id: string | null) => void
  /** Defaults to the household's active members; injectable for tests. */
  members?: User[]
}) {
  const { householdMembers, t } = useApp()
  const people = members ?? householdMembers ?? []
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

  // Nothing to switch between.
  if (people.length < 2) return null

  const active = personId ? people.find((m) => m.id === personId) ?? null : null
  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative mb-3 inline-flex" aria-label={t('Member view')}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-normal transition-colors',
          active ? 'text-text' : 'text-text-2'
        )}
        style={{ background: 'var(--chip-bg)' }}
      >
        {active ? active.name : t('Everyone')}
        <ChevronDown size={14} className="text-text-3" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('Member')}
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-48 overflow-auto rounded-xl border border-hairline bg-surface py-1"
          style={{ boxShadow: 'var(--shadow-sheet)' }}
        >
          <Option label={t('Everyone')} selected={personId === null} onClick={() => pick(null)} />
          {people.map((m) => (
            <Option
              key={m.id}
              label={m.name}
              selected={m.id === personId}
              onClick={() => pick(m.id)}
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
        'flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--chip-bg)]',
        selected ? 'text-text' : 'text-text-2'
      )}
    >
      {label}
    </button>
  )
}

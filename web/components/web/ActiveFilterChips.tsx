'use client'

import { CATEGORIES } from '@/lib/categories'
import type { TxFilters } from '@/lib/useTransactionFilters'

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[13px] text-text"
      style={{ background: 'var(--surface)', boxShadow: '0 0 0 0.5px var(--hairline)' }}
    >
      {label}
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="flex h-6 w-6 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text"
      >
        <svg width="9" height="9" viewBox="0 0 12 12">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  )
}

const KIND_LABEL: Record<string, string> = { expense: 'Expenses', income: 'Income', transfer: 'Transfers' }

/** A wrapping row of removable chips for every active filter dimension + Clear all. */
export function ActiveFilterChips({ f }: { f: TxFilters }) {
  if (f.count === 0) return null
  const c = f.criteria
  const monthLabel = f.monthOptions.find((m) => m.value === f.selectedMonth)?.label ?? f.selectedMonth

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {c.query.trim() !== '' && <RemovableChip label={`“${c.query.trim()}”`} onRemove={() => f.setQuery('')} />}
      {c.kind !== 'all' && <RemovableChip label={KIND_LABEL[c.kind]} onRemove={() => f.setKind('all')} />}
      {c.categories.map((cat) => (
        <RemovableChip key={cat} label={CATEGORIES[cat].label} onRemove={() => f.toggleCategory(cat)} />
      ))}
      {c.sources.map((s) => (
        <RemovableChip key={s} label={s} onRemove={() => f.toggleSource(s)} />
      ))}
      {c.owners.map((id) => (
        <RemovableChip key={id} label={f.ownerOptions.find((o) => o.id === id)?.name ?? id} onRemove={() => f.toggleOwner(id)} />
      ))}
      {(c.dateFrom || c.dateTo) && monthLabel && <RemovableChip label={monthLabel} onRemove={f.clearDate} />}
      <button
        type="button"
        onClick={f.clearAll}
        className="rounded-full px-3 py-1 text-[13px] font-normal text-accent transition-colors hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}

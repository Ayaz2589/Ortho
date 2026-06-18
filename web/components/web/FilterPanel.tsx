'use client'

import { CATEGORIES, SPEND_CATEGORIES } from '@/lib/categories'
import { CatTile } from '@/components/web/kit'
import { Segmented, SectionLabel } from '@/components/ui'
import type { TransactionCategory, TransactionKind } from '@/lib/types'
import type { TxFilters } from '@/lib/useTransactionFilters'

const ALL_CATEGORIES: TransactionCategory[] = [...SPEND_CATEGORIES, 'income']

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-normal transition-colors"
      style={{
        minHeight: 40,
        color: active ? 'var(--text)' : 'var(--text-2)',
        background: active ? 'var(--surface)' : 'rgba(0,0,0,0.04)',
        boxShadow: active ? '0 0 0 1.5px var(--accent)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

/** The filter surface body — shown inside a bottom-sheet (compact) or right Drawer (desktop). */
export function FilterPanel({ f }: { f: TxFilters }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <SectionLabel>Type</SectionLabel>
        <Segmented<'all' | TransactionKind>
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
          value={f.criteria.kind}
          onChange={f.setKind}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Category</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((c) => (
            <Chip key={c} active={f.criteria.categories.includes(c)} onClick={() => f.toggleCategory(c)} label={CATEGORIES[c].label}>
              <CatTile category={c} size={18} />
              {CATEGORIES[c].label}
            </Chip>
          ))}
        </div>
      </section>

      {f.sourceOptions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Source</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {f.sourceOptions.map((s) => (
              <Chip key={s} active={f.criteria.sources.includes(s)} onClick={() => f.toggleSource(s)} label={s}>
                {s}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {f.ownerOptions.length > 1 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Owner</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {f.ownerOptions.map((o) => (
              <Chip key={o.id} active={f.criteria.owners.includes(o.id)} onClick={() => f.toggleOwner(o.id)} label={o.name}>
                {o.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {f.monthOptions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Month</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {f.monthOptions.map((m) => {
              const active = f.selectedMonth === m.value
              return (
                <Chip key={m.value} active={active} onClick={() => f.setMonth(active ? null : m.value)} label={m.label}>
                  {m.label}
                </Chip>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

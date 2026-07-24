'use client'

import { CATEGORIES, CATEGORY_GROUPS } from '@/lib/categories'
import { useApp } from '@/lib/store'
import { CatTile } from '@/components/web/kit'
import { Segmented, SectionLabel } from '@/components/ui'
import type { TransactionCategory, TransactionKind } from '@/lib/types'
import type { TxFilters } from '@/lib/useTransactionFilters'

const ALL_GROUPS = [...CATEGORY_GROUPS.expense, ...CATEGORY_GROUPS.income]

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
        background: active ? 'var(--surface)' : 'var(--chip-bg)',
        boxShadow: active ? '0 0 0 1.5px var(--accent)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

/** The filter surface body — shown inside a bottom-sheet (compact) or right Drawer (desktop). */
export function FilterPanel({ f }: { f: TxFilters }) {
  const { t } = useApp()
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <SectionLabel>{t('Type')}</SectionLabel>
        <Segmented<'all' | TransactionKind>
          options={[
            { value: 'all', label: t('All') },
            { value: 'expense', label: t('Expenses') },
            { value: 'income', label: t('Income') },
            { value: 'transfer', label: t('Transfers') },
          ]}
          value={f.criteria.kind}
          onChange={f.setKind}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>{t('Category')}</SectionLabel>
        <div className="flex flex-col gap-3">
          {ALL_GROUPS.map((group) => (
            <div key={group.key} role="group" aria-label={t(group.label)}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-2)',
                  marginBottom: 6,
                }}
              >
                {t(group.label)}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.children.map((c: TransactionCategory) => (
                  <Chip key={c} active={f.criteria.categories.includes(c)} onClick={() => f.toggleCategory(c)} label={t(CATEGORIES[c].label)}>
                    <CatTile category={c} size={18} />
                    {t(CATEGORIES[c].label)}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {f.sourceOptions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>{t('Source')}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {f.sourceOptions.map((s) => (
              <Chip key={s} active={f.criteria.sources.includes(s)} onClick={() => f.toggleSource(s)} label={s}>
                {s}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {f.tagOptions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>{t('Tags')}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {f.tagOptions.map((tag) => (
              <Chip key={tag.id} active={f.criteria.tags.includes(tag.id)} onClick={() => f.toggleTag(tag.id)} label={tag.name}>
                {tag.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {f.ownerOptions.length > 1 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>{t('Owner')}</SectionLabel>
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
          <SectionLabel>{t('Month')}</SectionLabel>
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

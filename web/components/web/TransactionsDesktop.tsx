'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useApp } from '@/lib/store'
import { groupByDay, groupDaysByMonth, dayLabel, monthYearLong, expenseTotal, mediumDate, startOfMonth } from '@/lib/format'
import { categoryMeta } from '@/lib/categories'
import type { Transaction } from '@/lib/types'
import { Avatar, StackedAvatars } from '@/components/ui'
import { Drawer, DrawerHeader } from './Drawer'
import { useTransactionFilters } from '@/lib/useTransactionFilters'
import { FilterPanel } from './FilterPanel'
import { ActiveFilterChips } from './ActiveFilterChips'
import { TxFormContent } from './TxForm'
import {
  WebPageHeader,
  WebSearchInput,
  ChipIconButton,
  AccentTextButton,
  PlusGlyph,
  CatTile,
  SourceDot,
} from './kit'

const TX_COLS = '1.7fr 1fr 1.2fr 0.9fr'

function TxDetailRow({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 20px',
        minHeight: 50,
        borderTop: first ? 'none' : '0.5px solid var(--hairline)',
      }}
    >
      <div style={{ flex: '0 0 110px', fontSize: 14, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 400, letterSpacing: '-0.2px', color: 'var(--text)' }}>
        {children}
      </div>
    </div>
  )
}

/** Read-only detail content shown inside the shared slide-out panel. */
function TxDetailContent({
  tx,
  onClose,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { formatMoney, resolveUser, locale } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isIncome = tx.kind === 'income'
  const meta = categoryMeta(tx.category)
  const ownerUsers = tx.owner_ids.map(resolveUser)
  const date = new Date(tx.date)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>
          Transaction
        </div>
        <button className="ow-btn ow-chip-btn" aria-label="Close" onClick={onClose} style={{ width: 28, height: 28 }}>
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M2 2l8 8M10 2l-8 8" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '20px 20px 22px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <CatTile category={tx.category} size={52} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 400, letterSpacing: '-0.3px' }}>{tx.merchant}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
          {meta.label} · {mediumDate(date, locale)}
        </div>
        <div style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.6px', marginTop: 14, fontVariantNumeric: 'tabular-nums', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
          {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
        </div>
      </div>

      <div className="ow-card" style={{ margin: '0 16px' }}>
        <TxDetailRow label={ownerUsers.length > 1 ? 'Owners' : 'Owner'} first>
          <StackedAvatars users={ownerUsers} size={22} ring="var(--surface)" />
          <span>{ownerUsers.map((u) => u.name).join(', ')}</span>
        </TxDetailRow>
        <TxDetailRow label={isIncome ? 'Deposit to' : 'Paid with'}>
          <SourceDot size={8} />
          <span>{tx.source}</span>
        </TxDetailRow>
        <TxDetailRow label="Date">
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mediumDate(date, locale)}</span>
        </TxDetailRow>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 18px', borderTop: '0.5px solid var(--hairline)' }}>
        <button className="ow-btn" onClick={onEdit} style={{ fontSize: 14, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.1px', padding: '4px 0' }}>
          Edit transaction
        </button>
        {confirmDelete ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="ow-btn ow-quiet-link" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="ow-btn" onClick={onDelete} style={{ fontSize: 13, fontWeight: 400, color: 'var(--destructive)', letterSpacing: '-0.1px' }}>
              Delete
            </button>
          </span>
        ) : (
          <button className="ow-btn ow-quiet-link" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </>
  )
}

function TxRow({
  tx,
  selected,
  onClick,
}: {
  tx: Transaction
  selected: boolean
  onClick: () => void
}) {
  const { formatMoney, resolveUser } = useApp()
  const isIncome = tx.kind === 'income'
  const ownerUsers = tx.owner_ids.map(resolveUser)
  const single = ownerUsers.length === 1 ? ownerUsers[0] : null
  return (
    <button
      className={'ow-btn ow-tab-row ow-tab-tr' + (selected ? ' is-selected' : '')}
      style={{ gridTemplateColumns: TX_COLS }}
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <CatTile category={tx.category} size={30} />
        <span style={{ fontSize: 14.5, fontWeight: 400, letterSpacing: '-0.15px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.merchant}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {single ? (
          <>
            <Avatar user={single} size={20} />
            <span style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {single.name}
            </span>
          </>
        ) : ownerUsers.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>—</span>
        ) : (
          <StackedAvatars users={ownerUsers} size={20} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <SourceDot />
        <span style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.source}
        </span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', whiteSpace: 'nowrap', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
        {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
      </div>
    </button>
  )
}

export function TransactionsDesktop() {
  const { transactions, formatMoney, deleteTransaction, locale } = useApp()
  const f = useTransactionFilters()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const selected = selectedId ? transactions.find((t) => t.id === selectedId) ?? null : null
  const panelOpen = addOpen || !!selected

  // Close / revert the panel on the selected tx being deleted.
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null)
      setEditing(false)
    }
  }, [selectedId, selected])

  const closePanel = () => {
    setAddOpen(false)
    setEditing(false)
    setSelectedId(null)
  }

  // Lock background scroll while the panel is open. `main` has `scrollbar-gutter:
  // stable`, so the gutter stays reserved even when overflow is hidden — no need
  // to compensate with padding (doing so would now shift the table left).
  useEffect(() => {
    if (!panelOpen) return
    const main = document.querySelector('main') as HTMLElement | null
    if (!main) return
    const prevOverflow = main.style.overflow
    main.style.overflow = 'hidden'
    return () => {
      main.style.overflow = prevOverflow
    }
  }, [panelOpen])

  // Esc steps back: new → close, edit → detail, detail → close.
  useEffect(() => {
    if (!panelOpen) return
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (addOpen) setAddOpen(false)
      else if (editing) setEditing(false)
      else setSelectedId(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [panelOpen, addOpen, editing])

  const openNew = () => {
    setSelectedId(null)
    setEditing(false)
    setAddOpen(true)
  }
  const selectRow = (id: string) => {
    setAddOpen(false)
    setEditing(false)
    setSelectedId(id === selectedId ? null : id)
  }

  const months = useMemo(() => groupDaysByMonth(groupByDay(f.filtered)), [f.filtered])
  const noMatches = transactions.length > 0 && f.filtered.length === 0

  // Collapse every month by default except one: the current month, or — if it
  // has no transactions — the most recent month that does. Any active filter
  // expands all months so matches aren't hidden inside a collapsed section.
  const currentMonthKey = useMemo(() => startOfMonth(new Date()).getTime(), [])
  const defaultOpenKey = useMemo(() => {
    if (months.some((m) => m.month.getTime() === currentMonthKey)) return currentMonthKey
    return months[0]?.month.getTime() ?? null
  }, [months, currentMonthKey])

  // `null` = untouched, follow the default; once the user toggles we track an
  // explicit set so the default stops overriding their choices.
  const [openMonths, setOpenMonths] = useState<Set<number> | null>(null)
  const isMonthOpen = (key: number) =>
    f.count > 0 || (openMonths === null ? key === defaultOpenKey : openMonths.has(key))
  const toggleMonth = (key: number) =>
    setOpenMonths((prev) => {
      const base = prev ?? (defaultOpenKey !== null ? new Set([defaultOpenKey]) : new Set<number>())
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div
      className="ow-page-inner"
      style={{
        // Narrower than the dashboard since the ledger has only four columns —
        // keeps short merchant names from floating in a wide empty gap.
        // The detail/form panel overlays on top, so the table never shifts.
        maxWidth: 860,
      }}
    >
      <WebPageHeader
        title="Transactions"
        actions={
          <>
            <div style={{ width: 260 }}>
              <WebSearchInput value={f.criteria.query} onChange={f.setQuery} placeholder="Search transactions" />
            </div>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <ChipIconButton label={f.count > 0 ? `Filters (${f.count} active)` : 'Filters'} onClick={() => setFilterOpen(true)}>
                <SlidersHorizontal size={16} />
              </ChipIconButton>
              {f.count > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: '16px',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    pointerEvents: 'none',
                  }}
                >
                  {f.count}
                </span>
              )}
            </span>
            <ChipIconButton label="Add transaction" onClick={openNew}>
              <PlusGlyph />
            </ChipIconButton>
          </>
        }
      />

      {transactions.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <ActiveFilterChips f={f} />
        </div>
      )}

      {transactions.length === 0 ? (
        <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
          No transactions yet. Add your first one.
        </p>
      ) : noMatches ? (
        <div style={{ padding: '56px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 12 }}>
            No transactions match your filters.
          </p>
          <AccentTextButton onClick={f.clearAll}>Clear filters</AccentTextButton>
        </div>
      ) : (
        <>
          <div className="ow-tab-row ow-tab-head" style={{ gridTemplateColumns: TX_COLS }}>
            <div>Merchant</div>
            <div>Owner</div>
            <div>Source</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
          </div>

          {months.map((m) => {
            const key = m.month.getTime()
            const open = isMonthOpen(key)
            const monthItems = m.days.flatMap((d) => d.items)
            return (
              <div key={key}>
                <button
                  className="ow-btn"
                  onClick={() => toggleMonth(key)}
                  aria-expanded={open}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '20px 16px 10px',
                    borderBottom: '0.5px solid var(--hairline)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 400, letterSpacing: '-0.2px', color: 'var(--text)' }}>
                    <ChevronDown
                      size={15}
                      style={{ color: 'var(--text-3)', transition: 'transform var(--duration-mid) var(--ease-out)', transform: open ? undefined : 'rotate(-90deg)' }}
                    />
                    {monthYearLong(m.month, locale)}
                    <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      ({monthItems.length})
                    </span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(expenseTotal(monthItems))}
                  </span>
                </button>
                {open &&
                  m.days.map((g) => (
                    <div key={g.day.getTime()}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '22px 16px 8px' }}>
                        <span style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>
                          {dayLabel(g.day, locale)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(expenseTotal(g.items))}
                        </span>
                      </div>
                      {g.items.map((tx) => (
                        <TxRow key={tx.id} tx={tx} selected={tx.id === selectedId} onClick={() => selectRow(tx.id)} />
                      ))}
                    </div>
                  ))}
              </div>
            )
          })}
          <div style={{ height: 48 }} />
        </>
      )}

      {/* One slide-out panel: New / Edit (form) and Detail share it. */}
      {panelOpen && (
        <div className="ow-drawer-scrim" onClick={closePanel} aria-hidden="true" />
      )}
      {panelOpen && (
        <aside className="ow-drawer" aria-label="Transaction">
          {addOpen ? (
            <TxFormContent title="New transaction" saveLabel="Add" onDone={() => setAddOpen(false)} onCancel={() => setAddOpen(false)} />
          ) : editing && selected ? (
            <TxFormContent
              title="Edit transaction"
              saveLabel="Save"
              editing={selected}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : selected ? (
            <TxDetailContent
              tx={selected}
              onClose={() => setSelectedId(null)}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                deleteTransaction(selected.id)
                setSelectedId(null)
              }}
            />
          ) : null}
        </aside>
      )}

      {/* Filters live in their own right-side drawer, independent of the detail panel. */}
      <Drawer open={filterOpen} onClose={() => setFilterOpen(false)} label="Filters">
        <DrawerHeader
          title="Filters"
          onClose={() => setFilterOpen(false)}
          right={f.count > 0 ? <AccentTextButton onClick={f.clearAll}>Clear</AccentTextButton> : undefined}
        />
        <div style={{ padding: '18px 20px 28px', overflowY: 'auto' }}>
          <FilterPanel f={f} />
        </div>
      </Drawer>
    </div>
  )
}

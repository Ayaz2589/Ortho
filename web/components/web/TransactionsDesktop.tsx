'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, FileSpreadsheet, SlidersHorizontal } from 'lucide-react'
import { useApp, useAppServices } from '@/lib/store'
import { groupByDay, groupDaysByMonth, dayLabel, shortDate, monthYearLong, expenseTotal } from '@/lib/format'
import { useMonthAccordion } from '@/lib/useMonthAccordion'
import { transferParties, sortByName } from '@/lib/transaction'
import type { Transaction } from '@/lib/types'
import { Avatar, StackedAvatars, NoSourceTag } from '@/components/ui'
import { TransactionDetailBody } from '@/components/transactions/TransactionDetailBody'
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
} from './kit'
import { hasCsvSession } from '@/lib/csv/csvImportPersistence'

const CsvImportFlow = dynamic(
  () => import('@/components/csv/CsvImportFlow').then((m) => m.CsvImportFlow),
  { ssr: false }
)

const TX_COLS = '1.7fr 1fr 1.2fr 0.9fr'

/** Read-only detail content shown inside the shared slide-out panel. The body
 *  reuses the shared <TransactionDetailBody> (per-owner cents + percent for
 *  split/household transactions); the desktop drawer keeps its own header +
 *  Edit/Delete actions around it. */
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
  const { currentHousehold, t } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Kind + household name, like iOS's detail nav title ("Expense · Home").
  const kindLabel = tx.kind === 'transfer' ? t('Reimbursement') : tx.kind === 'income' ? t('Income') : t('Expense')
  const title =
    currentHousehold && tx.household_id === currentHousehold.id
      ? `${kindLabel} · ${currentHousehold.name}`
      : kindLabel

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>
          {title}
        </div>
        <button className="ow-btn ow-chip-btn" aria-label={t('Close')} onClick={onClose} style={{ width: 28, height: 28 }}>
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M2 2l8 8M10 2l-8 8" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '18px 20px 22px', overflowY: 'auto' }}>
        <TransactionDetailBody tx={tx} />
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 18px', borderTop: '0.5px solid var(--hairline)' }}>
        <button className="ow-btn" onClick={onEdit} style={{ fontSize: 14, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.1px', padding: '4px 0' }}>
          {t('Edit transaction')}
        </button>
        {confirmDelete ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="ow-btn ow-quiet-link" onClick={() => setConfirmDelete(false)}>
              {t('Cancel')}
            </button>
            <button className="ow-btn" onClick={onDelete} style={{ fontSize: 13, fontWeight: 400, color: 'var(--destructive)', letterSpacing: '-0.1px' }}>
              {t('Delete')}
            </button>
          </span>
        ) : (
          <button className="ow-btn ow-quiet-link" onClick={() => setConfirmDelete(true)}>
            {t('Delete')}
          </button>
        )}
      </div>
    </>
  )
}

function TxRowImpl({
  tx,
  selected,
  onClick,
  onCopy,
}: {
  tx: Transaction
  selected: boolean
  onClick: () => void
  onCopy: () => void
}) {
  const { formatMoney, resolveUser, t } = useAppServices()
  const isIncome = tx.kind === 'income'
  const isTransfer = tx.kind === 'transfer'
  const ownerUsers = tx.owner_ids.map(resolveUser)
  const single = ownerUsers.length === 1 ? ownerUsers[0] : null
  const parties = transferParties(tx)
  const title = isTransfer
    ? `${parties.from ? resolveUser(parties.from).name : '—'} → ${parties.to ? resolveUser(parties.to).name : '—'}`
    : tx.merchant
  return (
    <div className="ow-row-wrap cv-row">
      <button
        className={'ow-btn ow-tab-row ow-tab-tr' + (selected ? ' is-selected' : '')}
        style={{ gridTemplateColumns: TX_COLS }}
        onClick={onClick}
        aria-current={selected ? 'true' : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <CatTile category={tx.category} size={30} />
          <span style={{ fontSize: 14.5, fontWeight: 400, letterSpacing: '-0.15px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }} title={single ? single.name : undefined}>
          {single ? (
            <Avatar user={single} size={20} />
          ) : ownerUsers.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>—</span>
          ) : (
            <StackedAvatars users={ownerUsers} size={20} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {isTransfer ? (
            <span style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('Reimbursement')}
            </span>
          ) : tx.source ? (
            <span style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tx.source}
            </span>
          ) : (
            <NoSourceTag />
          )}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', whiteSpace: 'nowrap', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
          {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
        </div>
      </button>
      {/* Hover/focus row action — opens the form pre-filled from this row
          (same semantics as mobile web's row-menu Copy / iOS's swipe Copy). */}
      <button
        className="ow-btn ow-chip-btn ow-row-action"
        aria-label={t('Copy transaction')}
        title={t('Copy transaction')}
        onClick={onCopy}
        style={{ width: 28, height: 28, background: 'var(--surface)', boxShadow: '0 0 0 0.5px var(--hairline), 0 1px 2px rgba(0,0,0,0.06)' }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="8.5" height="8.5" rx="2" stroke="var(--text-2)" strokeWidth="1.4" />
          <path d="M3 11V4.5A1.5 1.5 0 014.5 3H11" stroke="var(--text-2)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

/** Memoized on the data props only (`tx` identity + `selected`) — the row reads
 *  the stable services context and its callbacks are pure functions of `tx` and
 *  stable setters, so an unrelated ledger mutation skips this row (US6/P4). */
const TxRow = memo(
  TxRowImpl,
  (a, b) => a.tx === b.tx && a.selected === b.selected
)

export function TransactionsDesktop() {
  const { transactions, formatMoney, deleteTransaction, resolveUser, locale, t } = useApp()
  const f = useTransactionFilters()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)

  // Reopen the import tray after an accidental refresh if a review session was
  // persisted (post-mount so static-export hydration stays consistent).
  useEffect(() => {
    if (hasCsvSession()) setCsvOpen(true)
  }, [])

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
    setCopySource(null)
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
      if (addOpen) {
        setAddOpen(false)
        setCopySource(null)
      } else if (editing) setEditing(false)
      else setSelectedId(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [panelOpen, addOpen, editing])

  const openNew = () => {
    setSelectedId(null)
    setEditing(false)
    setCopySource(null)
    setAddOpen(true)
  }
  const openCopy = (tx: Transaction) => {
    setSelectedId(null)
    setEditing(false)
    setCopySource(tx)
    setAddOpen(true)
  }
  const selectRow = (id: string) => {
    setAddOpen(false)
    setEditing(false)
    // Functional toggle: a memoized row that skipped a re-render keeps an older
    // onClick closure, so resolve against the latest selection, not a captured one.
    setSelectedId((cur) => (id === cur ? null : id))
  }

  const months = useMemo(() => groupDaysByMonth(groupByDay(f.filtered)), [f.filtered])
  const noMatches = transactions.length > 0 && f.filtered.length === 0

  const { isMonthOpen, toggleMonth } = useMonthAccordion(months, f.count)

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
        title={t('Transactions')}
        actions={
          <>
            <div style={{ width: 260 }}>
              <WebSearchInput value={f.criteria.query} onChange={f.setQuery} placeholder={t('Search transactions')} />
            </div>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <ChipIconButton label={f.count > 0 ? t('Filters ({0} active)', f.count) : t('Filters')} onClick={() => setFilterOpen(true)}>
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
            <ChipIconButton label={t('Import a CSV')} onClick={() => setCsvOpen(true)}>
              <FileSpreadsheet size={16} />
            </ChipIconButton>
            <ChipIconButton label={t('Add transaction')} onClick={openNew}>
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
          {t('No transactions yet. Add your first one.')}
        </p>
      ) : noMatches ? (
        <div style={{ padding: '56px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 12 }}>
            {t('No transactions match your filters.')}
          </p>
          <AccentTextButton onClick={f.clearAll}>{t('Clear filters')}</AccentTextButton>
        </div>
      ) : (
        <>
          <div className="ow-tab-row ow-tab-head" style={{ gridTemplateColumns: TX_COLS }}>
            <div>{t('Merchant')}</div>
            <div>{t('Owner')}</div>
            <div>{t('Source')}</div>
            <div style={{ textAlign: 'right' }}>{t('Amount')}</div>
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
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>
                            {t(dayLabel(g.day, locale))}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{shortDate(g.day, locale)}</span>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(expenseTotal(g.items))}
                        </span>
                      </div>
                      {sortByName(g.items, resolveUser, locale).map((tx) => (
                        <TxRow key={tx.id} tx={tx} selected={tx.id === selectedId} onClick={() => selectRow(tx.id)} onCopy={() => openCopy(tx)} />
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
        <aside className="ow-drawer" aria-label={t('Transaction')}>
          {addOpen ? (
            <TxFormContent
              title={t('New transaction')}
              saveLabel={t('Add')}
              copying={copySource}
              onDone={() => {
                setAddOpen(false)
                setCopySource(null)
              }}
              onCancel={() => {
                setAddOpen(false)
                setCopySource(null)
              }}
            />
          ) : editing && selected ? (
            <TxFormContent
              title={selected.kind === 'transfer' ? t('Edit reimbursement') : t('Edit transaction')}
              saveLabel={t('Save')}
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
      <Drawer open={filterOpen} onClose={() => setFilterOpen(false)} label={t('Filters')}>
        <DrawerHeader
          title={t('Filters')}
          onClose={() => setFilterOpen(false)}
          right={f.count > 0 ? <AccentTextButton onClick={f.clearAll}>{t('Clear')}</AccentTextButton> : undefined}
        />
        <div style={{ padding: '18px 20px 28px', overflowY: 'auto' }}>
          <FilterPanel f={f} />
        </div>
      </Drawer>

      {/* CSV import — the uploader and the parsed list live in one slide-out tray. */}
      {csvOpen && <CsvImportFlow onClose={() => setCsvOpen(false)} />}
    </div>
  )
}

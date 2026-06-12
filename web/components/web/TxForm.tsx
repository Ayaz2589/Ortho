'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from '@/lib/store'
import { SPEND_CATEGORIES, categoryMeta } from '@/lib/categories'
import { currencySymbol, fractionDigits } from '@/lib/finance/currency'
import { groupByDay, dayLabel } from '@/lib/format'
import { parseMoney, DatePicker } from '@/components/inputs'
import { Avatar } from '@/components/ui'
import type { Transaction, TransactionCategory, TransactionScope, TransactionKind } from '@/lib/types'
import { Seg, CatTile, SourceDot } from './kit'

const INCOME_SOURCES = ['ACH · Checking', 'ACH · Joint', 'Wire']

function centsToDisplay(cents: number, rate: number, fd: number): string {
  if (!cents) return ''
  return ((cents / 100) * rate).toFixed(fd)
}

function selectStyle(): React.CSSProperties {
  return {
    appearance: 'none',
    border: 0,
    background: 'transparent',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text)',
    textAlign: 'right',
    letterSpacing: '-0.2px',
    cursor: 'pointer',
  }
}

function Row({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 50, borderTop: first ? 'none' : '0.5px solid var(--hairline)' }}>
      <div style={{ flex: '0 0 100px', fontSize: 14, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>
        {children}
      </div>
    </div>
  )
}

/** Shared form state + submit for the New/Edit transaction surfaces (modal + drawer). */
export function useTxForm({ editing, copying }: { editing?: Transaction | null; copying?: Transaction | null }) {
  const {
    currency,
    rate,
    cards,
    currentHousehold,
    currentUserId,
    householdMembers,
    personalParticipants,
    addTransaction,
    updateTransaction,
  } = useApp()

  const fd = fractionDigits(currency)
  const r = rate(currency)
  const src = editing ?? copying ?? null
  const initialKind: TransactionKind = src?.kind ?? 'expense'
  const initialScope: TransactionScope = src ? src.scope : 'shared'

  const [direction, setDirection] = useState<TransactionKind>(initialKind)
  const [scope, setScope] = useState<TransactionScope>(initialScope)
  const [amount, setAmount] = useState(src ? centsToDisplay(src.amount_cents, r, fd) : '')
  const [merchant, setMerchant] = useState(src?.merchant ?? '')
  const [category, setCategory] = useState<TransactionCategory>(
    src && src.kind === 'expense' ? src.category : 'groceries'
  )
  const [owners, setOwners] = useState<string[]>(src ? src.owner_ids : [currentUserId])
  const expenseSources = useMemo(() => cards.map((c) => c.name), [cards])
  const [source, setSource] = useState(
    src?.source ?? (initialKind === 'income' ? INCOME_SOURCES[0] : expenseSources[0] ?? '')
  )
  const [date, setDate] = useState((editing?.date ?? new Date().toISOString()).slice(0, 10))

  const isIncome = direction === 'income'
  const availableOwners = scope === 'personal' ? personalParticipants : householdMembers
  const sources = isIncome ? INCOME_SOURCES : expenseSources
  const cents = parseMoney(amount, currency, r)
  const canSave = !!cents && cents > 0 && merchant.trim() !== '' && (scope === 'personal' || owners.length > 0)

  function setDir(d: TransactionKind) {
    setDirection(d)
    if (d === 'income') setSource((s) => (INCOME_SOURCES.includes(s) ? s : INCOME_SOURCES[0]))
    else setSource((s) => (expenseSources.includes(s) ? s : expenseSources[0] ?? ''))
  }
  function setScopeAndPrune(s: TransactionScope) {
    setScope(s)
    const allowed = (s === 'personal' ? personalParticipants : householdMembers).map((u) => u.id)
    setOwners((prev) => {
      const next = prev.filter((id) => allowed.includes(id))
      return next.length ? next : [currentUserId]
    })
  }
  function toggleOwner(id: string) {
    setOwners((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]))
  }

  // Copy values from an existing transaction into the form (keeps today's date).
  function loadFrom(tx: Transaction) {
    setDir(tx.kind)
    setScopeAndPrune(tx.scope)
    setAmount(centsToDisplay(tx.amount_cents, r, fd))
    setMerchant(tx.merchant)
    setCategory(tx.kind === 'expense' ? tx.category : 'groceries')
    setOwners(tx.owner_ids.length ? tx.owner_ids : [currentUserId])
    setSource(tx.source)
  }

  function submit(): boolean {
    if (!canSave || !cents) return false
    const tx: Transaction = {
      id: editing?.id ?? crypto.randomUUID(),
      household_id: scope === 'personal' ? null : currentHousehold?.id ?? null,
      merchant: merchant.trim(),
      category: isIncome ? 'income' : category,
      kind: direction,
      scope,
      amount_cents: cents,
      source,
      date: new Date(date + 'T12:00:00').toISOString(),
      created_by: editing?.created_by ?? currentUserId,
      created_at: editing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_ids: scope === 'personal' ? [currentUserId] : owners,
      splits: null,
    }
    if (editing) updateTransaction(tx)
    else addTransaction(tx)
    return true
  }

  return {
    currency,
    direction,
    setDir,
    scope,
    setScopeAndPrune,
    amount,
    setAmount,
    merchant,
    setMerchant,
    category,
    setCategory,
    owners,
    toggleOwner,
    source,
    setSource,
    date,
    setDate,
    isIncome,
    availableOwners,
    sources,
    fd,
    canSave,
    submit,
    loadFrom,
  }
}

export type TxFormApi = ReturnType<typeof useTxForm>

/** The shared field stack (amount hero, toggles, rows) used by both the modal and the drawer. */
export function TxFormFields({ form }: { form: TxFormApi }) {
  const { currency, isIncome } = form
  return (
    <>
      {/* Amount hero */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 4, padding: '10px 24px 18px' }}>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.4px', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
          {currencySymbol(currency)}
        </span>
        <input
          className="ow-amount-input"
          value={form.amount}
          inputMode="decimal"
          autoFocus
          placeholder={form.fd === 0 ? '0' : '0.00'}
          onChange={(e) => form.setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          style={{ color: isIncome ? 'var(--positive)' : 'var(--text)', width: `${Math.max(2, form.amount.length || 4)}ch`, textAlign: 'left' }}
        />
      </div>

      {/* Direction + scope */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingBottom: 18, flexWrap: 'wrap' }}>
        <Seg value={form.direction} onChange={form.setDir} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
        <Seg value={form.scope} onChange={form.setScopeAndPrune} options={[{ value: 'shared', label: 'Shared' }, { value: 'personal', label: 'Personal' }]} />
      </div>

      {/* Merchant + category */}
      <div className="ow-card" style={{ margin: '0 20px 14px' }}>
        <Row label={isIncome ? 'Source' : 'Merchant'} first>
          <input className="ow-row-input" value={form.merchant} onChange={(e) => form.setMerchant(e.target.value)} placeholder={isIncome ? 'e.g. Acme payroll' : 'e.g. Whole Foods'} />
        </Row>
        {!isIncome && (
          <Row label="Category">
            <CatTile category={form.category} size={22} />
            <select value={form.category} onChange={(e) => form.setCategory(e.target.value as TransactionCategory)} style={selectStyle()}>
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta(c).label}
                </option>
              ))}
            </select>
          </Row>
        )}
      </div>

      {/* Owner + source + date */}
      <div className="ow-card" style={{ margin: '0 20px 14px' }}>
        {form.scope === 'shared' && (
          <Row label="Owner" first>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {form.availableOwners.map((u) => {
                const on = form.owners.includes(u.id)
                return (
                  <button
                    key={u.id}
                    className="ow-btn"
                    onClick={() => form.toggleOwner(u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 4px', borderRadius: 999, background: 'var(--chip-bg)', boxShadow: on ? 'inset 0 0 0 1.5px var(--text)' : 'none' }}
                  >
                    <Avatar user={u} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{u.name}</span>
                  </button>
                )
              })}
            </div>
          </Row>
        )}
        <Row label={isIncome ? 'Deposit to' : 'Paid with'} first={form.scope === 'personal'}>
          {form.sources.length === 0 ? (
            <span style={{ color: 'var(--text-3)' }}>No cards yet</span>
          ) : (
            <select value={form.source} onChange={(e) => form.setSource(e.target.value)} style={selectStyle()}>
              {form.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Date">
          <DatePicker value={form.date} onChange={form.setDate} ariaLabel="Transaction date" />
        </Row>
      </div>

      <div style={{ padding: '2px 28px 16px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-3)' }}>
        {form.scope === 'personal'
          ? 'Personal transactions are visible only to you.'
          : 'Shared transactions are visible to everyone in your household. Multiple owners split it evenly.'}
      </div>
    </>
  )
}

/** "Copy from recent" pill shown at the top of the New form. */
export function CopyFromRecentButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ padding: '0 20px 16px' }}>
      <button
        className="ow-btn"
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px', borderRadius: 10, background: 'var(--chip-bg)', color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V4.5A1.5 1.5 0 014.5 3H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Copy from recent
      </button>
    </div>
  )
}

/** A recent-transactions list shown as a sub-view of the New form. Picking a row
 *  loads its values into the form (keeping today's date). */
export function TxCopyList({ onPick, onBack }: { onPick: (tx: Transaction) => void; onBack: () => void }) {
  const { transactions, formatMoney, ownersDisplay, locale } = useApp()
  const groups = useMemo(
    () =>
      groupByDay(
        [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40)
      ),
    [transactions]
  )
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px', borderBottom: '0.5px solid var(--hairline)', flexShrink: 0 }}>
        <button className="ow-btn ow-chip-btn" aria-label="Back" onClick={onBack} style={{ width: 28, height: 28 }}>
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M7.5 2L3.5 6l4 4" stroke="var(--text-2)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.3px' }}>Copy from recent</div>
      </div>
      <div style={{ overflow: 'auto' }}>
        {transactions.length === 0 ? (
          <p style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Nothing to copy yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.day.getTime()}>
              <div style={{ padding: '14px 20px 6px', fontSize: 13, fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>
                {dayLabel(g.day, locale)}
              </div>
              {g.items.map((tx) => {
                const owners = ownersDisplay(tx)
                const isIncome = tx.kind === 'income'
                return (
                  <button key={tx.id} className="ow-btn ow-row" onClick={() => onPick(tx)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', textAlign: 'left' }}>
                    <CatTile category={tx.category} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.merchant}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12.5, color: 'var(--text-3)' }}>
                        <SourceDot size={6} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owners.label} · {tx.source}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 14.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
                      {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
                    </span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </>
  )
}

/**
 * Drawer form content (header + fields). Rendered inside the shared `ow-drawer`
 * panel so New/Edit live in the same slide-out as the transaction detail.
 * In New mode it offers "Copy from recent" (a sub-view of this panel).
 */
export function TxFormContent({
  title,
  editing,
  copying,
  onDone,
  onCancel,
  saveLabel = 'Add',
}: {
  title: string
  editing?: Transaction | null
  copying?: Transaction | null
  onDone: () => void
  onCancel: () => void
  saveLabel?: string
}) {
  const form = useTxForm({ editing, copying })
  const [picking, setPicking] = useState(false)
  const allowCopy = !editing

  if (picking) {
    return (
      <TxCopyList
        onPick={(tx) => {
          form.loadFrom(tx)
          setPicking(false)
        }}
        onBack={() => setPicking(false)}
      />
    )
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '0.5px solid var(--hairline)', flexShrink: 0 }}>
        <button className="ow-btn" onClick={onCancel} style={{ fontSize: 15, fontWeight: 500, color: 'var(--accent)', letterSpacing: '-0.2px', zIndex: 1 }}>
          Cancel
        </button>
        <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.3px', pointerEvents: 'none' }}>
          {title}
        </div>
        <button
          className="ow-btn"
          onClick={() => {
            if (form.submit()) onDone()
          }}
          disabled={!form.canSave}
          style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', zIndex: 1, color: form.canSave ? 'var(--accent)' : 'var(--text-3)', cursor: form.canSave ? 'pointer' : 'default' }}
        >
          {saveLabel}
        </button>
      </div>
      <div style={{ overflow: 'auto', paddingTop: 16 }}>
        {allowCopy && <CopyFromRecentButton onClick={() => setPicking(true)} />}
        <TxFormFields form={form} />
      </div>
    </>
  )
}

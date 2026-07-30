'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '@/lib/store'
import { CATEGORY_GROUPS, categoryMeta } from '@/lib/categories'
import { currencySymbol, fractionDigits } from '@/lib/finance/currency'
import { toUSDCents } from '@/lib/finance/money'
import { mostCommonTransactions, knownNamesForKind, groupByCategory } from '@/lib/txSuggest'
import { parseMoney, DatePicker } from '@/components/inputs'
import { Avatar } from '@/components/ui'
import { computeShares, validateSplit, orderedOwnerIds, seedSplit, type SplitInput, type SplitMethod } from '@/lib/splits'
import { evenPercentStrings, evenValueStrings, rebalancePercents } from '@/lib/splitFields'
import type { Transaction, TransactionCategory, TransactionKind } from '@/lib/types'
import type { ParsedCandidate } from '@/lib/scan/scanModels'
import { Seg, CatTile, SourceDot, FormRow as Row } from './kit'
import { TagEditor } from './TagEditor'
import { resolveDefaultOwnerId } from '@/lib/defaultOwner'

const INCOME_SOURCES = ['ACH · Checking', 'ACH · Joint', 'Wire']

/** Prefill for opening the form directly in transfer ("Settle up") mode. */
export interface TransferPrefill {
  from: string
  to: string
  amountCents: number
}

function centsToDisplay(cents: number, rate: number, fd: number): string {
  if (!cents) return ''
  return ((cents / 100) * rate).toFixed(fd)
}

/** Order-insensitive equality of two owner-id lists. */
function sameOwnerSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/** The LOCAL calendar day of a Date as "YYYY-MM-DD". Extracting the UTC day
 *  (`iso.slice(0, 10)`) shows/saves the wrong day for legacy iOS-written
 *  evening timestamps — the form always works in the user's calendar. */
function localDayString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function selectStyle(): React.CSSProperties {
  return {
    appearance: 'none',
    border: 0,
    background: 'transparent',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 400,
    color: 'var(--text)',
    textAlign: 'right',
    letterSpacing: '-0.2px',
    cursor: 'pointer',
  }
}

/** Shared form state + submit for the New/Edit transaction surfaces (modal + drawer). */
export function useTxForm({
  editing,
  copying,
  initialTransfer,
}: {
  editing?: Transaction | null
  copying?: Transaction | null
  initialTransfer?: TransferPrefill | null
}) {
  const {
    currency,
    rate,
    cards,
    currentHousehold,
    currentUserId,
    currentPersonId,
    householdMembers,
    resolveUser,
    addTransaction,
    updateTransaction,
  } = useApp()

  const fd = fractionDigits(currency)
  const r = rate(currency)
  const src = editing ?? copying ?? null
  const initialKind: TransactionKind = initialTransfer ? 'transfer' : src?.kind ?? 'expense'
  const defaultOwner = resolveDefaultOwnerId(currentPersonId, householdMembers, currentUserId)
  const otherMember = (notId: string) => householdMembers.find((m) => m.id !== notId)?.id ?? notId
  // Copy paths validate the source's people against CURRENT membership so a
  // removed member never re-appears as an owner/payer (mirrors iOS prefill).
  // Edit keeps the stored people verbatim.
  const memberIds = useMemo(() => new Set(householdMembers.map((m) => m.id)), [householdMembers])
  const isMember = (id: string | null | undefined): id is string => !!id && memberIds.has(id)

  const initialOwners = (() => {
    if (!src || src.owner_ids.length === 0) return [defaultOwner]
    if (editing) return src.owner_ids
    const kept = src.owner_ids.filter((id) => memberIds.has(id))
    return kept.length ? kept : [defaultOwner]
  })()

  // Selectable member list. Edit mode keeps stored people verbatim, so a
  // transaction owned/paid by a since-REMOVED member must still render that
  // person — otherwise the owner chip is missing, the split row shows "—", and
  // the Paid-by/Transfer selects display a value with no matching option (the
  // browser silently shows the first active member). Augment the active list
  // with any referenced-but-inactive people, resolved by id.
  const members = useMemo(() => {
    if (!editing || !src) return householdMembers
    const referenced = [...src.owner_ids, src.paid_by].filter(
      (id): id is string => !!id && !memberIds.has(id)
    )
    if (referenced.length === 0) return householdMembers
    const extras = [...new Set(referenced)].map((id) => resolveUser(id))
    return [...householdMembers, ...extras]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, src, householdMembers, memberIds])

  const [direction, setDirection] = useState<TransactionKind>(initialKind)
  const [amount, setAmount] = useState(
    initialTransfer ? centsToDisplay(initialTransfer.amountCents, r, fd) : src ? centsToDisplay(src.amount_cents, r, fd) : ''
  )
  // The pre-filled amount's exact cents: the stored total in edit mode, or the
  // exact balance for a settle-up transfer prefill. If the user doesn't touch
  // the field, Save reuses these cents verbatim so an FX round-trip never shifts
  // the stored total (mirrors iOS) — for a settle-up this keeps the transfer
  // exactly zeroing the balance in a non-USD display currency (spec 023 B9).
  const originalAmountCents = editing ? editing.amount_cents : initialTransfer ? initialTransfer.amountCents : null
  const [originalAmountText] = useState(originalAmountCents != null ? centsToDisplay(originalAmountCents, r, fd) : '')
  const [merchant, setMerchant] = useState(src?.merchant ?? '')
  const [category, setCategory] = useState<TransactionCategory>(
    src && src.kind === 'expense' ? src.category : 'groceries'
  )
  const [incomeCategory, setIncomeCategory] = useState<TransactionCategory>(
    src && src.kind === 'income' ? src.category : 'salary'
  )
  const [owners, setOwners] = useState<string[]>(initialOwners)
  // Who paid an expense — defaults to the creator/current person, editable.
  const [paidBy, setPaidBy] = useState<string>(
    src && src.kind === 'expense' && src.paid_by && (editing || isMember(src.paid_by))
      ? src.paid_by
      : defaultOwner
  )
  // Transfer parties: from = the ower/sender, to = the payer/recipient.
  const [transferFrom, setTransferFrom] = useState<string>(() => {
    if (initialTransfer) return initialTransfer.from
    if (src?.kind === 'transfer' && src.paid_by && (editing || isMember(src.paid_by))) return src.paid_by
    return defaultOwner
  })
  const [transferTo, setTransferTo] = useState<string>(() => {
    if (initialTransfer) return initialTransfer.to
    if (src?.kind === 'transfer' && src.owner_ids[0] && (editing || isMember(src.owner_ids[0]))) {
      return src.owner_ids[0]
    }
    return otherMember(defaultOwner)
  })
  const expenseSources = useMemo(() => cards.map((c) => c.name), [cards])
  const [source, setSource] = useState(
    src?.source ?? (initialKind === 'income' ? INCOME_SOURCES[0] : expenseSources[0] ?? '')
  )
  // Tags + notes (spec 027). Seed from the edit/copy source; both are optional.
  const [tags, setTags] = useState<string[]>(src?.tags ?? [])
  const [notes, setNotes] = useState(src?.notes ?? '')
  // Edit keeps the transaction's LOCAL calendar day; add/copy default to today.
  const [date, setDate] = useState(localDayString(editing ? new Date(editing.date) : new Date()))

  // Split editor: method + per-owner text input (percentage or display-currency
  // amount). Even by default; a custom stored split reopens as a by-value split
  // with the EXACT stored cents so a no-op re-save preserves it (seedSplit).
  const initialSeed = (() => {
    if (!src || initialOwners.length < 2) return { method: 'even' as const }
    return seedSplit(src.amount_cents, orderedOwnerIds(initialOwners), src.shares)
  })()
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(initialSeed.method)
  const [splitText, setSplitText] = useState<Record<string, string>>(() => {
    if (initialSeed.method !== 'value') return {}
    const t: Record<string, string> = {}
    for (const id of initialOwners) t[id] = centsToDisplay(initialSeed.values[id] ?? 0, r, fd)
    return t
  })
  // Snapshot of the initial split text, mirroring `originalAmountText`. When the
  // amount, split method/values, and owner set are all untouched in edit mode,
  // Save reuses the STORED per-owner cents verbatim so a cents→display→cents FX
  // round-trip can't drift the shares off the parent total (spec 023 B1).
  const [originalSplitText] = useState<Record<string, string>>(() => {
    if (initialSeed.method !== 'value') return {}
    const t: Record<string, string> = {}
    for (const id of initialOwners) t[id] = centsToDisplay(initialSeed.values[id] ?? 0, r, fd)
    return t
  })

  const isIncome = direction === 'income'
  const isTransfer = direction === 'transfer'
  const sources = isIncome ? INCOME_SOURCES : expenseSources
  const cents = parseMoney(amount, currency, r)

  function buildSplit(): SplitInput {
    if (owners.length < 2 || splitMethod === 'even') return { method: 'even' }
    if (splitMethod === 'percent') {
      const percents: Record<string, number> = {}
      for (const id of owners) percents[id] = Number(splitText[id] ?? '') || 0
      return { method: 'percent', percents }
    }
    const values: Record<string, number> = {}
    for (const id of owners) values[id] = parseMoney(splitText[id] ?? '', currency, r) ?? 0
    return { method: 'value', values }
  }

  const splitInput = buildSplit()

  // The amount field's `originalAmountText` guard keeps an untouched amount at
  // its stored cents; the split shares get the same protection. In edit mode,
  // when the amount, the split method/values, and the owner set are ALL
  // unchanged, reuse the stored per-owner cents verbatim and skip re-validation —
  // otherwise a cents→display→cents round-trip (lossy for GBP/EUR) drifts the
  // shares off the total, either false-blocking Save or writing shares that don't
  // sum to the parent (the #1 money invariant). All share math runs against
  // `effectiveCents`, never the re-parsed amount field (spec 023 B1 / research D6).
  const amountUntouched = originalAmountCents != null && amount === originalAmountText
  // `cents ?? 0` keeps this a `number` (0 is falsy in the guards below, and
  // `submit` early-returns on `!cents`, so it never stores a 0 amount).
  const effectiveCents = amountUntouched && originalAmountCents != null ? originalAmountCents : cents ?? 0
  const splitUntouched =
    !!editing &&
    splitMethod === initialSeed.method &&
    sameOwnerSet(owners, initialOwners) &&
    owners.every((id) => (splitText[id] ?? '') === (originalSplitText[id] ?? ''))
  const reuseStoredShares = amountUntouched && splitUntouched

  const shares = reuseStoredShares
    ? editing!.shares
    : effectiveCents
      ? computeShares(effectiveCents, orderedOwnerIds(owners), splitInput)
      : {}
  const splitValidation = reuseStoredShares
    ? ({ ok: true } as const)
    : effectiveCents
      ? validateSplit(effectiveCents, owners, splitInput)
      : ({ ok: true } as const)
  const splitOk = owners.length < 2 || splitValidation.ok
  const splitReason = splitValidation.ok ? null : splitValidation.reason

  const canSave = isTransfer
    ? !!cents && cents > 0 && !!transferFrom && !!transferTo && transferFrom !== transferTo
    : !!cents && cents > 0 && merchant.trim() !== '' && owners.length > 0 && splitOk

  // Editing locks the transfer boundary: a transfer stays a transfer, an
  // expense/income can't become one — the two row shapes aren't
  // interchangeable (mirrors iOS `directionOptions`).
  const directionOptions: TransactionKind[] = editing
    ? editing.kind === 'transfer'
      ? ['transfer']
      : ['expense', 'income']
    : ['expense', 'income', 'transfer']

  /** Reset to an even split (used on owner/direction changes — mirrors iOS). */
  function resetSplitsToEven() {
    setSplitMethod('even')
    setSplitText({})
  }

  function setDir(d: TransactionKind) {
    setDirection(d)
    if (d === 'income') {
      setSource((s) => (INCOME_SOURCES.includes(s) ? s : INCOME_SOURCES[0]))
      setIncomeCategory((c) => (c === 'groceries' ? 'salary' : c))
    } else if (d === 'expense') {
      setSource((s) => (expenseSources.includes(s) ? s : expenseSources[0] ?? ''))
      setCategory((c) => (c === 'salary' ? 'groceries' : c))
    }
    // Flipping direction resets the split to even, like iOS `onChange(of: kind)`.
    resetSplitsToEven()
  }
  function toggleOwner(id: string) {
    setOwners((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]))
    // Re-balance to an even default whenever the owner set changes.
    resetSplitsToEven()
  }
  /** Switch the split method, seeding even values so the editor opens valid
   *  (mirrors iOS `setSplitMethod` → seedEvenPercents/seedEvenValues). */
  function chooseSplitMethod(m: SplitMethod) {
    setSplitMethod(m)
    if (m === 'percent') setSplitText(evenPercentStrings(owners))
    else if (m === 'value') setSplitText(evenValueStrings(owners, amount, fd))
    else setSplitText({})
  }
  /** By-amount field write — verbatim, no rebalance (the live validation shows
   *  whether the amounts sum to the transaction). */
  function setSplit(id: string, v: string) {
    setSplitText((prev) => ({ ...prev, [id]: v }))
  }
  /** Percent field write — writes verbatim, then rebalances the OTHER owners
   *  so the total stays 100: proportionally to their existing weights when
   *  any are non-zero, evenly otherwise. Mirrors iOS `rebalance(after:)`. */
  function setSplitPercent(id: string, v: string) {
    setSplitText((prev) => rebalancePercents(prev, id, v, owners))
  }

  // Copy values from an existing transaction into the form (keeps today's
  // date). People are validated against current membership, and a custom
  // (non-even) split is preserved exactly as a by-value split (mirrors iOS
  // `prefill(from:)` + `seedSplitFields`).
  function loadFrom(tx: Transaction) {
    setDir(tx.kind)
    setAmount(centsToDisplay(tx.amount_cents, r, fd))
    setTags(tx.tags ?? [])
    setNotes(tx.notes ?? '')
    if (tx.kind === 'transfer') {
      setTransferFrom(isMember(tx.paid_by) ? tx.paid_by : defaultOwner)
      setTransferTo(isMember(tx.owner_ids[0]) ? tx.owner_ids[0] : otherMember(defaultOwner))
      return
    }
    setMerchant(tx.merchant)
    if (tx.kind === 'income') {
      setIncomeCategory(tx.category)
    } else {
      setCategory(tx.kind === 'expense' ? tx.category : 'groceries')
    }
    const validOwners = tx.owner_ids.filter((id) => memberIds.has(id))
    const nextOwners = validOwners.length ? validOwners : [defaultOwner]
    setOwners(nextOwners)
    setPaidBy(tx.kind === 'expense' && isMember(tx.paid_by) ? tx.paid_by : defaultOwner)
    setSource(tx.source)
    if (nextOwners.length >= 2) {
      const seed = seedSplit(tx.amount_cents, orderedOwnerIds(nextOwners), tx.shares)
      if (seed.method === 'value') {
        const t: Record<string, string> = {}
        for (const id of nextOwners) t[id] = centsToDisplay(seed.values[id] ?? 0, r, fd)
        setSplitMethod('value')
        setSplitText(t)
        return
      }
    }
    resetSplitsToEven()
  }

  // Prefill from a scanned receipt/statement row (spec 021, T053). Direction
  // always follows the candidate (debit -> expense, credit -> income) — a
  // scan result is never a transfer. Non-USD candidates convert to USD cents
  // via the app's own FX rate for that currency, exactly like every other
  // amount this form stores; a null guess leaves the corresponding field at
  // its existing default rather than clobbering it with an empty value.
  function loadFromScanCandidate(candidate: ParsedCandidate) {
    setDir(candidate.direction === 'credit' ? 'income' : 'expense')
    const usdCents =
      candidate.currency === 'usd'
        ? candidate.amountCents
        : toUSDCents(candidate.amountCents / 100, candidate.currency, rate(candidate.currency))
    setAmount(centsToDisplay(usdCents, r, fd))
    setMerchant(candidate.merchant)
    if (candidate.categoryGuess) setCategory(candidate.categoryGuess)
    const validOwners = (candidate.ownersGuess ?? []).filter((id) => memberIds.has(id))
    setOwners(validOwners.length ? validOwners : [defaultOwner])
    if (candidate.date) {
      const { year, month, day } = candidate.date
      setDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
    resetSplitsToEven()
  }

  /** After "Save and add another": clear the transaction-specific fields
   *  (merchant, amount, category, splits) and keep the contextual ones
   *  (kind, source, date, owners) — mirrors iOS `resetFormForAnotherEntry`. */
  function resetForAnother() {
    setMerchant('')
    setAmount('')
    setNotes('') // notes are transaction-specific; tags stay (contextual, like source)
    if (direction === 'expense') setCategory('groceries')
    resetSplitsToEven()
  }

  function submit(): boolean {
    if (!canSave || !cents) return false
    const base = {
      id: editing?.id ?? crypto.randomUUID(),
      household_id: currentHousehold?.id ?? '',
      // `effectiveCents` keeps an untouched amount at its stored cents (no FX
      // round-trip drift); the split `shares` below get the same guarantee (B1).
      amount_cents: effectiveCents,
      // Noon UTC on the picked calendar day — the shared cross-client date
      // convention (spec 004; iOS + CLI write the same instant).
      date: `${date}T12:00:00.000Z`,
      created_by: editing?.created_by ?? currentUserId,
      created_at: editing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Tags + notes ride on every kind (spec 027). Empty note stored as null.
      tags,
      notes: notes.trim() || null,
    }
    let tx: Transaction
    if (isTransfer) {
      // A reimbursement: paid_by = sender, the single owner = recipient.
      tx = {
        ...base,
        merchant: '',
        category: 'transfer',
        kind: 'transfer',
        source: '',
        paid_by: transferFrom,
        owner_ids: [transferTo],
        shares: { [transferTo]: effectiveCents },
      }
    } else {
      tx = {
        ...base,
        merchant: merchant.trim(),
        category: isIncome ? incomeCategory : category,
        kind: direction,
        source,
        paid_by: isIncome ? null : paidBy,
        owner_ids: owners,
        shares,
      }
    }
    if (editing) updateTransaction(tx)
    else addTransaction(tx)
    return true
  }

  return {
    currency,
    direction,
    directionOptions,
    setDir,
    amount,
    setAmount,
    merchant,
    setMerchant,
    category,
    setCategory,
    incomeCategory,
    setIncomeCategory,
    owners,
    toggleOwner,
    paidBy,
    setPaidBy,
    transferFrom,
    setTransferFrom,
    transferTo,
    setTransferTo,
    source,
    setSource,
    tags,
    setTags,
    notes,
    setNotes,
    date,
    setDate,
    isIncome,
    isTransfer,
    members,
    sources,
    fd,
    rate: r,
    cents,
    // split editor
    splitMethod,
    setSplitMethod: chooseSplitMethod,
    splitText,
    setSplit,
    setSplitPercent,
    shares,
    splitOk,
    splitReason,
    canSave,
    submit,
    loadFrom,
    loadFromScanCandidate,
    resetForAnother,
  }
}

export type TxFormApi = ReturnType<typeof useTxForm>

/** A member `<select>` used for "Paid by" and the transfer From/To rows. */
function MemberSelect({
  value,
  onChange,
  members,
  ariaLabel,
}: {
  value: string
  onChange: (id: string) => void
  members: { id: string; name: string }[]
  ariaLabel: string
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle()}>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}

/** The shared field stack (amount hero, toggles, rows) used by both the modal and the drawer. */
export function TxFormFields({ form }: { form: TxFormApi }) {
  const { currency, isIncome, isTransfer } = form
  const { formatMoney, t, transactions } = useApp()
  // Merchant/payer name suggestions from the household's own ledger — kind-aware
  // (income payers vs expense merchants never mix) and a convenience only, so
  // free-form typing still works (spec 032).
  const nameSuggestions = useMemo(
    () => knownNamesForKind(transactions ?? [], isIncome ? 'income' : 'expense'),
    [transactions, isIncome]
  )
  // A per-instance id keeps the input↔datalist binding unambiguous even if two
  // form surfaces ever co-mount (mobile page / desktop drawer / ScanFlow).
  const merchantListId = useId()
  // Owner / payer pickers appear whenever the household has more than one person.
  const showOwners = form.members.length > 1
  const multi = form.owners.length >= 2
  const heroColor = isIncome ? 'var(--positive)' : 'var(--text)'
  return (
    <>
      {/* Amount hero */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 4, padding: '10px 24px 18px' }}>
        <span style={{ fontSize: 26, fontWeight: 300, letterSpacing: '-0.4px', color: heroColor }}>
          {currencySymbol(currency)}
        </span>
        <input
          className="ow-amount-input"
          value={form.amount}
          inputMode="decimal"
          autoFocus
          placeholder={form.fd === 0 ? '0' : '0.00'}
          onChange={(e) => form.setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          style={{ color: heroColor, width: `${Math.max(2, form.amount.length || 4)}ch`, textAlign: 'left' }}
        />
      </div>

      {/* Direction — edit mode locks the transfer boundary (mirrors iOS). */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingBottom: 18, flexWrap: 'wrap' }}>
        <Seg
          value={form.direction}
          onChange={form.setDir}
          options={form.directionOptions.map((k) => ({
            value: k,
            label: k === 'expense' ? t('Expense') : k === 'income' ? t('Income') : t('Transfer'),
          }))}
        />
      </div>

      {isTransfer ? (
        /* Reimbursement: From -> To + date. No merchant/category/split/source. */
        <>
          <div className="ow-card" style={{ margin: '0 20px 14px' }}>
            <Row label={t('From')} first>
              <MemberSelect value={form.transferFrom} onChange={form.setTransferFrom} members={form.members} ariaLabel={t('Transfer from')} />
            </Row>
            <Row label={t('To')}>
              <MemberSelect value={form.transferTo} onChange={form.setTransferTo} members={form.members} ariaLabel={t('Transfer to')} />
            </Row>
            <Row label={t('Date')}>
              <DatePicker value={form.date} onChange={form.setDate} ariaLabel={t('Transfer date')} />
            </Row>
          </div>
          <div style={{ padding: '2px 28px 16px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-3)' }}>
            {form.transferFrom === form.transferTo
              ? t('Pick two different members.')
              : t('Records a reimbursement between members. It does not count as spending or income.')}
          </div>
        </>
      ) : (
        <>
          {/* Merchant + category */}
          <div className="ow-card" style={{ margin: '0 20px 14px' }}>
            <Row label={isIncome ? t('Source') : t('Merchant')} first>
              <input className="ow-row-input" value={form.merchant} onChange={(e) => form.setMerchant(e.target.value)} placeholder={isIncome ? t('e.g. Acme Co. payroll') : t('e.g. Whole Foods')} list={merchantListId} autoComplete="off" />
            </Row>
            <datalist id={merchantListId}>
              {nameSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {isIncome ? (
              <Row label={t('Category')}>
                <CatTile category={form.incomeCategory} size={22} />
                <select
                  aria-label={t('Category')}
                  value={form.incomeCategory}
                  onChange={(e) => form.setIncomeCategory(e.target.value as TransactionCategory)}
                  style={selectStyle()}
                >
                  {CATEGORY_GROUPS.income.map((group) => (
                    <optgroup key={group.key} label={t(group.label)}>
                      {group.children.map((c) => (
                        <option key={c} value={c}>
                          {t(categoryMeta(c).label)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Row>
            ) : (
              <Row label={t('Category')}>
                <CatTile category={form.category} size={22} />
                <select
                  aria-label={t('Category')}
                  value={form.category}
                  onChange={(e) => form.setCategory(e.target.value as TransactionCategory)}
                  style={selectStyle()}
                >
                  {CATEGORY_GROUPS.expense.map((group) => (
                    <optgroup key={group.key} label={t(group.label)}>
                      {group.children.map((c) => (
                        <option key={c} value={c}>
                          {t(categoryMeta(c).label)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Row>
            )}
          </div>

          {/* Owners + who paid */}
          {showOwners && (
            <div className="ow-card" style={{ margin: '0 20px 14px' }}>
              <Row label={t('Owners')} first>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {form.members.map((u) => {
                    const on = form.owners.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={on}
                        className="ow-btn"
                        onClick={() => form.toggleOwner(u.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 4px', borderRadius: 999, background: 'var(--chip-bg)', boxShadow: on ? 'inset 0 0 0 1.5px var(--text)' : 'none' }}
                      >
                        <Avatar user={u} size={20} />
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)' }}>{u.name}</span>
                      </button>
                    )
                  })}
                </div>
              </Row>
              {!isIncome && (
                <Row label={t('Paid by')}>
                  <MemberSelect value={form.paidBy} onChange={form.setPaidBy} members={form.members} ariaLabel={t('Paid by')} />
                </Row>
              )}
            </div>
          )}

          {/* Split editor (multi-owner only) */}
          {multi && (
            <div className="ow-card" style={{ margin: '0 20px 14px' }}>
              <Row label={t('Split')} first>
                <Seg
                  value={form.splitMethod}
                  onChange={form.setSplitMethod}
                  options={[{ value: 'even', label: t('Even') }, { value: 'percent', label: '%' }, { value: 'value', label: currencySymbol(currency) }]}
                />
              </Row>
              {form.owners.map((id) => {
                const name = form.members.find((m) => m.id === id)?.name ?? '—'
                return (
                  <Row key={id} label={name}>
                    {form.splitMethod === 'even' ? (
                      <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(form.shares[id] ?? 0)}</span>
                    ) : form.splitMethod === 'percent' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className="ow-row-input"
                          style={{ textAlign: 'right', width: 56 }}
                          inputMode="decimal"
                          aria-label={t('{0} percent', name)}
                          value={form.splitText[id] ?? ''}
                          onChange={(e) => form.setSplitPercent(id, e.target.value.replace(/[^\d.]/g, ''))}
                        />
                        <span style={{ color: 'var(--text-3)' }}>%</span>
                        <span style={{ color: 'var(--text-3)', minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(form.shares[id] ?? 0)}
                        </span>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--text-3)' }}>{currencySymbol(currency)}</span>
                        <input
                          className="ow-row-input"
                          style={{ textAlign: 'right', width: 78 }}
                          inputMode="decimal"
                          aria-label={t('{0} amount', name)}
                          value={form.splitText[id] ?? ''}
                          onChange={(e) => form.setSplit(id, e.target.value.replace(/[^\d.,]/g, ''))}
                        />
                      </span>
                    )}
                  </Row>
                )
              })}
              {!form.splitOk && (
                <div style={{ padding: '6px 20px 12px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-2)' }}>
                  {form.splitReason === 'percent_sum'
                    ? t('Percentages must total 100%.')
                    : t('Amounts must add up to {0}.', formatMoney(form.cents ?? 0))}
                </div>
              )}
            </div>
          )}

          {/* Source + date */}
          <div className="ow-card" style={{ margin: '0 20px 14px' }}>
            <Row label={isIncome ? t('Deposit to') : t('Paid with')} first>
              {form.sources.length === 0 ? (
                <span style={{ color: 'var(--text-3)' }}>{t('No cards yet')}</span>
              ) : (
                <select value={form.source} onChange={(e) => form.setSource(e.target.value)} style={selectStyle()}>
                  {/* An imported (or old) row may carry no source, or one whose
                      card was removed — keep the control in sync by offering that
                      value explicitly ("Not set" for an empty source). */}
                  {!form.sources.includes(form.source) && (
                    <option value={form.source}>{form.source || t('Not set')}</option>
                  )}
                  {form.sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </Row>
            <Row label={t('Date')}>
              <DatePicker value={form.date} onChange={form.setDate} ariaLabel={t('Transaction date')} />
            </Row>
          </div>

          {/* Tags + notes (spec 027) — orthogonal to category, additive metadata. */}
          <div style={{ padding: '0 28px 4px', fontSize: 12.5, color: 'var(--text-3)' }}>{t('Tags')}</div>
          <TagEditor value={form.tags} onChange={form.setTags} />
          <div className="ow-card" style={{ margin: '0 20px 14px' }}>
            <div style={{ padding: '13px 20px' }}>
              <textarea
                className="ow-row-input"
                aria-label={t('Notes')}
                value={form.notes}
                onChange={(e) => form.setNotes(e.target.value)}
                placeholder={t('Add a note (optional)')}
                rows={2}
                style={{ width: '100%', resize: 'vertical', textAlign: 'left', minHeight: 44 }}
              />
            </div>
          </div>

          <div style={{ padding: '2px 28px 16px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-3)' }}>
            {multi
              ? t('Split this transaction between its owners by even shares, percentage, or amount.')
              : t('Pick more than one owner to split this transaction.')}
          </div>
        </>
      )}
    </>
  )
}

/** Secondary "Save and add another" capsule rendered below the form in add
 *  mode (batch entry). Submits and resets the form for the next entry without
 *  closing the surface — mirrors iOS `saveAndAddAnotherButton`. */
export function SaveAndAddAnotherButton({ form }: { form: TxFormApi }) {
  const { t } = useApp()
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 20px 24px' }}>
      <button
        className="ow-btn"
        disabled={!form.canSave}
        onClick={() => {
          if (form.submit()) form.resetForAnother()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 999,
          background: 'var(--chip-bg)',
          color: form.canSave ? 'var(--accent)' : 'var(--text-3)',
          fontSize: 15,
          fontWeight: 400,
          cursor: form.canSave ? 'pointer' : 'default',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {t('Save and add another')}
      </button>
    </div>
  )
}

/** "Copy from most common" pill shown at the top of the New form. */
export function CopyFromCommonButton({ onClick }: { onClick: () => void }) {
  const { t } = useApp()
  return (
    <div style={{ padding: '0 20px 16px' }}>
      <button
        className="ow-btn"
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px', borderRadius: 10, background: 'var(--chip-bg)', color: 'var(--accent)', fontSize: 14, fontWeight: 400 }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V4.5A1.5 1.5 0 014.5 3H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {t('Copy from most common')}
      </button>
    </div>
  )
}

/** A most-common-merchants list shown as a sub-view of the New form: the
 *  household's merchants ranked by how often they appear, one representative
 *  (most-recent) entry each. Picking a row loads its values into the form
 *  (keeping today's date). */
export function TxCopyList({ onPick, onBack }: { onPick: (tx: Transaction) => void; onBack: () => void }) {
  const { transactions, formatMoney, ownersDisplay, t } = useApp()
  const common = useMemo(() => mostCommonTransactions(transactions ?? []), [transactions])
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px', borderBottom: '0.5px solid var(--hairline)', flexShrink: 0 }}>
        <button className="ow-btn ow-chip-btn" aria-label={t('Back')} onClick={onBack} style={{ width: 28, height: 28 }}>
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M7.5 2L3.5 6l4 4" stroke="var(--text-2)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.3px' }}>{t('Copy from most common')}</div>
      </div>
      <div style={{ overflow: 'auto' }}>
        {common.length === 0 ? (
          <p style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>{t('Nothing to copy yet')}</p>
        ) : (
          groupByCategory(common).map(({ category, label, rows }) => {
            const meta = categoryMeta(category)
            const Icon = meta.icon
            return (
              <div key={category}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px 3px', color: 'var(--text-2)', fontSize: 12, fontWeight: 500, letterSpacing: '-0.1px' }}>
                  <Icon size={13} color={meta.tint} strokeWidth={2.2} />
                  <span>{label}</span>
                </div>
                {rows.map((tx) => {
                  const owners = ownersDisplay(tx)
                  const isIncome = tx.kind === 'income'
                  return (
                    <button key={tx.id} className="ow-btn ow-row" onClick={() => onPick(tx)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', textAlign: 'left' }}>
                      <CatTile category={tx.category} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 400, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.merchant || (tx.kind === 'transfer' ? t('Transfer') : '')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12.5, color: 'var(--text-3)' }}>
                          <SourceDot size={6} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owners.label}{tx.source ? ` · ${tx.source}` : ''}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 14.5, fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: isIncome ? 'var(--positive)' : 'var(--text)' }}>
                        {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

/**
 * Drawer form content (header + fields). Rendered inside the shared `ow-drawer`
 * panel so New/Edit live in the same slide-out as the transaction detail.
 * In New mode it offers "Copy from most common" (a sub-view of this panel).
 */
/** The shared New/Edit form body — the copy-from-most-common affordance, the fields,
 *  and (New only) save-and-add-another — rendered identically by the modal
 *  (mobile) and the drawer (desktop). Each surface keeps its own chrome (header)
 *  and copy-picker wrapper, which legitimately differ; only this inner assembly
 *  is shared, so the two forms can't drift out of sync (FR-020). */
export function TxFormBody({
  form,
  allowCopy,
  showAddAnother,
  onPick,
}: {
  form: TxFormApi
  allowCopy: boolean
  showAddAnother: boolean
  onPick: () => void
}) {
  return (
    <>
      {allowCopy && <CopyFromCommonButton onClick={onPick} />}
      <TxFormFields form={form} />
      {showAddAnother && <SaveAndAddAnotherButton form={form} />}
    </>
  )
}

export function TxFormContent({
  title,
  editing,
  copying,
  initialTransfer,
  onDone,
  onCancel,
  saveLabel,
}: {
  title: string
  editing?: Transaction | null
  copying?: Transaction | null
  initialTransfer?: TransferPrefill | null
  onDone: () => void
  onCancel: () => void
  saveLabel?: string
}) {
  const { t } = useApp()
  const form = useTxForm({ editing, copying, initialTransfer })
  const [picking, setPicking] = useState(false)
  const allowCopy = !editing && !initialTransfer

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
        <button className="ow-btn" onClick={onCancel} style={{ fontSize: 15, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.2px', zIndex: 1 }}>
          {t('Cancel')}
        </button>
        <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 15, fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.3px', pointerEvents: 'none' }}>
          {title}
        </div>
        <button
          className="ow-btn"
          onClick={() => {
            if (form.submit()) onDone()
          }}
          disabled={!form.canSave}
          style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 400, letterSpacing: '-0.2px', zIndex: 1, color: form.canSave ? 'var(--accent)' : 'var(--text-3)', cursor: form.canSave ? 'pointer' : 'default' }}
        >
          {saveLabel ?? t('Add')}
        </button>
      </div>
      <div style={{ overflow: 'auto', paddingTop: 16 }}>
        <TxFormBody form={form} allowCopy={allowCopy} showAddAnother={!editing} onPick={() => setPicking(true)} />
      </div>
    </>
  )
}

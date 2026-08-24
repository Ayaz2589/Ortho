// spec 032 — the transactions data section.
//
// serialize: store transactions → canonical TxRecord[] (USD cents; tags as names)
// read:      envelope payload → TxRecord[]
// dedupe:    tier-1 by canonical id, tier-2 by the CSV fuzzy matcher
// apply:     create plan.add via addTransaction, resolving unknown people to the
//            importing user so splits always sum to amount_cents
// render:    a calm money table for the visible PDF layer

import { CATEGORIES } from '../../categories'
import { findDuplicateId } from '../../csv/duplicateMatch'
import type { Transaction, TransactionCategory, TransactionKind } from '../../types'
import type { SectionPayload } from '../envelope'
import type {
  ApplyCtx,
  DataSection,
  DataStore,
  RenderCtx,
  SectionDedupePlan,
  SectionRenderModel,
} from '../registry'

export const TRANSACTIONS_KEY = 'transactions'
const SECTION_VERSION = 1

/** Canonical, currency-independent transaction record inside the envelope. */
export interface TxRecord {
  id: string
  date: string
  merchant: string
  category: TransactionCategory
  kind: TransactionKind
  amount_cents: number
  source: string
  notes: string | null
  paid_by: string | null
  owner_ids: string[]
  /** person id → USD cents; sums to amount_cents. */
  shares: Record<string, number>
  /** tag NAMES (stable across households); resolved to ids on import. */
  tags: string[]
}

function serialize(store: DataStore): TxRecord[] {
  const tagName = new Map(store.tags.map((t) => [t.id, t.name]))
  return store.transactions.map((tx) => ({
    id: tx.id,
    date: tx.date,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    amount_cents: tx.amount_cents,
    source: tx.source,
    notes: tx.notes ?? null,
    paid_by: tx.paid_by ?? null,
    owner_ids: [...tx.owner_ids],
    shares: { ...tx.shares },
    tags: (tx.tags ?? []).map((id) => tagName.get(id)).filter((n): n is string => !!n),
  }))
}

function read(payload: SectionPayload): TxRecord[] {
  return (payload.records as TxRecord[]).map((r) => ({
    ...r,
    notes: r.notes ?? null,
    paid_by: r.paid_by ?? null,
    owner_ids: r.owner_ids ?? [],
    shares: r.shares ?? {},
    tags: r.tags ?? [],
  }))
}

function dedupe(records: TxRecord[], store: DataStore): SectionDedupePlan<TxRecord> {
  const existingIds = new Set(store.transactions.map((t) => t.id))
  const candidates = store.transactions.map((t) => ({
    id: t.id,
    date: t.date,
    amountCents: t.amount_cents,
    merchant: t.merchant,
    kind: t.kind,
  }))
  const plan: SectionDedupePlan<TxRecord> = { add: [], skipById: [], skipByContent: [] }
  for (const r of records) {
    if (existingIds.has(r.id)) {
      plan.skipById.push(r) // tier 1 short-circuits tier 2
      continue
    }
    const dup = findDuplicateId(
      { dateISO: r.date, amountCents: r.amount_cents, merchant: r.merchant, kind: r.kind },
      candidates
    )
    if (dup) plan.skipByContent.push(r)
    else plan.add.push(r)
  }
  return plan
}

/** Remap a record's owners/payer/shares onto people that exist locally. Unknown
 *  ids collapse to the importing user so the shares still sum to amount_cents. */
function resolveOwnership(
  r: TxRecord,
  store: DataStore
): Pick<Transaction, 'paid_by' | 'owner_ids' | 'shares'> {
  const valid = new Set(store.people.map((p) => p.id))
  const me = store.currentPersonId
  const map = (id: string) => (valid.has(id) ? id : me)

  const owner_ids: string[] = []
  const shares: Record<string, number> = {}
  const sourceOwners = r.owner_ids.length ? r.owner_ids : Object.keys(r.shares)
  for (const o of sourceOwners) {
    const target = map(o)
    if (!owner_ids.includes(target)) owner_ids.push(target)
    shares[target] = (shares[target] ?? 0) + (r.shares[o] ?? 0)
  }
  // Defensive: an income/legacy row with neither owners nor shares → the user.
  if (owner_ids.length === 0) {
    owner_ids.push(me)
    shares[me] = r.amount_cents
  }
  // Guarantee the shares-sum invariant even for a hand-crafted/older envelope
  // whose `shares` are missing or don't total `amount_cents`: fall back to an
  // even split (deterministic remainder to the leading owners).
  const total = owner_ids.reduce((sum, id) => sum + (shares[id] ?? 0), 0)
  if (total !== r.amount_cents) {
    const n = owner_ids.length
    const base = Math.floor(r.amount_cents / n)
    const rem = r.amount_cents - base * n
    owner_ids.forEach((id, i) => {
      shares[id] = base + (i < rem ? 1 : 0)
    })
  }
  const paid_by = r.paid_by == null ? null : map(r.paid_by)
  return { paid_by, owner_ids, shares }
}

function apply(plan: SectionDedupePlan<TxRecord>, store: DataStore, ctx: ApplyCtx): void {
  const householdId = store.currentHousehold?.id ?? ''
  // Resolve each tag name to an id at most once per import batch. The store's
  // addTag reads its `tags` snapshot, which doesn't update synchronously within
  // one loop — calling it twice for the same new name would create duplicate
  // tag rows. Cache by trimmed/case-insensitive name (addTag's own identity).
  const tagIdByName = new Map<string, string>()
  const resolveTag = (name: string): string => {
    const key = name.trim().toLowerCase()
    let id = tagIdByName.get(key)
    if (!id) {
      id = store.addTag(name).id
      tagIdByName.set(key, id)
    }
    return id
  }
  for (const r of plan.add) {
    const tagIds = r.tags.map(resolveTag)
    const tx: Transaction = {
      id: r.id, // preserve → re-import is a tier-1 no-op (idempotent)
      household_id: householdId,
      merchant: r.merchant,
      category: r.category,
      kind: r.kind,
      amount_cents: r.amount_cents,
      source: r.source,
      date: r.date,
      created_by: store.currentUserId,
      created_at: ctx.now,
      updated_at: ctx.now,
      notes: r.notes,
      tags: tagIds,
      ...resolveOwnership(r, store),
    }
    store.addTransaction(tx)
  }
}

function renderModel(records: TxRecord[], ctx: RenderCtx): SectionRenderModel {
  const money = (r: TxRecord) =>
    ctx.formatMoney(r.amount_cents, ctx.currency, ctx.rate(ctx.currency), r.kind === 'income', ctx.locale)
  const ownerNames = (r: TxRecord) =>
    r.owner_ids.map((id) => ctx.resolveUser(id).name).join(', ')
  const categoryLabel = (c: TransactionCategory) =>
    ctx.t(CATEGORIES[c]?.label ?? c)
  return {
    title: ctx.t('Transactions'),
    columns: [ctx.t('Date'), ctx.t('Merchant'), ctx.t('Category'), ctx.t('Amount'), ctx.t('Owners')],
    rows: records.map((r) => [r.date, r.merchant, categoryLabel(r.category), money(r), ownerNames(r)]),
    emptyLabel: ctx.t('No transactions yet'),
  }
}

export const transactionsSection: DataSection<TxRecord> = {
  key: TRANSACTIONS_KEY,
  sectionVersion: SECTION_VERSION,
  serialize,
  read,
  dedupe,
  apply,
  renderModel,
}

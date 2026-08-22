// SimpleFIN request builders + response parsers + ledger mapping (spec 028).
// Pure functions over untrusted JSON: parsers tolerate both observed schema variants
// (v1 nested `org` + `errors`; v2 top-level `connections` + `errlist`) and never throw
// on malformed input. Nothing here performs I/O (see simplefinClient.ts).

import { base64Decode } from './base64.ts'
import { amountToCents, dedupeKey, hash128Hex, ledgerId } from './normalize.ts'
import type {
  ParsedSimpleFinAccounts,
  SimpleFinAccountMeta,
  SimpleFinTransaction,
} from './types.ts'

/** A synced ledger backfill window: initial = 90 days, else last sync minus a
 *  3-day overlap to re-catch late-posting / pending→posted (research D5). */
export const SYNC_OVERLAP_SECONDS = 3 * 24 * 60 * 60
export const MAX_WINDOW_SECONDS = 90 * 24 * 60 * 60

/** Decode a SimpleFIN setup token → its claim URL. The token base64-decodes to an
 *  http(s) URL; anything else returns null (invalid/expired/garbage token). */
export function decodeSetupToken(token: string): string | null {
  const decoded = base64Decode(token)
  if (decoded === null) return null
  const url = decoded.trim()
  if (!/^https?:\/\/\S+$/.test(url)) return null
  return url
}

/** Stable, opaque, non-secret institution identity for one claimed Access URL
 *  (research D1). Derived via a non-cryptographic hash — the real Access URL never
 *  leaves Vault. Anchors the UNIQUE(provider, provider_item_id) idempotency. */
export function deriveProviderItemId(accessUrl: string): string {
  return `sfin_${hash128Hex(accessUrl.trim()).slice(0, 32)}`
}

/** Build the GET /accounts query string for a sync window. `pending=1` includes
 *  not-yet-posted transactions; the window is clamped to ≤ 90 days. */
export function buildAccountsQuery(startEpoch: number, endEpoch: number, balancesOnly = false): string {
  const start = Math.max(0, Math.floor(startEpoch))
  const end = Math.max(start, Math.floor(endEpoch))
  const clampedStart = Math.max(start, end - MAX_WINDOW_SECONDS)
  const params = [`start-date=${clampedStart}`, `end-date=${end}`]
  if (balancesOnly) params.push('balances-only=1')
  else params.push('pending=1')
  return params.join('&')
}

/** Compute the next sync window [start,end] in epoch seconds. */
export function buildSyncWindow(lastSyncedAtEpoch: number | null, nowEpoch: number): { start: number; end: number } {
  const end = Math.floor(nowEpoch)
  const start = lastSyncedAtEpoch == null
    ? end - MAX_WINDOW_SECONDS
    : Math.max(end - MAX_WINDOW_SECONDS, Math.floor(lastSyncedAtEpoch) - SYNC_OVERLAP_SECONDS)
  return { start: Math.max(0, start), end }
}

// ── Defensive JSON access ────────────────────────────────────────────────────
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function last4(v: unknown): string | null {
  const s = asString(v)
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** Parse GET /accounts into normalized accounts + transactions + warnings. Tolerant
 *  of both schema variants (research D3): reads `errors` OR `errlist`, and org name
 *  from a nested `org` object OR a top-level `connections`/`org_name`. */
export function parseSimpleFinAccounts(payload: unknown): ParsedSimpleFinAccounts {
  const root = asRecord(payload)
  const accounts: SimpleFinAccountMeta[] = []
  const transactions: SimpleFinTransaction[] = []
  const warnings: string[] = []

  if (!root) return { accounts, transactions, warnings }

  // In-band errors: v1 `errors: string[]`, v2 `errlist: {msg}[]`.
  for (const e of asArray(root.errors)) {
    const s = asString(e)
    if (s) warnings.push(s)
  }
  for (const e of asArray(root.errlist)) {
    const rec = asRecord(e)
    const msg = rec ? asString(rec.msg) : asString(e)
    if (msg) warnings.push(msg)
  }

  for (const rawAcct of asArray(root.accounts)) {
    const acct = asRecord(rawAcct)
    if (!acct) continue
    const accountId = asString(acct.id)
    if (!accountId) continue

    const org = asRecord(acct.org)
    const orgName =
      (org && (asString(org.name) ?? asString(org.domain))) ??
      asString(acct.org_name) ??
      null

    accounts.push({
      providerAccountId: accountId,
      name: asString(acct.name) ?? 'Account',
      orgName,
      currency: asString(acct.currency),
      mask: last4(acct.mask) ?? last4(acct.name),
      accountType: asString(acct['account-type']) ?? '',
    })

    for (const rawTxn of asArray(acct.transactions)) {
      const txn = asRecord(rawTxn)
      if (!txn) continue
      const txnId = asString(txn.id)
      const amountRaw = asString(txn.amount)
      if (!txnId || amountRaw == null) continue
      const normalized = amountToCents(amountRaw)
      if (!normalized) {
        warnings.push(`Unparseable amount for transaction ${txnId}`)
        continue
      }
      const posted = Number(txn.posted)
      const transacted = Number(txn.transacted_at)
      const postedAt = Number.isFinite(posted) && posted > 0
        ? Math.floor(posted)
        : Number.isFinite(transacted) && transacted > 0
          ? Math.floor(transacted)
          : 0
      transactions.push({
        providerAccountId: accountId,
        providerTxnId: txnId,
        amountCents: normalized.amountCents,
        kind: normalized.kind,
        postedAt,
        description: asString(txn.payee) ?? asString(txn.description) ?? '',
        memo: asString(txn.memo),
        pending: txn.pending === true || posted === 0,
      })
    }
  }

  return { accounts, transactions, warnings }
}

/** A friendly institution label from parsed accounts (first org name, else "SimpleFIN"). */
export function institutionLabel(accounts: SimpleFinAccountMeta[]): string {
  return accounts.find((a) => a.orgName)?.orgName ?? 'SimpleFIN'
}

// ── Ledger mapping ───────────────────────────────────────────────────────────

export interface UpsertContext {
  householdId: string
  createdBy: string
  /** household_people id that receives the default 100% split (research D7). */
  defaultPersonId: string
  /** transaction_category for unmatched EXPENSES. Mirrors the CLI import engine's
   *  documented fallback ('entertainment'); income always maps to 'income'.
   *  Richer merchant-rule categorization is a future enhancement (research D7). */
  defaultExpenseCategory: string
}

export interface UpsertPayload {
  tx: {
    id: string
    household_id: string
    merchant: string
    category: string
    kind: string
    amount_cents: number
    source: string
    date: string
    created_by: string
    // spec 053 — was `null`, a type-level assertion that sync never records a payer. It now
    // carries the connected account's owning person for expenses (null for income), so synced
    // rows reach the balance engine instead of being invisible to it.
    paid_by: string | null
    notes: string | null
  }
  shares: Array<{ person_id: string; amount_cents: number }>
}

/** Map one normalized SimpleFIN transaction to an upsert_transaction payload
 *  (p_tx + default single-person split). The ledger id is deterministic on the
 *  dedupe key so re-syncs upsert the same row (research D6/D7). */
export function toUpsertPayload(txn: SimpleFinTransaction, ctx: UpsertContext): UpsertPayload {
  return {
    tx: {
      id: ledgerId(ctx.householdId, txn.providerAccountId, txn.providerTxnId),
      household_id: ctx.householdId,
      merchant: txn.description || 'Bank transaction',
      // income → 'income'; unmatched expense → the import-engine fallback.
      category: txn.kind === 'income' ? 'income' : ctx.defaultExpenseCategory,
      kind: txn.kind,
      amount_cents: txn.amountCents,
      source: dedupeKey(txn.providerAccountId, txn.providerTxnId),
      date: new Date(txn.postedAt * 1000).toISOString(),
      created_by: ctx.createdBy,
      // spec 053 — a bank feed cannot know who physically paid, but "nobody" is the one
      // answer that is certainly wrong: it makes every synced row invisible to the balance
      // engine. The connected account's owning person is the only defensible signal, and the
      // user can correct it by editing the transaction. Income keeps a null payer — income
      // has no payer (FR-006).
      paid_by: txn.kind === 'income' ? null : ctx.defaultPersonId,
      notes: txn.memo,
    },
    shares: [{ person_id: ctx.defaultPersonId, amount_cents: txn.amountCents }],
  }
}

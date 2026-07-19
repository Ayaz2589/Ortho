// SimpleFIN → Ortho ledger normalization (spec 028, research D4/D6). Pure, no I/O.
// THE most safety-critical module: a sign error would swap income and spending.
//
// Two facts drive it:
//  1. Ortho stores `amount_cents` as a NON-NEGATIVE bigint; direction is carried by
//     `transaction_kind` ('income' | 'expense'). So SimpleFIN's *signed* decimal amount
//     maps to (absolute cents, kind) — there is never a negative to store.
//  2. SimpleFIN's sign convention is INVERTED vs Plaid: positive = inflow (money in).

import type { TransactionKind } from './types.ts'

export interface NormalizedAmount {
  amountCents: number
  kind: TransactionKind
  /** True when the amount was exactly zero — callers may want to flag/skip. */
  zero: boolean
}

/**
 * Convert a SimpleFIN signed decimal-string amount to (absolute cents, kind) WITHOUT
 * floating point. Examples (research D4):
 *   "-33.45" → { 3345, expense }   "100" → { 10000, income }
 *   "-33.4"  → { 3340, expense }   "0"/"0.00" → { 0, income, zero:true }
 * Returns null on anything that isn't a plain signed decimal (e.g. thousands
 * separators, letters, multiple dots) so callers reject rather than mis-store.
 */
export function amountToCents(raw: string): NormalizedAmount | null {
  const s = raw.trim()
  const m = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(s)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const whole = m[2]
  const fracRaw = m[3] ?? ''
  // Pad/truncate the fractional part to exactly 2 digits (deterministic truncation).
  const frac = (fracRaw + '00').slice(0, 2)
  const cents = Number(whole) * 100 + Number(frac)
  if (!Number.isSafeInteger(cents)) return null
  const zero = cents === 0
  // Zero has no direction; classify as income by convention and flag it.
  const kind: TransactionKind = zero ? 'income' : sign > 0 ? 'income' : 'expense'
  return { amountCents: cents, kind, zero }
}

/** Dedupe key for a synced transaction. SimpleFIN transaction ids are unique only
 *  WITHIN an account, so the account id must be part of the key (research D6). */
export function dedupeKey(providerAccountId: string, providerTxnId: string): string {
  return `simplefin:${providerAccountId}:${providerTxnId}`
}

/** 128-bit FNV-1a over a string → 32 lowercase hex chars. Non-cryptographic; used
 *  only to derive a STABLE, opaque, deterministic internal id (not a security
 *  boundary). Collision probability is negligible at household transaction volume. */
export function hash128Hex(input: string): string {
  // Two independent 64-bit FNV-1a passes (different offset bases) → 128 bits.
  const halves = [
    fnv1a64(input, 0xcbf29ce484222325n),
    fnv1a64(input, 0x84222325cbf29ce4n),
  ]
  return halves.map((h) => h.toString(16).padStart(16, '0')).join('')
}

function fnv1a64(input: string, offset: bigint): bigint {
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let h = offset
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i) & 0xff)
    h = (h * prime) & mask
  }
  return h & mask
}

/** Format 32 hex chars as a canonical UUID string (8-4-4-4-12). */
export function hexToUuid(hex32: string): string {
  const h = hex32.padStart(32, '0').slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Deterministic ledger-row id for a synced transaction: same (household, account,
 *  txn) → same UUID across every sync, so `upsert_transaction`'s `on conflict (id)`
 *  makes re-syncs idempotent and pending→posted an in-place update (research D6).
 *  The household is part of the hash so two households whose banks happen to reuse
 *  the same (account id, txn id) never collide on one ledger row. */
export function ledgerId(householdId: string, providerAccountId: string, providerTxnId: string): string {
  return hexToUuid(hash128Hex(`${householdId}:${dedupeKey(providerAccountId, providerTxnId)}`))
}

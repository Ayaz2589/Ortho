// Map a reviewed ParsedTransaction to the app's persisted Transaction shape.
// Every transaction belongs to the household and carries cents-per-owner shares,
// so imported rows are indistinguishable from app-entered ones (FR-021).
import type { Transaction } from '../../../lib/types'
import { computeShares, orderedOwnerIds, type SplitInput } from '../../../lib/splits'
import type { ParsedTransaction } from './types'

export interface OwnerContext {
  /** Authed user id — becomes created_by. */
  createdBy: string
  /** Operator's household id (required — every transaction has a household). */
  householdId: string | null
  /** The owner (person id) used when a row resolves no explicit owners. */
  defaultOwnerId: string
}

/** Deterministic given injected `id` and `nowISO` (so it is unit-testable). */
export function toTransaction(
  p: ParsedTransaction,
  source: string,
  ctx: OwnerContext,
  id: string,
  nowISO: string
): Transaction {
  if (!ctx.householdId) {
    throw new Error('IMPORT_REQUIRES_HOUSEHOLD: every transaction needs a household')
  }
  const owners = p.ownerIds.length ? p.ownerIds : [ctx.defaultOwnerId]
  const split: SplitInput = p.splits ? { method: 'percent', percents: p.splits } : { method: 'even' }
  // Canonicalize owner order before computing shares so the deterministic
  // leftover cent lands on the same owner as the apps (see lib/splits.orderedOwnerIds).
  const shares = computeShares(p.amountCents, orderedOwnerIds(owners), split)
  return {
    id,
    household_id: ctx.householdId,
    merchant: p.merchant,
    category: p.category,
    kind: p.kind,
    amount_cents: p.amountCents,
    source,
    date: p.dateISO,
    created_by: ctx.createdBy,
    created_at: nowISO,
    updated_at: nowISO,
    owner_ids: owners,
    // spec 053 — a statement cannot say who physically paid, but writing null makes every
    // imported row invisible to the balance engine. The import context's default person is
    // the only defensible signal, and it can be corrected by editing the transaction.
    // Income keeps a null payer — income has no payer (FR-006).
    paid_by: p.kind === 'income' ? null : ctx.defaultOwnerId,
    shares,
  }
}

// Map a reviewed ParsedTransaction to the app's persisted Transaction shape.
// Single owner → personal; multiple owners → shared (needs a household). Mirrors
// the web store's record so imported rows are indistinguishable (FR-021).
import type { Transaction } from '../../../lib/types'
import type { ParsedTransaction } from './types'

export interface OwnerContext {
  /** Authed user id — becomes created_by. */
  createdBy: string
  /** Operator's household id, required when a row has multiple owners. */
  householdId: string | null
}

/** Deterministic given injected `id` and `nowISO` (so it is unit-testable). */
export function toTransaction(
  p: ParsedTransaction,
  source: string,
  ctx: OwnerContext,
  id: string,
  nowISO: string
): Transaction {
  const owners = p.ownerIds.length ? p.ownerIds : [ctx.createdBy]
  const shared = owners.length > 1
  if (shared && !ctx.householdId) {
    throw new Error('SHARED_REQUIRES_HOUSEHOLD: multi-owner row needs a household')
  }
  return {
    id,
    household_id: shared ? ctx.householdId : null,
    merchant: p.merchant,
    category: p.category,
    kind: p.kind,
    scope: shared ? 'shared' : 'personal',
    amount_cents: p.amountCents,
    source,
    date: p.dateISO,
    created_by: ctx.createdBy,
    created_at: nowISO,
    updated_at: nowISO,
    owner_ids: owners,
    splits: p.splits,
  }
}

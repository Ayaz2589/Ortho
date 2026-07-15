import type { Transaction } from './types'

/** True for a reimbursement/transfer row. A thin, named guard so call sites read
 *  as intent, not a bare `kind === 'transfer'` string compare (spec 023 FR-019). */
export function isTransfer(tx: Transaction): boolean {
  return tx.kind === 'transfer'
}

/**
 * The two parties of a transfer/reimbursement, centralizing the shape knowledge
 * that was hand-indexed across the ledger row, detail, desktop, and balances
 * (spec 023 FR-019): `from` = the sender/ower paying back (`paid_by`), `to` = the
 * member being reimbursed (`owner_ids[0]`). Either is `null` when unset (a
 * legacy row with no linked person). Only meaningful for a `transfer`.
 */
export function transferParties(tx: Transaction): { from: string | null; to: string | null } {
  return { from: tx.paid_by ?? null, to: tx.owner_ids[0] ?? null }
}

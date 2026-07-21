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

/** The name shown in the ledger's Merchant column: the merchant for an
 *  expense/income, or the sender's name for a reimbursement. Used to sort a
 *  day's rows alphabetically on both the desktop table and the mobile list. */
export function transactionSortName(tx: Transaction, resolveUser: (id: string) => { name: string }): string {
  if (tx.kind === 'transfer') {
    const { from } = transferParties(tx)
    return from ? resolveUser(from).name : ''
  }
  return tx.merchant
}

/** A copy of `items` sorted alphabetically (locale-aware, case-insensitive) by
 *  the displayed name — the within-day order for the ledger. */
export function sortByName<T extends Transaction>(
  items: T[],
  resolveUser: (id: string) => { name: string },
  locale?: string
): T[] {
  return [...items].sort((a, b) =>
    transactionSortName(a, resolveUser).localeCompare(transactionSortName(b, resolveUser), locale, { sensitivity: 'base' })
  )
}

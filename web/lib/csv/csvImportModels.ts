// Draft layer for CSV import. Edits live in session state until the user
// commits — the store is not touched until addTransaction() is called on confirm.
import type { TransactionCategory } from '../types'
import type { ParsedTransaction } from '../../scripts/import/engine/types'

export interface CsvDraftRow {
  id: string
  source: ParsedTransaction
  // mutable fields — start from parsed values, updated by per-row edit:
  merchant: string
  category: TransactionCategory
  amountCents: number
  dateISO: string
  ownerIds: string[]
  splits: Record<string, number> | null
  tags: string[]
  notes: string | null
  // disposition:
  checked: boolean
  isPaymentRow: boolean
  duplicateOf: string | null
  // Explicitly skipped in review (drops out of the list; never imported).
  skipped: boolean
}

export function parsedTransactionToDraft(
  tx: ParsedTransaction,
  duplicateOf: string | null = null,
  defaultOwnerId: string | null = null
): CsvDraftRow {
  const isPaymentRow = tx.excluded && tx.excludeReason === 'card-payment'
  const isExcluded = tx.excluded
  // Seed the owner from the parsed row if present, else the importing user —
  // so every reviewed row already has an owner, just like a hand-entered one.
  const ownerIds =
    tx.ownerIds && tx.ownerIds.length > 0 ? tx.ownerIds : defaultOwnerId ? [defaultOwnerId] : []
  return {
    id: crypto.randomUUID(),
    source: tx,
    merchant: tx.merchant,
    category: tx.category,
    amountCents: tx.amountCents,
    dateISO: tx.dateISO,
    ownerIds,
    splits: tx.splits,
    tags: [],
    notes: null,
    checked: !isExcluded && duplicateOf === null,
    isPaymentRow,
    duplicateOf,
    skipped: false,
  }
}

export function checkedDrafts(drafts: CsvDraftRow[]): CsvDraftRow[] {
  return drafts.filter((d) => d.checked && !d.isPaymentRow)
}

export function totalSpendCents(drafts: CsvDraftRow[]): number {
  return checkedDrafts(drafts).reduce((sum, d) => sum + d.amountCents, 0)
}

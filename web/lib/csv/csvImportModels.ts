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
}

export function parsedTransactionToDraft(
  tx: ParsedTransaction,
  duplicateOf: string | null = null
): CsvDraftRow {
  const isPaymentRow = tx.excluded && tx.excludeReason === 'card-payment'
  const isExcluded = tx.excluded
  return {
    id: crypto.randomUUID(),
    source: tx,
    merchant: tx.merchant,
    category: tx.category,
    amountCents: tx.amountCents,
    dateISO: tx.dateISO,
    ownerIds: tx.ownerIds ?? [],
    splits: tx.splits,
    tags: [],
    notes: null,
    checked: !isExcluded && duplicateOf === null,
    isPaymentRow,
    duplicateOf,
  }
}

export function checkedDrafts(drafts: CsvDraftRow[]): CsvDraftRow[] {
  return drafts.filter((d) => d.checked && !d.isPaymentRow)
}

export function totalSpendCents(drafts: CsvDraftRow[]): number {
  return checkedDrafts(drafts).reduce((sum, d) => sum + d.amountCents, 0)
}

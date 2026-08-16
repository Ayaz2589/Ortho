// Draft layer for CSV import. Edits live in session state until the user
// commits — the store is not touched until addTransaction() is called on confirm.
import type { TransactionCategory } from '../types'
import type { SplitInput } from '../splits'
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
  // spec 053 — who fronted the money. Seeded from the importing person; null for income
  // (income has no payer). Without this an imported statement is invisible to the balance
  // engine no matter how carefully its owners are set.
  paidById: string | null
  // How to split the amount among ownerIds. null = even (the default). The
  // per-row editor sets this to a percent/value split — same vocabulary as the
  // new-transaction form; shares are computed from it on commit (useCsvImport).
  split: SplitInput | null
  // The payment source (a household card name) the transaction is imported to.
  // Seeded from a card matching the bank; '' when no match — flagged "No source"
  // in the list and editable per row.
  paymentSource: string
  tags: string[]
  notes: string | null
  // disposition:
  checked: boolean
  isPaymentRow: boolean
  duplicateOf: string | null
  // Explicitly skipped in review (drops out of the list; never imported).
  skipped: boolean
  // True once the user has changed any editable field from the parsed original
  // (via the row editor or the inline owner picker) — surfaced in the list so
  // reviewed-and-tweaked rows are distinguishable at a glance before commit.
  edited: boolean
}

export function parsedTransactionToDraft(
  tx: ParsedTransaction,
  duplicateOf: string | null = null,
  defaultOwnerIds: string[] = [],
  defaultPayerId: string | null = null,
  defaultSource = ''
): CsvDraftRow {
  const isPaymentRow = tx.excluded && tx.excludeReason === 'card-payment'
  const isExcluded = tx.excluded
  // Seed the owners from the parsed row if present, else the household default —
  // so every reviewed row already has owners, just like a hand-entered one. Since spec 050
  // that default is the whole household (when there is one and the preference is on), so an
  // imported statement produces the same shared ownership a hand-entered transaction would.
  const ownerIds = tx.ownerIds && tx.ownerIds.length > 0 ? tx.ownerIds : defaultOwnerIds
  // A parser-provided split arrives as per-owner percentages; carry it as a
  // percent SplitInput, else default to even (null).
  const split: SplitInput | null =
    tx.splits && Object.keys(tx.splits).length > 0 ? { method: 'percent', percents: tx.splits } : null
  return {
    id: crypto.randomUUID(),
    source: tx,
    merchant: tx.merchant,
    category: tx.category,
    amountCents: tx.amountCents,
    dateISO: tx.dateISO,
    ownerIds,
    paidById: tx.kind === 'income' ? null : defaultPayerId,
    split,
    paymentSource: defaultSource,
    tags: [],
    notes: null,
    checked: !isExcluded && duplicateOf === null,
    isPaymentRow,
    duplicateOf,
    skipped: false,
    edited: false,
  }
}

export function checkedDrafts(drafts: CsvDraftRow[]): CsvDraftRow[] {
  return drafts.filter((d) => d.checked && !d.isPaymentRow)
}

export function totalSpendCents(drafts: CsvDraftRow[]): number {
  return checkedDrafts(drafts).reduce((sum, d) => sum + d.amountCents, 0)
}

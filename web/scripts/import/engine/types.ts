// Shared types for the bank-statement import CLI.
// See specs/004-bank-statement-import/data-model.md and contracts/bank-profile.md.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'

/** Inclusive statement date range, used to resolve MM/DD postings to a full year. */
export interface StatementPeriod {
  start: Date
  end: Date
}

/** One extracted statement line, before it is persisted. */
export interface ParsedTransaction {
  /** Resolved ISO timestamp (noon local) — see engine/dates.ts. */
  dateISO: string
  /** Verbatim joined description (kept for audit + dedupe). */
  rawDescription: string
  /** Cleaned, human-readable merchant. */
  merchant: string
  /** Integer USD cents, >= 0. Sign/kind comes from the section, not the number. */
  amountCents: number
  kind: TransactionKind
  /** Source section name (e.g. "Electronic Payments"). */
  section: string
  /** Suggested category; operator-overridable in review. */
  category: TransactionCategory
  /** Default-flagged non-spending row (still shown in review). */
  excluded: boolean
  /** Why excluded: 'cc-payment' | 'internal-transfer' | 'investment' | 'duplicate' | 'manual' | null. */
  excludeReason: string | null
  /** Probable duplicate of an already-imported row (same day + amount + bank). */
  duplicate: boolean
  /** Resolved Ortho user ids (default = account holder). */
  ownerIds: string[]
  /** Per-owner percent summing to 100; null = even split. */
  splits: Record<string, number> | null
}

/** A statement section with its printed control total for reconciliation. */
export interface ParsedSection {
  name: string
  kind: TransactionKind
  /** The statement's printed `Subtotal:` for this section, in cents. */
  printedSubtotalCents: number
  rows: ParsedTransaction[]
}

/** Per-section reconciliation outcome. */
export interface ReconResult {
  ok: boolean
  sections: Array<{
    name: string
    expectedCents: number
    computedCents: number
    ok: boolean
  }>
}

/** Fully parsed statement, ready for review + persistence. */
export interface ParsedStatement {
  bankId: string
  bankLabel: string
  accountHolder: string
  /** Written verbatim to transactions.source (e.g. "TD Bank"). */
  source: string
  period: StatementPeriod
  sections: ParsedSection[]
  /** False when the source has no printed control total to reconcile against
   *  (e.g. a CSV export). Undefined/true ⇒ subtotal reconciliation is enforced. */
  reconcilable?: boolean
}

/** A pluggable per-bank profile. Adding a bank = one of these + fixtures (FR-027). */
export interface BankProfile {
  id: string
  label: string
  source: string
  /** Fingerprint check against the full extracted text. Pure. */
  detect(text: string): boolean
  /** Parse extracted page text into a ParsedStatement. Pure — no IO, no clock. */
  parse(pages: string[]): ParsedStatement
}

/** Parsed CLI invocation options. */
export interface RunOptions {
  file: string
  bankOverride: string | null
  dryRun: boolean
  assumeYes: boolean
  admin: boolean
}

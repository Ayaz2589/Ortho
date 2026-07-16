// Pure value types for the receipt/statement scan pipeline (spec 021,
// ported from iOS/Ortho-iOS/Services/Scan/ScanModels.swift).
// Contract: specs/021-capacitor-ios-consolidation/data-model.md,
// specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md
//
// These types are the only boundary between extraction (native Vision/PDFKit,
// behind the Scan Capacitor plugin), parsing (deterministic heuristics,
// scanHeuristics.ts/scanParser.ts), inference (scanInference.ts), and the UI.

import type { CurrencyKey } from '../finance/money'
import type { TransactionCategory } from '../types'

/** Same value set as `CurrencyKey` (web/lib/finance/money.ts) — this is the
 *  name data-model.md uses for the scan contract; kept as an alias rather
 *  than a parallel type so the two never drift. */
export type CurrencyCode = CurrencyKey

/** Normalized (0-1) frame, origin top-left — flipped from Vision's
 *  bottom-left convention by the native plugin before crossing the bridge, so
 *  "bottom of the receipt" heuristics work regardless of source resolution. */
export interface NormalizedFrame {
  x: number
  y: number
  width: number
  height: number
}

export interface ScanDocumentTextLine {
  text: string
  frame: NormalizedFrame
}

/** Cell texts, row-major, as detected by structured OCR. */
export interface ScanDocumentTextTable {
  rows: string[][]
}

export interface ScanDocumentTextPage {
  lines: ScanDocumentTextLine[]
  tables: ScanDocumentTextTable[]
}

/** Engine-agnostic text of one capture: one instance per captured photo or
 *  per PDF (containing all its pages). `lines`/`tables` may both be empty
 *  (an unreadable document); no field is ever missing/undefined — absence is
 *  always an empty array. */
export interface ScanDocumentText {
  pages: ScanDocumentTextPage[]
}

/** All lines across pages, in document order. */
export function scanDocumentAllLines(doc: ScanDocumentText): ScanDocumentTextLine[] {
  return doc.pages.flatMap((page) => page.lines)
}

export function isEmptyScanDocument(doc: ScanDocumentText): boolean {
  return doc.pages.every((page) => page.lines.length === 0 && page.tables.length === 0)
}

/** Which prefill fields are inferences (vs. direct extraction). Drives the
 *  "Guessed" affordance in the review UI — cleared per field on first user
 *  edit. merchant (refiner/fallback), category/owners (history + rule
 *  table), currency (FX detection). A confidently-extracted date/amount is
 *  never a guess — but the forgiving fallback tier and the on-device rescue
 *  mark ALL their fields, amount and date included. */
export type GuessedField = 'merchant' | 'category' | 'owners' | 'currency' | 'amount' | 'date'

export type ParsedCandidateDirection = 'debit' | 'credit' // debit prefills as expense, credit as income (flippable)

/** Calendar day only (year/month/day) — ported from Swift's `DateComponents?`. */
export interface PartialDate {
  year: number
  month: number
  day: number
}

/** One potential transaction extracted from a capture. */
export interface ParsedCandidate {
  id: string
  /** Merchant text as read (after processor-prefix/store-number cleanup). */
  merchantRaw: string
  /** Display merchant: the household's own spelling when history matches,
   *  otherwise `merchantRaw` (the optional on-device refiner may clean it). */
  merchant: string
  /** `null` = leave the form's default — never a fabricated date. */
  date: PartialDate | null
  /** Minor units of `currency` (USD cents when `currency === 'usd'`). Always
   *  > 0; `direction` carries the sign. Foreign candidates keep the printed
   *  amount here and in `originalAmount` — the FORM derives USD via the
   *  existing conversion, never the parser. */
  amountCents: number
  direction: ParsedCandidateDirection
  currency: CurrencyCode
  /** Non-null iff `currency !== 'usd'`; the printed total in that currency,
   *  as a decimal string (ported from Swift's `Decimal?`). */
  originalAmount: string | null
  /** Card-payment/transfer statement row — default-skipped, never an
   *  expense prefill. */
  isPaymentRow: boolean
  guesses: Set<GuessedField>
  /** `null` = the form's manual default stands. */
  categoryGuess: TransactionCategory | null
  /** Owners of the most recent matching history transaction; split method
   *  stays the form's default (even) — custom split guessing is out of scope. */
  ownersGuess: string[] | null
  /** At most one claimed existing transaction. */
  duplicateOf: string | null
}

/** Outcome of parsing one capture — ported from Swift's enum. */
export type ScanParseResult =
  | { kind: 'receipt'; candidate: ParsedCandidate } // single confident grand total — prefill the open form in place
  | { kind: 'statement'; candidates: ParsedCandidate[] } // ordered transaction rows (1+) — statement interstitial + wizard
  | { kind: 'none' } // nothing parseable — calm failure copy + Retake

/** The household's past behavior with one merchant, pre-aggregated so the
 *  parser stays pure (no Transaction traversal inside the pipeline). */
export interface MerchantHistory {
  /** Normalized key — see `scanHeuristics.normalizeMerchant`. */
  normalizedMerchant: string
  /** The household's own display spelling (most recent). */
  displayMerchant: string
  /** Dominant past category (most frequent; ties → most recent). */
  category: TransactionCategory
  count: number
  /** Day of the most recent matching transaction (recency tie-break). */
  lastDay: PartialDate | null
  /** Owners of the most recent matching transaction. */
  owners: string[]
}

/** Existing-transaction shadow used for duplicate matching. */
export interface ExistingTransactionDay {
  id: string
  /** Local calendar day (year/month/day). */
  day: PartialDate
  amountCents: number
}

/** Everything the parser needs from the outside world, injected (never the
 *  real clock, never live collections — constitution VI / contract §purity). */
export interface ScanContext {
  /** Calendar day standing in for "now" — year inference fallback only. */
  referenceDay: PartialDate
  defaultCurrency: CurrencyCode
  merchantHistory: MerchantHistory[]
  existingTransactionDays: ExistingTransactionDay[]
}

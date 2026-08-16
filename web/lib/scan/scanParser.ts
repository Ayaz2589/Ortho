// ScanDocumentText -> ScanParseResult. Pure and deterministic: same document +
// same context => identical result (spec 021, ported from
// iOS/Ortho-iOS/Services/Scan/ScanParser.swift).
// Contract: specs/021-capacitor-ios-consolidation/data-model.md,
// specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md
//
// Detection order (research R5 + the post-T037/T041 forgiving tiers) is
// binding:
//   1. >=3 one-line transaction rows  -> statement
//   2. >=3 STACKED app-list rows      -> statement (a photographed banking
//                                        app/website spreads each transaction
//                                        over 2-3 OCR lines; runs BEFORE the
//                                        grand-total tier so a "Total balance"
//                                        header can't turn a list into one
//                                        receipt)
//   3. confident labeled grand total  -> receipt
//   4. 1-2 transaction rows           -> statement (a one-row wizard is still
//                                        a correct, reviewable outcome)
//   5. any money-shaped text          -> best-effort receipt, every field
//                                        Guessed (wrong guesses are cheap —
//                                        review-before-add exists for exactly
//                                        this; refusing to guess is the worse
//                                        failure)
//   6. otherwise                      -> none (calm failure copy)
//
// Every candidate is finished off by scanInference.ts's `enrichCandidate`
// (household merchant-history matching + greedy duplicate-transaction
// claiming against `ScanContext`) — a single `claimed` Set is created once
// per `parseScan` call and threaded through every candidate-construction
// path below, so duplicate claiming stays one-to-one across an entire
// statement, not just within one row-building function.

import {
  cleanMerchant,
  firstFullDate,
  fullDate,
  bareDate,
  grandTotal,
  isPaymentRow as heuristicIsPaymentRow,
  stackedRows,
  statementPeriod,
  statementRow,
  statementRowFromCells,
  strongestAmount,
  resolveDay,
  type AmountToken,
  type StatementRow,
} from './scanHeuristics'
import { enrichCandidate } from './scanInference'
import { fractionDigits } from '../finance/currency'
import type {
  CurrencyCode,
  GuessedField,
  PartialDate,
  ParsedCandidate,
  ScanContext,
  ScanDocumentText,
  ScanParseResult,
} from './scanModels'
import { isEmptyScanDocument } from './scanModels'

// ---------------------------------------------------------------------------
// Candidate id — same convention as web/lib/store.tsx's local `uuid()`.
// ---------------------------------------------------------------------------

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function decimalAmountString(minorUnits: number, currency: CurrencyCode): string {
  const digits = fractionDigits(currency)
  return (minorUnits / Math.pow(10, digits)).toFixed(digits)
}

// ---------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------

function baseCandidate(params: {
  merchantRaw: string
  date: PartialDate | null
  amountCents: number
  negative: boolean
  currency: CurrencyCode
  isPaymentRow: boolean
}): ParsedCandidate {
  const guesses = new Set<GuessedField>()
  let originalAmount: string | null = null
  if (params.currency !== 'usd') {
    originalAmount = decimalAmountString(params.amountCents, params.currency)
    guesses.add('currency')
  }
  return {
    id: makeId(),
    merchantRaw: params.merchantRaw,
    merchant: params.merchantRaw,
    date: params.date,
    amountCents: params.amountCents,
    direction: params.negative ? 'credit' : 'debit',
    currency: params.currency,
    originalAmount,
    isPaymentRow: params.isPaymentRow,
    guesses,
    categoryGuess: null,
    ownersGuess: null,
    paidByGuess: null,
    duplicateOf: null,
  }
}

// ---------------------------------------------------------------------------
// Statement path
// ---------------------------------------------------------------------------

/** Rows in document order. Structured OCR may surface the same content as
 *  both a table and transcript lines — per page, whichever view yields more
 *  rows wins (never both, so nothing double-counts). */
function statementRowsFromDocument(document: ScanDocumentText, defaultCurrency: CurrencyCode): StatementRow[] {
  const rows: StatementRow[] = []
  for (const page of document.pages) {
    const fromLines = page.lines
      .map((entry) => statementRow(entry.text, defaultCurrency))
      .filter((row): row is StatementRow => row !== null)
    const fromTables = page.tables.flatMap((table) =>
      table.rows
        .map((cells) => statementRowFromCells(cells, defaultCurrency))
        .filter((row): row is StatementRow => row !== null)
    )
    rows.push(...(fromTables.length > fromLines.length ? fromTables : fromLines))
  }
  return rows
}

function candidatesFromRows(
  rows: StatementRow[],
  period: { start: PartialDate; end: PartialDate } | null,
  context: ScanContext,
  claimed: Set<string>
): ParsedCandidate[] {
  const out: ParsedCandidate[] = []
  for (const row of rows) {
    if (row.amount.minorUnits <= 0) continue // zero rows are noise
    const merchantRaw = cleanMerchant(row.description)
    if (!merchantRaw) continue
    const day = resolveDay(row.month, row.day, period, context.referenceDay)
    const candidate = baseCandidate({
      merchantRaw,
      date: day,
      amountCents: row.amount.minorUnits,
      negative: row.amount.negative,
      currency: row.amount.currency ?? context.defaultCurrency,
      isPaymentRow: heuristicIsPaymentRow(merchantRaw),
    })
    out.push(enrichCandidate(candidate, context, claimed))
  }
  return out
}

// ---------------------------------------------------------------------------
// Receipt path
// ---------------------------------------------------------------------------

function receiptCandidate(
  total: AmountToken,
  lineTexts: string[],
  context: ScanContext,
  claimed: Set<string>
): ParsedCandidate {
  const merchantRaw = cleanMerchant(merchantLine(lineTexts) ?? '')
  const candidate = baseCandidate({
    merchantRaw,
    date: firstFullDate(lineTexts),
    amountCents: Math.abs(total.minorUnits),
    negative: total.negative,
    currency: total.currency ?? context.defaultCurrency,
    isPaymentRow: false,
  })
  return enrichCandidate(candidate, context, claimed)
}

// ---------------------------------------------------------------------------
// Forgiving fallback (tier 5, post-T037 device feedback)
// ---------------------------------------------------------------------------

/** Real-world captures — web-banking screenshots, crumpled receipts with a
 *  garbled TOTAL line — often defeat tiers 1-3 while the OCR text is
 *  perfectly readable. If the text still contains a money-shaped amount,
 *  prefill best-effort instead of failing: strongest amount, top plausible
 *  merchant line, any full date — every field marked Guessed so the
 *  review-before-add affordances carry the risk. */
function fallbackCandidate(
  lineTexts: string[],
  context: ScanContext,
  claimed: Set<string>
): ParsedCandidate | null {
  const amount = strongestAmount(lineTexts, context.defaultCurrency)
  if (!amount) return null
  const merchantRaw = cleanMerchant(merchantLine(lineTexts) ?? '')
  const candidate = baseCandidate({
    merchantRaw,
    date: firstFullDate(lineTexts),
    amountCents: Math.abs(amount.minorUnits),
    negative: amount.negative,
    currency: amount.currency ?? context.defaultCurrency,
    isPaymentRow: false,
  })
  candidate.guesses.add('amount')
  if (merchantRaw) candidate.guesses.add('merchant')
  if (candidate.date !== null) candidate.guesses.add('date')
  return enrichCandidate(candidate, context, claimed)
}

/** The merchant is the top-most line that reads like a name: at least three
 *  letters (a status bar's "5G" or "87" never qualifies), isn't a date line,
 *  isn't just an amount. */
function merchantLine(lineTexts: string[]): string | null {
  for (const text of lineTexts) {
    const trimmed = text.trim()
    const letters = (trimmed.match(/\p{L}/gu) ?? []).length
    if (letters < 3) continue
    if (fullDate(trimmed) !== null) continue
    if (bareDate(trimmed) !== null) continue
    if (/^[-$€£¥0-9.,\s]+$/.test(trimmed)) continue
    return trimmed
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseScan(document: ScanDocumentText, context: ScanContext): ScanParseResult {
  if (isEmptyScanDocument(document)) return { kind: 'none' }

  // Structured OCR may hive tabular regions (a receipt's item list, a
  // statement's rows) into tables and keep only the rest as transcript
  // lines — so text searches (period, merchant, grand total) see BOTH, in
  // per-page document order.
  const texts = document.pages.flatMap((page) => [
    ...page.lines.map((entry) => entry.text),
    ...page.tables.flatMap((table) => table.rows.map((cells) => cells.join('  '))),
  ])
  const period = statementPeriod(texts)
  const rows = statementRowsFromDocument(document, context.defaultCurrency)
  // Each tier below is a SEPARATE, speculative attempt — only one tier's
  // candidates are ever actually returned, so each gets its own fresh
  // `claimed` Set. Sharing one Set across tiers would let a discarded tier's
  // candidates consume duplicate-claims that the tier actually returned
  // should have gotten instead.
  //
  // Arbitrate on USABLE candidates, not raw row matches — 3 zero-amount fee
  // rows must not suppress a labeled receipt total or produce an empty
  // statement([]) interstitial.
  const rowCandidates = rows.length === 0 ? [] : candidatesFromRows(rows, period, context, new Set())

  if (rowCandidates.length >= 3) {
    return { kind: 'statement', candidates: rowCandidates }
  }

  // Stacked app-list rows demand strong evidence (>=3 usable rows, each with
  // its OWN claimed date line) precisely because they outrank the
  // grand-total tier; receipts never produce per-row bare-date lines.
  // Transcript lines ONLY — structured tables are already segmented (and may
  // duplicate the transcript, which would double-count).
  const stackedSource = document.pages.flatMap((page) => page.lines.map((entry) => entry.text))
  const stacked = stackedRows(stackedSource, context.defaultCurrency)
  if (stacked.length >= 3) {
    const stackedCandidates = candidatesFromRows(stacked, period, context, new Set())
    if (stackedCandidates.length >= 3) {
      return { kind: 'statement', candidates: stackedCandidates }
    }
  }

  const total = grandTotal(texts, context.defaultCurrency)
  if (total) {
    return { kind: 'receipt', candidate: receiptCandidate(total, texts, context, new Set()) }
  }

  if (rowCandidates.length > 0) {
    return { kind: 'statement', candidates: rowCandidates }
  }

  const fallback = fallbackCandidate(texts, context, new Set())
  if (fallback) {
    return { kind: 'receipt', candidate: fallback }
  }

  return { kind: 'none' }
}

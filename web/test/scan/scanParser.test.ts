// Tests for the ScanParser tiered receipt-vs-statement decision (spec 021,
// ported from iOS/Ortho-iOSTests/ScanParserTests.swift).
//
// Detection order under test (research R5 + the forgiving tiers), binding:
//   1. >=3 one-line transaction rows  -> statement
//   2. >=3 STACKED app-list rows      -> statement
//   3. confident labeled grand total  -> receipt
//   4. 1-2 transaction rows           -> statement
//   5. any money-shaped text          -> best-effort receipt, every field Guessed
//   6. otherwise                      -> none
//
// Two cases (testNoSignalLeavesCategoryNil, testFallbackReceiptWhenNoTotalLabel,
// testFallbackNeedsMoneyShapedText) are transliterated near-verbatim from
// ScanParserTests.swift because they hand-construct their ScanDocumentText and
// ScanContext (no PNG/PDF fixture) and never touch merchant-history matching or
// duplicate-transaction claiming, so they're portable now. The remaining tiers
// are self-authored cases against the tier table above (still TDD, grounded in
// ScanParser.swift's decision logic, not a transliteration).
//
// Deliberately NOT ported here: testWithinBatchTwinsBothSurvive (duplicate
// claiming) and testHistoryTierBeatsRuleTable (merchant-history matching) —
// both depend on ScanInference.swift's logic, which is out of scope for this
// step (see scanParser.ts's file header) and lands with web/lib/scan/scanInference.ts
// in a later port step.

import { describe, expect, it } from 'vitest'
import { parseScan } from '../../lib/scan/scanParser'
import type { NormalizedFrame, ScanContext, ScanDocumentText, ScanDocumentTextLine } from '../../lib/scan/scanModels'

const ZERO_FRAME: NormalizedFrame = { x: 0, y: 0, width: 0, height: 0 }

function line(text: string): ScanDocumentTextLine {
  return { text, frame: ZERO_FRAME }
}

function docFromLines(lines: string[]): ScanDocumentText {
  return { pages: [{ lines: lines.map(line), tables: [] }] }
}

function baseContext(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    referenceDay: { year: 2026, month: 7, day: 3 },
    defaultCurrency: 'usd',
    merchantHistory: [],
    existingTransactionDays: [],
    ...overrides,
  }
}

describe('parseScan', () => {
  describe('empty document', () => {
    it('returns none for a document with no pages', () => {
      const result = parseScan({ pages: [] }, baseContext())
      expect(result).toEqual({ kind: 'none' })
    })

    it('returns none for a document whose pages have no lines or tables', () => {
      const doc: ScanDocumentText = { pages: [{ lines: [], tables: [] }] }
      const result = parseScan(doc, baseContext())
      expect(result).toEqual({ kind: 'none' })
    })
  })

  describe('tier 1: >=3 one-line statement rows -> statement', () => {
    it('parses three one-line rows in document order, resolving the year from the period and skipping category/guesses on a flagged payment row', () => {
      const doc = docFromLines([
        'STATEMENT PERIOD 06/01/2026 - 06/30/2026',
        '06/05  UBER TRIP  $18.50',
        '06/06  LYFT RIDE  $12.00',
        '06/07  ONLINE PAYMENT - THANK YOU  $500.00 CR',
      ])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('statement')
      if (result.kind !== 'statement') throw new Error('expected statement')
      expect(result.candidates).toHaveLength(3)

      const [uber, lyft, payment] = result.candidates
      expect(uber.merchant).toBe('UBER TRIP')
      expect(uber.date).toEqual({ year: 2026, month: 6, day: 5 })
      expect(uber.amountCents).toBe(1850)
      expect(uber.direction).toBe('debit')
      expect(uber.currency).toBe('usd')
      expect(uber.originalAmount).toBeNull()
      expect(uber.isPaymentRow).toBe(false)
      expect(uber.categoryGuess).toBe('transit')
      expect(uber.guesses.has('category')).toBe(true)

      expect(lyft.merchant).toBe('LYFT RIDE')
      expect(lyft.date).toEqual({ year: 2026, month: 6, day: 6 })
      expect(lyft.amountCents).toBe(1200)
      expect(lyft.categoryGuess).toBe('transit')

      expect(payment.merchant).toBe('ONLINE PAYMENT - THANK YOU')
      expect(payment.date).toEqual({ year: 2026, month: 6, day: 7 })
      expect(payment.amountCents).toBe(50000)
      expect(payment.direction).toBe('credit')
      expect(payment.isPaymentRow).toBe(true)
      expect(payment.categoryGuess).toBeNull()
      expect(payment.guesses.size).toBe(0)
    })
  })

  describe('tier 2: >=3 stacked app-list rows -> statement', () => {
    it('reconstructs stacked cells into statement candidates and never lets the balance header become a row', () => {
      const doc = docFromLines([
        'Activity',
        'Total balance  $612.45',
        'UBER TRIP HELP.UBER.COM  $24.51',
        'Jul 1',
        'STARBUCKS COFFEE #1234  $6.45',
        'Jun 30',
        'NETFLIX.COM  $22.99',
        'Jun 27',
      ])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('statement')
      if (result.kind !== 'statement') throw new Error('expected statement')
      expect(result.candidates).toHaveLength(3)

      expect(result.candidates.some((c) => c.amountCents === 61245)).toBe(false)

      const [uber, starbucks, netflix] = result.candidates
      expect(uber.merchant).toBe('UBER TRIP HELP.UBER.COM')
      expect(uber.date).toEqual({ year: 2026, month: 7, day: 1 })
      expect(uber.amountCents).toBe(2451)

      expect(starbucks.merchant).toBe('STARBUCKS COFFEE')
      expect(starbucks.date).toEqual({ year: 2026, month: 6, day: 30 })
      expect(starbucks.amountCents).toBe(645)

      expect(netflix.merchant).toBe('NETFLIX.COM')
      expect(netflix.date).toEqual({ year: 2026, month: 6, day: 27 })
      expect(netflix.amountCents).toBe(2299)
    })
  })

  describe('tier 3: confident labeled total -> receipt', () => {
    // Near-verbatim port of ScanParserTests.swift's testNoSignalLeavesCategoryNil.
    it('prefers a labeled total over sparse rows/stacked evidence, leaving categoryGuess nil when nothing matches', () => {
      const doc = docFromLines(['CORNER PLACE', '07/01/2026', 'TOTAL  $12.00'])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('receipt')
      if (result.kind !== 'receipt') throw new Error('expected receipt')
      const { candidate } = result
      expect(candidate.categoryGuess).toBeNull()
      expect(candidate.guesses.size).toBe(0)
      expect(candidate.merchant).toBe('CORNER PLACE')
      expect(candidate.merchantRaw).toBe('CORNER PLACE')
      expect(candidate.date).toEqual({ year: 2026, month: 7, day: 1 })
      expect(candidate.amountCents).toBe(1200)
      expect(candidate.direction).toBe('debit')
      expect(candidate.isPaymentRow).toBe(false)
    })

    it('carries a foreign-currency total into originalAmount and marks currency as a guess', () => {
      const doc = docFromLines(['CAFE PARIS', '01/07/2026', 'TOTAL  EUR 23,50'])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('receipt')
      if (result.kind !== 'receipt') throw new Error('expected receipt')
      const { candidate } = result
      expect(candidate.merchant).toBe('CAFE PARIS')
      expect(candidate.currency).toBe('eur')
      expect(candidate.amountCents).toBe(2350)
      expect(candidate.originalAmount).toBe('23.50')
      expect(candidate.guesses.has('currency')).toBe(true)
      expect(candidate.date).toEqual({ year: 2026, month: 1, day: 7 })
    })
  })

  // Integration coverage for the scanInference.ts wiring (the "SCOPED
  // PLACEHOLDER" scanParser.ts's file header used to describe): every path
  // that builds a candidate (candidatesFromRows / receiptCandidate /
  // fallbackCandidate) must run it through the REAL enrichCandidate from
  // scanInference.ts, not just the category rule table. These are the two
  // cases scanParser.test.ts's own header names as "deliberately not ported
  // here... lands with scanInference.ts in a later port step" — this is that
  // later step, closing the loop.
  describe('scanInference wiring (history + duplicate claiming, through parseScan)', () => {
    it('adopts the household spelling/category from merchant history on a receipt candidate', () => {
      // cleanMerchant strips the "TST* " processor prefix and the 5-digit
      // store-number run, leaving "BLUE BOTTLE" -> normalizeMerchant
      // "BLUEBOTTLE" — the history key a real buildScanContext() would have
      // stored from a past "Blue Bottle" transaction.
      const doc = docFromLines(['TST* BLUE BOTTLE 04722', '07/01/2026', 'TOTAL  $6.50'])
      const ctx = baseContext({
        merchantHistory: [
          {
            normalizedMerchant: 'BLUEBOTTLE',
            displayMerchant: 'Blue Bottle',
            category: 'coffee',
            count: 5,
            lastDay: { year: 2026, month: 6, day: 20 },
            owners: ['person-1'],
          },
        ],
      })
      const result = parseScan(doc, ctx)
      expect(result.kind).toBe('receipt')
      if (result.kind !== 'receipt') throw new Error('expected receipt')
      expect(result.candidate.merchant).toBe('Blue Bottle')
      expect(result.candidate.categoryGuess).toBe('coffee')
      expect(result.candidate.ownersGuess).toEqual(['person-1'])
      expect(result.candidate.guesses.has('category')).toBe(true)
    })

    it('claims a same-day/same-amount existing transaction as a duplicate on a receipt candidate', () => {
      const doc = docFromLines(['CORNER PLACE', '07/01/2026', 'TOTAL  $12.00'])
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 }],
      })
      const result = parseScan(doc, ctx)
      expect(result.kind).toBe('receipt')
      if (result.kind !== 'receipt') throw new Error('expected receipt')
      expect(result.candidate.duplicateOf).toBe('existing-1')
    })

    it('claims each existing row at most once across a statement — within-batch twins are not duplicates of each other', () => {
      const doc = docFromLines([
        'STATEMENT PERIOD 06/01/2026 - 06/30/2026',
        '06/05  UBER TRIP  $18.50',
        '06/06  UBER TRIP  $18.50',
        '06/07  UBER TRIP  $18.50',
      ])
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 6, day: 5 }, amountCents: 1850 }],
      })
      const result = parseScan(doc, ctx)
      expect(result.kind).toBe('statement')
      if (result.kind !== 'statement') throw new Error('expected statement')
      const claimedCount = result.candidates.filter((c) => c.duplicateOf === 'existing-1').length
      expect(claimedCount).toBe(1)
    })
  })

  describe('tier 4: 1-2 transaction rows -> statement', () => {
    it('still produces a one-row statement when there is no labeled total to compete with', () => {
      const doc = docFromLines(['STATEMENT PERIOD 06/01/2026 - 06/30/2026', '06/05  UBER TRIP  $18.50'])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('statement')
      if (result.kind !== 'statement') throw new Error('expected statement')
      expect(result.candidates).toHaveLength(1)
      const [candidate] = result.candidates
      expect(candidate.merchant).toBe('UBER TRIP')
      expect(candidate.date).toEqual({ year: 2026, month: 6, day: 5 })
      expect(candidate.amountCents).toBe(1850)
      expect(candidate.direction).toBe('debit')
    })
  })

  describe('tier 5: forgiving best-effort fallback -> receipt', () => {
    // Near-verbatim port of ScanParserTests.swift's testFallbackReceiptWhenNoTotalLabel.
    it('prefills best-effort from a currency-marked amount when no TOTAL label exists, marking merchant/amount/date as guesses', () => {
      const doc = docFromLines(['CORNER STORE', '07/01/2026', 'SNACK  3.25', '$9.75', 'CASH  20.00'])
      const result = parseScan(doc, baseContext())
      expect(result.kind).toBe('receipt')
      if (result.kind !== 'receipt') throw new Error('expected fallback receipt')
      const { candidate } = result
      expect(candidate.amountCents).toBe(975)
      expect(candidate.merchant).toBe('CORNER STORE')
      expect(candidate.date).toEqual({ year: 2026, month: 7, day: 1 })
      expect(candidate.direction).toBe('debit')
      expect(candidate.guesses).toEqual(new Set(['merchant', 'amount', 'date']))
    })
  })

  describe('tier 6: no money-shaped text anywhere -> none', () => {
    // Near-verbatim port of ScanParserTests.swift's testFallbackNeedsMoneyShapedText.
    it('never invents an amount from bare, non-money-shaped numbers', () => {
      const doc = docFromLines(['HELLO WORLD', 'JUST SOME WORDS 42'])
      const result = parseScan(doc, baseContext())
      expect(result).toEqual({ kind: 'none' })
    })
  })

  describe('purity', () => {
    it('produces field-identical results (aside from the per-call id) for the same document and context', () => {
      const doc = docFromLines(['CORNER PLACE', '07/01/2026', 'TOTAL  $12.00'])
      const context = baseContext()
      const first = parseScan(doc, context)
      const second = parseScan(doc, context)
      if (first.kind !== 'receipt' || second.kind !== 'receipt') throw new Error('expected receipt')
      const { id: _idA, ...restA } = first.candidate
      const { id: _idB, ...restB } = second.candidate
      expect(restA).toEqual(restB)
    })
  })
})

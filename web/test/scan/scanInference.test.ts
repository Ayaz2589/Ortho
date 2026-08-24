// Tests for ScanInference — history/category inference and duplicate
// claiming (spec 021, ported from
// iOS/Ortho-iOS/Services/Scan/ScanInference.swift).
//
// `testHistoryTierBeatsRuleTable` and `testWithinBatchTwinsBothSurvive` are
// near-verbatim ports of the two ScanInference-shaped cases in
// ScanParserTests.swift that hand-construct their `ScanContext` (no
// PNG/PDF fixture), but exercised here directly through `enrichCandidate`
// rather than through the full `ScanParser.parse` pipeline (this port's
// scope is ScanInference only — see scanInference.ts's file header). The
// remaining cases are self-authored, grounded in ScanInference.swift's
// documented rules: minimum-4-char matching, prefix bridging in both
// directions, dominant-count-then-recency ranking, payment/credit rows never
// guessing, and single-currency (USD-only) duplicate claiming.
//
// `buildScanContext` has no Swift unit-test analogue (ScanInference.swift's
// `buildContext` is only exercised indirectly, from `AppState`, in the app)
// — those cases are self-authored against the documented contract: grouped
// by normalized merchant from EXPENSE transactions only, dominant category
// by count then recency, display spelling/owners from the most recent
// transaction in the group (canonicalized via `orderedOwnerIds`), and
// `existingTransactionDays` covering every transaction regardless of kind.

import { describe, expect, it } from 'vitest'
import { buildScanContext, enrichCandidate } from '../../lib/scan/scanInference'
import type { MerchantHistory, ParsedCandidate, ScanContext } from '../../lib/scan/scanModels'
import type { Transaction } from '../../lib/types'

function candidate(overrides: Partial<ParsedCandidate> = {}): ParsedCandidate {
  return {
    id: 'candidate-id',
    merchantRaw: 'CORNER PLACE',
    merchant: 'CORNER PLACE',
    date: { year: 2026, month: 7, day: 1 },
    amountCents: 1200,
    direction: 'debit',
    currency: 'usd',
    originalAmount: null,
    isPaymentRow: false,
    guesses: new Set(),
    categoryGuess: null,
    ownersGuess: null,
    paidByGuess: null,
    duplicateOf: null,
    ...overrides,
  }
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

function history(overrides: Partial<MerchantHistory> = {}): MerchantHistory {
  return {
    normalizedMerchant: 'NETFLIX',
    displayMerchant: 'Netflix',
    category: 'entertainment',
    count: 5,
    lastDay: { year: 2026, month: 6, day: 1 },
    owners: [],
    paidBy: null,
    ...overrides,
  }
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-id',
    household_id: 'household-1',
    merchant: 'Trader Joe\'s',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 1000,
    source: 'manual',
    date: '2026-06-05T12:00:00.000Z',
    created_by: 'user-1',
    created_at: '2026-06-05T12:00:00.000Z',
    updated_at: '2026-06-05T12:00:00.000Z',
    owner_ids: [],
    shares: {},
    ...overrides,
  }
}

describe('enrichCandidate', () => {
  describe('category/owners inference', () => {
    // Near-verbatim port of ScanParserTests.swift's testHistoryTierBeatsRuleTable.
    it('adopts the household spelling/category/owners from history, outranking the rule table', () => {
      const owner = 'owner-1'
      const ctx = baseContext({
        merchantHistory: [
          history({
            normalizedMerchant: 'NETFLIX',
            displayMerchant: 'Netflix',
            category: 'entertainment', // deliberately NOT the rule table's 'subs'
            owners: [owner],
            paidBy: null,
          }),
        ],
      })
      const c = candidate({ merchantRaw: 'NETFLIX.COM', merchant: 'NETFLIX.COM' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.categoryGuess).toBe('entertainment')
      expect(result.merchant).toBe('Netflix')
      expect(result.ownersGuess).toEqual([owner])
      expect(result.guesses).toEqual(new Set(['category', 'owners']))
    })

    it('falls back to the rule table when no history entry matches', () => {
      const c = candidate({ merchantRaw: 'STARBUCKS #552', merchant: 'STARBUCKS #552' })
      const result = enrichCandidate(c, baseContext(), new Set())
      expect(result.categoryGuess).toBe('coffee')
      expect(result.merchant).toBe('STARBUCKS #552') // rule table never touches spelling
      expect(result.ownersGuess).toBeNull()
      expect(result.guesses).toEqual(new Set(['category']))
    })

    // Near-verbatim port of ScanParserTests.swift's testNoSignalLeavesCategoryNil,
    // exercised at the enrichCandidate level.
    it('leaves categoryGuess null when neither history nor the rule table match', () => {
      const c = candidate({ merchantRaw: 'CORNER PLACE', merchant: 'CORNER PLACE' })
      const result = enrichCandidate(c, baseContext(), new Set())
      expect(result.categoryGuess).toBeNull()
      expect(result.guesses.size).toBe(0)
      expect(result.merchant).toBe('CORNER PLACE')
    })

    it('never guesses for a payment row, even when the merchant matches history', () => {
      const ctx = baseContext({ merchantHistory: [history()] })
      const c = candidate({ merchantRaw: 'NETFLIX.COM', isPaymentRow: true })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.categoryGuess).toBeNull()
      expect(result.ownersGuess).toBeNull()
      expect(result.guesses.size).toBe(0)
      expect(result.merchant).toBe(c.merchant) // spelling not adopted either
    })

    it('never guesses for a credit (income locks its own category)', () => {
      const ctx = baseContext({ merchantHistory: [history()] })
      const c = candidate({ merchantRaw: 'NETFLIX.COM', direction: 'credit' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.categoryGuess).toBeNull()
      expect(result.guesses.size).toBe(0)
    })

    it('does not add an owners guess when the matched history entry has no owners', () => {
      const ctx = baseContext({ merchantHistory: [history({ owners: [] })] })
      const c = candidate({ merchantRaw: 'NETFLIX.COM' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.categoryGuess).toBe('entertainment')
      expect(result.ownersGuess).toBeNull()
      expect(result.guesses).toEqual(new Set(['category']))
    })

    it('matches when the candidate merchant is a longer, OCR-noisy superstring of the stored key', () => {
      const ctx = baseContext({
        merchantHistory: [history({ normalizedMerchant: 'TRADERJOES', displayMerchant: "Trader Joe's" })],
      })
      const c = candidate({ merchantRaw: 'TRADER JOES NEW YORK' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.merchant).toBe("Trader Joe's")
    })

    it('matches when the stored key is a longer superstring of the candidate merchant', () => {
      const ctx = baseContext({
        merchantHistory: [
          history({ normalizedMerchant: 'TRADERJOESNEWYORK', displayMerchant: "Trader Joe's New York" }),
        ],
      })
      const c = candidate({ merchantRaw: 'TRADER JOES' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.merchant).toBe("Trader Joe's New York")
    })

    it('never matches on a normalized candidate key shorter than 4 characters', () => {
      // A history entry keyed "CVS" (3 chars) must never match — even though
      // the rule table separately recognizes "CVS" and still fires.
      const ctx = baseContext({
        merchantHistory: [history({ normalizedMerchant: 'CVS', displayMerchant: 'CVS (should not be adopted)' })],
      })
      const c = candidate({ merchantRaw: 'CVS', merchant: 'CVS' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.merchant).toBe('CVS') // history spelling never adopted (too short to match)
      expect(result.categoryGuess).toBe('pharmacy') // rule table still fires independently
      expect(result.ownersGuess).toBeNull()
    })

    it('never matches a history entry whose own key is shorter than 4 characters', () => {
      const ctx = baseContext({ merchantHistory: [history({ normalizedMerchant: 'CVS', displayMerchant: 'CVS' })] })
      const c = candidate({ merchantRaw: 'CVS PHARMACY', merchant: 'CVS PHARMACY' })
      const result = enrichCandidate(c, ctx, new Set())
      // The rule table still matches "PHARMACY" independently of history.
      expect(result.categoryGuess).toBe('pharmacy')
      expect(result.merchant).toBe('CVS PHARMACY') // history spelling never adopted
    })

    it('prefers the dominant (higher-count) history entry over a more recent low-count one', () => {
      const ctx = baseContext({
        merchantHistory: [
          history({
            normalizedMerchant: 'AMAZONMKTPLACE',
            displayMerchant: 'Amazon (low count, more recent)',
            category: 'entertainment',
            count: 1,
            lastDay: { year: 2026, month: 7, day: 2 },
          }),
          history({
            normalizedMerchant: 'AMAZON',
            displayMerchant: 'Amazon (dominant)',
            category: 'groceries',
            count: 9,
            lastDay: { year: 2026, month: 1, day: 1 },
          }),
        ],
      })
      const c = candidate({ merchantRaw: 'AMAZON MKTPLACE' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.merchant).toBe('Amazon (dominant)')
      expect(result.categoryGuess).toBe('groceries')
    })

    it('breaks an equal-count tie by recency (the more recent entry wins)', () => {
      const ctx = baseContext({
        merchantHistory: [
          history({
            normalizedMerchant: 'AMAZONMKTPLACE',
            displayMerchant: 'Amazon (older)',
            count: 3,
            lastDay: { year: 2026, month: 1, day: 1 },
          }),
          history({
            normalizedMerchant: 'AMAZON',
            displayMerchant: 'Amazon (newer)',
            count: 3,
            lastDay: { year: 2026, month: 6, day: 15 },
          }),
        ],
      })
      const c = candidate({ merchantRaw: 'AMAZON MKTPLACE' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.merchant).toBe('Amazon (newer)')
    })
  })

  describe('duplicate claiming', () => {
    it('claims an existing transaction with the same calendar day and amount', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 }],
      })
      const c = candidate()
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.duplicateOf).toBe('existing-1')
    })

    it('does not claim when the amount differs', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 999 }],
      })
      const result = enrichCandidate(candidate(), ctx, new Set())
      expect(result.duplicateOf).toBeNull()
    })

    it('does not claim when the day differs', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 2 }, amountCents: 1200 }],
      })
      const result = enrichCandidate(candidate(), ctx, new Set())
      expect(result.duplicateOf).toBeNull()
    })

    it('never claims when the candidate has no date', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 }],
      })
      const result = enrichCandidate(candidate({ date: null }), ctx, new Set())
      expect(result.duplicateOf).toBeNull()
    })

    it('never claims a non-USD candidate (foreign totals are not comparable to stored USD cents)', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 }],
      })
      const c = candidate({ currency: 'eur' })
      const result = enrichCandidate(c, ctx, new Set())
      expect(result.duplicateOf).toBeNull()
    })

    // Near-verbatim port of ScanParserTests.swift's testWithinBatchTwinsBothSurvive,
    // exercised directly against enrichCandidate with a shared `claimed` set
    // (the role ScanParser.parse plays in Swift, iterating candidates in order).
    it('claims each existing row at most once across a shared session — within-batch twins are not duplicates of each other', () => {
      const ctx = baseContext({
        existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 6, day: 5 }, amountCents: 1850 }],
      })
      const claimed = new Set<string>()
      const uber1 = enrichCandidate(
        candidate({ merchantRaw: 'UBER TRIP', date: { year: 2026, month: 6, day: 5 }, amountCents: 1850 }),
        ctx,
        claimed
      )
      const uber2 = enrichCandidate(
        candidate({ merchantRaw: 'UBER TRIP', date: { year: 2026, month: 6, day: 5 }, amountCents: 1850 }),
        ctx,
        claimed
      )
      const lyft = enrichCandidate(
        candidate({ merchantRaw: 'LYFT RIDE', date: { year: 2026, month: 6, day: 6 }, amountCents: 1200 }),
        ctx,
        claimed
      )
      expect(uber1.duplicateOf).toBe('existing-1')
      expect(uber2.duplicateOf).toBeNull()
      expect(lyft.duplicateOf).toBeNull()
    })

    it('claims the correct row out of several existing candidates and leaves the others available', () => {
      const ctx = baseContext({
        existingTransactionDays: [
          { id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 },
          { id: 'existing-2', day: { year: 2026, month: 7, day: 1 }, amountCents: 500 },
        ],
      })
      const claimed = new Set<string>()
      const first = enrichCandidate(candidate({ amountCents: 500 }), ctx, claimed)
      expect(first.duplicateOf).toBe('existing-2')
      expect(claimed.has('existing-2')).toBe(true)
      expect(claimed.has('existing-1')).toBe(false)
    })
  })

  it('does not mutate the input candidate', () => {
    const ctx = baseContext({
      merchantHistory: [history()],
      existingTransactionDays: [{ id: 'existing-1', day: { year: 2026, month: 7, day: 1 }, amountCents: 1200 }],
    })
    const c = candidate({ merchantRaw: 'NETFLIX.COM' })
    const before = { ...c, guesses: new Set(c.guesses) }
    enrichCandidate(c, ctx, new Set())
    expect(c.merchant).toBe(before.merchant)
    expect(c.categoryGuess).toBe(before.categoryGuess)
    expect(c.duplicateOf).toBe(before.duplicateOf)
    expect(c.guesses).toEqual(before.guesses)
  })
})

describe('buildScanContext', () => {
  it('passes the injected reference day and default currency through unchanged', () => {
    const now = new Date('2026-07-03T12:00:00.000Z')
    const ctx = buildScanContext([], 'eur', now)
    expect(ctx.referenceDay).toEqual({ year: 2026, month: 7, day: 3 })
    expect(ctx.defaultCurrency).toBe('eur')
    expect(ctx.merchantHistory).toEqual([])
    expect(ctx.existingTransactionDays).toEqual([])
  })

  it('maps every transaction into existingTransactionDays regardless of kind', () => {
    const transactions = [
      tx({ id: 't1', kind: 'expense', amount_cents: 1200, date: '2026-06-05T12:00:00.000Z' }),
      tx({ id: 't2', kind: 'income', amount_cents: 50000, date: '2026-06-10T12:00:00.000Z' }),
      tx({ id: 't3', kind: 'transfer', amount_cents: 300, date: '2026-06-11T12:00:00.000Z' }),
    ]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    expect(ctx.existingTransactionDays).toEqual([
      { id: 't1', day: { year: 2026, month: 6, day: 5 }, amountCents: 1200 },
      { id: 't2', day: { year: 2026, month: 6, day: 10 }, amountCents: 50000 },
      { id: 't3', day: { year: 2026, month: 6, day: 11 }, amountCents: 300 },
    ])
  })

  it('builds merchant history from expense transactions only, grouped by normalized merchant', () => {
    const transactions = [
      tx({ id: 't1', kind: 'expense', merchant: 'Netflix', category: 'entertainment' }),
      tx({ id: 't2', kind: 'income', merchant: 'Netflix', category: 'entertainment' }),
      tx({ id: 't3', kind: 'transfer', merchant: 'Netflix', category: 'entertainment' }),
    ]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    expect(ctx.merchantHistory).toHaveLength(1)
    expect(ctx.merchantHistory[0].count).toBe(1) // only the expense counts
  })

  it('skips merchants whose normalized key is shorter than 4 characters', () => {
    const transactions = [tx({ merchant: 'CVS', category: 'health' })]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    expect(ctx.merchantHistory).toEqual([])
  })

  it('picks the dominant category by count, tie-broken by recency, and totals the count across categories', () => {
    const transactions = [
      tx({
        id: 't1',
        merchant: 'Trader Joe\'s',
        category: 'groceries',
        date: '2026-01-01T12:00:00.000Z',
      }),
      tx({
        id: 't2',
        merchant: 'Trader Joe\'s',
        category: 'groceries',
        date: '2026-02-01T12:00:00.000Z',
      }),
      tx({
        id: 't3',
        merchant: 'Trader Joe\'s',
        category: 'dining', // a one-off miscategorization, outvoted by groceries
        date: '2026-06-15T12:00:00.000Z',
      }),
    ]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    expect(ctx.merchantHistory).toHaveLength(1)
    const entry = ctx.merchantHistory[0]
    expect(entry.category).toBe('groceries')
    expect(entry.count).toBe(3)
  })

  it('takes display spelling, owners, and lastDay from the most recent transaction in the group', () => {
    const transactions = [
      tx({
        id: 't1',
        merchant: 'TRADER JOE\'S',
        category: 'groceries',
        date: '2026-01-01T12:00:00.000Z',
        owner_ids: ['owner-a'],
      }),
      tx({
        id: 't2',
        merchant: "Trader Joe's",
        category: 'groceries',
        date: '2026-06-15T12:00:00.000Z',
        owner_ids: ['owner-b', 'owner-a'],
      }),
    ]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    expect(ctx.merchantHistory).toHaveLength(1)
    const entry = ctx.merchantHistory[0]
    expect(entry.displayMerchant).toBe("Trader Joe's")
    expect(entry.lastDay).toEqual({ year: 2026, month: 6, day: 15 })
    expect(entry.owners).toEqual(['owner-a', 'owner-b']) // orderedOwnerIds: ascending sort
  })

  it('round-trips into enrichCandidate to adopt spelling/category/owners from real transaction history', () => {
    const transactions = [
      tx({
        id: 't1',
        merchant: 'Netflix',
        category: 'entertainment',
        date: '2026-06-01T12:00:00.000Z',
        owner_ids: ['owner-a'],
      }),
    ]
    const ctx = buildScanContext(transactions, 'usd', new Date('2026-07-03T12:00:00.000Z'))
    const c = candidate({ merchantRaw: 'NETFLIX.COM', merchant: 'NETFLIX.COM', categoryGuess: null })
    const result = enrichCandidate(c, ctx, new Set())
    expect(result.merchant).toBe('Netflix')
    expect(result.categoryGuess).toBe('entertainment')
    expect(result.ownersGuess).toEqual(['owner-a'])
  })
})

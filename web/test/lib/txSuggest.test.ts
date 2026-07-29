// Spec 032 — pure logic for the transaction form's two suggestion features:
//   - mostCommonTransactions: the "Copy from most common" ranking (Contract A)
//   - knownNamesForKind: the kind-aware merchant/payer name vocabulary (Contract A)
// See specs/032-common-copy-name-suggest/contracts/ui-behavior.md
import { describe, expect, it } from 'vitest'
import { mostCommonTransactions, knownNamesForKind } from '@/lib/txSuggest'
import { makeTx } from '../helpers/fixtures'

describe('mostCommonTransactions', () => {
  it('ranks by merchant frequency, not recency', () => {
    const txs = [
      // one-off but MOST RECENT — must NOT lead
      makeTx({ merchant: 'Airport Parking', date: '2026-06-25T12:00:00.000Z' }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeTx({ merchant: 'Whole Foods', date: `2026-06-1${i}T12:00:00.000Z` })
      ),
    ]
    const result = mostCommonTransactions(txs)
    expect(result[0].merchant).toBe('Whole Foods')
    const names = result.map((t) => t.merchant)
    expect(names).toContain('Airport Parking')
    expect(names.indexOf('Whole Foods')).toBeLessThan(names.indexOf('Airport Parking'))
  })

  it('represents each merchant exactly once, by its most-recent entry', () => {
    const txs = [
      makeTx({ merchant: 'Whole Foods', amount_cents: 1000, date: '2026-06-01T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', amount_cents: 3000, date: '2026-06-15T12:00:00.000Z' }),
      makeTx({ merchant: 'Whole Foods', amount_cents: 2000, date: '2026-06-10T12:00:00.000Z' }),
    ]
    const result = mostCommonTransactions(txs)
    expect(result).toHaveLength(1)
    expect(result[0].amount_cents).toBe(3000) // most recent wins
  })

  it('merges case/spacing variants of the same merchant', () => {
    const txs = [
      makeTx({ merchant: 'whole foods' }),
      makeTx({ merchant: 'Whole Foods' }),
      makeTx({ merchant: 'WHOLE  FOODS' }),
    ]
    expect(mostCommonTransactions(txs)).toHaveLength(1)
  })

  it('excludes transfers and blank-merchant entries', () => {
    const txs = [
      makeTx({ merchant: '', kind: 'transfer', category: 'transfer' }),
      makeTx({ merchant: '   ' }),
      makeTx({ merchant: 'Subway' }),
    ]
    expect(mostCommonTransactions(txs).map((t) => t.merchant)).toEqual(['Subway'])
  })

  it('breaks frequency ties by most-recent representative date (deterministic)', () => {
    const txs = [
      makeTx({ merchant: 'Alpha', date: '2026-06-01T12:00:00.000Z' }),
      makeTx({ merchant: 'Beta', date: '2026-06-20T12:00:00.000Z' }),
    ]
    expect(mostCommonTransactions(txs).map((t) => t.merchant)).toEqual(['Beta', 'Alpha'])
  })

  it('breaks a full frequency+date tie by normalized merchant name (deterministic)', () => {
    // Same count (1) AND same representative date → falls through to the final
    // normalized-key asc tiebreak, so ordering is stable regardless of input order.
    const day = '2026-06-10T12:00:00.000Z'
    const forward = [makeTx({ merchant: 'Zebra', date: day }), makeTx({ merchant: 'Apple', date: day })]
    const reversed = [makeTx({ merchant: 'Apple', date: day }), makeTx({ merchant: 'Zebra', date: day })]
    expect(mostCommonTransactions(forward).map((t) => t.merchant)).toEqual(['Apple', 'Zebra'])
    expect(mostCommonTransactions(reversed).map((t) => t.merchant)).toEqual(['Apple', 'Zebra'])
  })

  it('returns an empty array for an empty ledger', () => {
    expect(mostCommonTransactions([])).toEqual([])
  })

  it('caps the list at the limit (default 40)', () => {
    // Distinct, digit-free names (normalizeMerchant strips 2+-digit runs, which
    // would otherwise collapse "Merchant 10".."Merchant 49" into one group).
    const name = (i: number) =>
      `Store ${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`
    const txs = Array.from({ length: 50 }, (_, i) => makeTx({ merchant: name(i) }))
    expect(mostCommonTransactions(txs)).toHaveLength(40)
    expect(mostCommonTransactions(txs, 5)).toHaveLength(5)
  })
})

describe('knownNamesForKind', () => {
  it('returns expense merchants (freq-ordered) for kind=expense, excluding income payers', () => {
    const txs = [
      makeTx({ merchant: 'Whole Foods', kind: 'expense' }),
      makeTx({ merchant: 'Whole Foods', kind: 'expense' }),
      makeTx({ merchant: 'Subway', kind: 'expense' }),
      makeTx({ merchant: 'Acme Co. payroll', kind: 'income', category: 'income' }),
    ]
    expect(knownNamesForKind(txs, 'expense')).toEqual(['Whole Foods', 'Subway'])
  })

  it('returns income payers for kind=income, excluding expense merchants', () => {
    const txs = [
      makeTx({ merchant: 'Whole Foods', kind: 'expense' }),
      makeTx({ merchant: 'Acme Co. payroll', kind: 'income', category: 'income' }),
    ]
    expect(knownNamesForKind(txs, 'income')).toEqual(['Acme Co. payroll'])
  })

  it('excludes blank/whitespace names', () => {
    const txs = [
      makeTx({ merchant: '   ', kind: 'expense' }),
      makeTx({ merchant: 'Subway', kind: 'expense' }),
    ]
    expect(knownNamesForKind(txs, 'expense')).toEqual(['Subway'])
  })

  it('returns an empty array for empty input', () => {
    expect(knownNamesForKind([], 'expense')).toEqual([])
  })
})

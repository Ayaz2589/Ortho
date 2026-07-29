// Spec 032 — pure logic for the transaction form's two suggestion features:
//   - mostCommonTransactions: the "Copy from most common" ranking (Contract A)
//   - knownNamesForKind: the kind-aware merchant/payer name vocabulary (Contract A)
// See specs/032-common-copy-name-suggest/contracts/ui-behavior.md
import { describe, expect, it } from 'vitest'
import { mostCommonTransactions, knownNamesForKind } from '@/lib/txSuggest'
import { makeTx } from '../helpers/fixtures'

describe('mostCommonTransactions', () => {
  it('orders results by category, then alphabetically by merchant within a category', () => {
    const txs = [
      makeTx({ merchant: 'Whole Foods', category: 'groceries' }),
      makeTx({ merchant: 'Aldi', category: 'groceries' }),
      makeTx({ merchant: 'Chipotle', category: 'dining' }),
      makeTx({ merchant: 'Blue Bottle', category: 'coffee' }),
    ]
    // category slug asc (coffee < dining < groceries), then merchant name asc.
    expect(mostCommonTransactions(txs).map((t) => t.merchant)).toEqual([
      'Blue Bottle', // coffee
      'Chipotle', // dining
      'Aldi', // groceries — A before W
      'Whole Foods', // groceries
    ])
  })

  it('sorts merchants case-insensitively within a category', () => {
    const txs = [
      makeTx({ merchant: 'zabar', category: 'groceries' }),
      makeTx({ merchant: 'Aldi', category: 'groceries' }),
      makeTx({ merchant: 'Bravo', category: 'groceries' }),
    ]
    expect(mostCommonTransactions(txs).map((t) => t.merchant)).toEqual(['Aldi', 'Bravo', 'zabar'])
  })

  it('still SELECTS by frequency — least-common merchants drop off at the cap, survivors shown in category order', () => {
    const txs = [
      ...Array.from({ length: 5 }, () => makeTx({ merchant: 'Common Mart', category: 'groceries' })),
      ...Array.from({ length: 3 }, () => makeTx({ merchant: 'Sometimes Cafe', category: 'coffee' })),
      makeTx({ merchant: 'Rare Shop', category: 'dining' }), // freq 1 → excluded at limit 2
    ]
    // freq gates membership (Common Mart, Sometimes Cafe); Rare Shop drops.
    // The survivors are then displayed in category order (coffee < groceries).
    expect(mostCommonTransactions(txs, 2).map((t) => t.merchant)).toEqual(['Sometimes Cafe', 'Common Mart'])
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

  it('breaks the frequency SELECTION tie by most-recent representative date', () => {
    // Both freq 1; with limit 1 the more-recent merchant is the one kept.
    const txs = [
      makeTx({ merchant: 'Older', category: 'dining', date: '2026-06-01T12:00:00.000Z' }),
      makeTx({ merchant: 'Newer', category: 'dining', date: '2026-06-20T12:00:00.000Z' }),
    ]
    expect(mostCommonTransactions(txs, 1).map((t) => t.merchant)).toEqual(['Newer'])
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

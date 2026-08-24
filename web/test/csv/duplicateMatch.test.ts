import { describe, it, expect } from 'vitest'
import {
  normalizeMerchant,
  merchantsSimilar,
  findDuplicateId,
  type DuplicateCandidate,
} from '../../lib/csv/duplicateMatch'

describe('normalizeMerchant', () => {
  it('lowercases, strips punctuation, and drops store numbers', () => {
    expect(normalizeMerchant('STARBUCKS #1234')).toBe('starbucks')
    expect(normalizeMerchant('Trader Joe’s')).toBe('trader joe s')
    // Pure digit runs are dropped; mixed alphanumeric ref codes survive (rare,
    // and harmless behind the same-day + same-amount gate).
    expect(normalizeMerchant('WALMART 0451')).toBe('walmart')
  })
})

describe('merchantsSimilar', () => {
  it('matches identical names', () => {
    expect(merchantsSimilar('Whole Foods', 'whole foods')).toBe(true)
  })

  it('matches when one name contains the other', () => {
    expect(merchantsSimilar('Amazon', 'Amazon Prime')).toBe(true)
    expect(merchantsSimilar('Amazon Prime', 'amazon')).toBe(true)
  })

  it('matches on a shared significant word', () => {
    expect(merchantsSimilar('Amazon Prime', 'Amazon Payments')).toBe(true)
  })

  it('ignores generic stopwords when comparing', () => {
    expect(merchantsSimilar('Acme Inc', 'Acme LLC')).toBe(true)
  })

  it('does not match different merchants', () => {
    expect(merchantsSimilar('Starbucks', 'Whole Foods')).toBe(false)
    expect(merchantsSimilar('Uber Eats', 'Lyft')).toBe(false)
  })

  it('does not match on a tiny shared fragment', () => {
    // "at" is below the significant-token threshold and too short to contain-match.
    expect(merchantsSimilar('AT', 'Walmart')).toBe(false)
  })

  it('does not match a word appearing mid-word in an unrelated name', () => {
    // "uber" is a substring of "huber" but not a word — must NOT match.
    expect(merchantsSimilar('Uber', 'Huber Auto')).toBe(false)
    expect(merchantsSimilar('Uber Eats', 'Huber Automotive')).toBe(false)
  })

  it('matches stems / concatenations via word prefix', () => {
    expect(merchantsSimilar('McDonald', "McDonald's")).toBe(true)
    expect(merchantsSimilar('Amazon', 'AmazonPrime')).toBe(true)
  })

  it('returns false when either name is empty after normalization', () => {
    expect(merchantsSimilar('', 'Amazon')).toBe(false)
    expect(merchantsSimilar('####', 'Amazon')).toBe(false)
  })
})

describe('findDuplicateId', () => {
  const existing: DuplicateCandidate[] = [
    { id: 'tx-1', date: '2026-06-01', amountCents: 1632, merchant: 'Amazon', kind: 'expense' },
    { id: 'tx-2', date: '2026-06-02', amountCents: 500, merchant: 'Starbucks', kind: 'expense' },
  ]

  it('flags a same-day, same-amount, similar-merchant row (manual entry case)', () => {
    // Hand-typed "Amazon" vs the CSV descriptor "Amazon Prime".
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBe('tx-1')
  })

  it('does not flag when the amount differs', () => {
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1700, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBeNull()
  })

  it('flags within the date window (transaction vs post date drift)', () => {
    // 2 days off — inside the default ±3 window.
    const row = { dateISO: '2026-06-03T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBe('tx-1')
  })

  it('does not flag when the day is outside the window', () => {
    // 9 days off — beyond the window (guards against monthly-subscription matches).
    const row = { dateISO: '2026-06-10T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBeNull()
  })

  it('honors a custom window of 0 (exact day only)', () => {
    const row = { dateISO: '2026-06-03T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing, 0)).toBeNull()
  })

  it('does not flag a different merchant at the same day + amount', () => {
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1632, merchant: 'Best Buy', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBeNull()
  })

  it('returns null against an empty ledger', () => {
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon', kind: 'expense' }
    expect(findDuplicateId(row, [])).toBeNull()
  })

  // Review 2026-08-24: kinds never match across each other — a credit-card
  // refund parses as income with the same absolute amount at the same merchant
  // within days of the purchase, and used to be excluded as its "duplicate".
  it('a refund (income) is not a duplicate of its own purchase (expense)', () => {
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'income' }
    expect(findDuplicateId(row, existing)).toBeNull()
  })

  it('same-kind rows still match', () => {
    const row = { dateISO: '2026-06-01T12:00:00.000Z', amountCents: 1632, merchant: 'Amazon Prime', kind: 'expense' }
    expect(findDuplicateId(row, existing)).toBe('tx-1')
  })
})

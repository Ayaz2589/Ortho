import { describe, it, expect } from 'vitest'
import type { ParsedTransaction } from '../../scripts/import/engine/types'
import {
  parsedTransactionToDraft,
  checkedDrafts,
  totalSpendCents,
} from '../../lib/csv/csvImportModels'

const makeParsedTx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  dateISO: '2026-06-01T12:00:00.000Z',
  rawDescription: 'STARBUCKS #1234',
  merchant: 'Starbucks #1234',
  amountCents: 575,
  kind: 'expense',
  section: 'Transactions',
  category: 'coffee',
  excluded: false,
  excludeReason: null,
  duplicate: false,
  ownerIds: [],
  splits: null,
  ...overrides,
})

describe('parsedTransactionToDraft', () => {
  it('creates a draft with a string UUID id', () => {
    const draft = parsedTransactionToDraft(makeParsedTx())
    expect(typeof draft.id).toBe('string')
    expect(draft.id.length).toBeGreaterThan(0)
  })

  it('preserves the original parsed transaction as source (immutable reference)', () => {
    const tx = makeParsedTx()
    const draft = parsedTransactionToDraft(tx)
    expect(draft.source).toBe(tx)
  })

  it('copies all editable fields from the parsed transaction', () => {
    const tx = makeParsedTx()
    const draft = parsedTransactionToDraft(tx)
    expect(draft.merchant).toBe(tx.merchant)
    expect(draft.category).toBe(tx.category)
    expect(draft.amountCents).toBe(tx.amountCents)
    expect(draft.dateISO).toBe(tx.dateISO)
    expect(draft.ownerIds).toEqual([])
    expect(draft.split).toBeNull()
    expect(draft.tags).toEqual([])
    expect(draft.notes).toBeNull()
    expect(draft.edited).toBe(false)
  })

  it('sets checked:true for normal expense rows', () => {
    const draft = parsedTransactionToDraft(makeParsedTx({ excluded: false }))
    expect(draft.checked).toBe(true)
  })

  it('sets checked:false and isPaymentRow:true for excluded payment rows', () => {
    const draft = parsedTransactionToDraft(
      makeParsedTx({ excluded: true, excludeReason: 'card-payment' })
    )
    expect(draft.checked).toBe(false)
    expect(draft.isPaymentRow).toBe(true)
  })

  it('sets isPaymentRow:false for non-payment excluded rows', () => {
    const draft = parsedTransactionToDraft(
      makeParsedTx({ excluded: true, excludeReason: 'internal-transfer' })
    )
    expect(draft.isPaymentRow).toBe(false)
    expect(draft.checked).toBe(false)
  })

  it('seeds ownerIds with the default owner when the parsed row has none', () => {
    const draft = parsedTransactionToDraft(makeParsedTx(), null, 'person-1')
    expect(draft.ownerIds).toEqual(['person-1'])
  })

  it('keeps the parsed row owners over the default owner when present', () => {
    const tx = makeParsedTx({ ownerIds: ['person-2'] })
    const draft = parsedTransactionToDraft(tx, null, 'person-1')
    expect(draft.ownerIds).toEqual(['person-2'])
  })

  it('leaves ownerIds empty when there is no default owner', () => {
    const draft = parsedTransactionToDraft(makeParsedTx(), null, null)
    expect(draft.ownerIds).toEqual([])
  })

  it('sets duplicateOf from the second argument', () => {
    const draft = parsedTransactionToDraft(makeParsedTx(), 'existing-tx-id')
    expect(draft.duplicateOf).toBe('existing-tx-id')
    expect(draft.checked).toBe(false)
  })

  it('generates unique ids for each call', () => {
    const a = parsedTransactionToDraft(makeParsedTx())
    const b = parsedTransactionToDraft(makeParsedTx())
    expect(a.id).not.toBe(b.id)
  })
})

describe('checkedDrafts', () => {
  it('returns only checked, non-payment drafts', () => {
    const tx = makeParsedTx()
    const normal = parsedTransactionToDraft(tx)
    const payment = parsedTransactionToDraft(makeParsedTx({ excluded: true, excludeReason: 'card-payment' }))
    const skipped = { ...parsedTransactionToDraft(tx), checked: false }

    const result = checkedDrafts([normal, payment, skipped])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(normal.id)
  })
})

describe('totalSpendCents', () => {
  it('sums amountCents for checked non-payment drafts only', () => {
    const tx = makeParsedTx({ amountCents: 500 })
    const normal1 = parsedTransactionToDraft(tx)
    const normal2 = { ...parsedTransactionToDraft(makeParsedTx({ amountCents: 300 })), checked: true }
    const payment = parsedTransactionToDraft(makeParsedTx({ excluded: true, excludeReason: 'card-payment', amountCents: 10000 }))

    expect(totalSpendCents([normal1, normal2, payment])).toBe(800)
  })

  it('returns 0 when no checked drafts', () => {
    const unchecked = { ...parsedTransactionToDraft(makeParsedTx()), checked: false }
    expect(totalSpendCents([unchecked])).toBe(0)
  })
})

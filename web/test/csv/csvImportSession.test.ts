import { describe, it, expect } from 'vitest'
import type { ParsedTransaction } from '../../scripts/import/engine/types'
import type { ParsedStatement } from '../../scripts/import/engine/types'
import { csvImportReducer, initialCsvImportState } from '../../lib/csv/csvImportSession'
import { parsedTransactionToDraft } from '../../lib/csv/csvImportModels'

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

const makeStatement = (rows: ParsedTransaction[]): ParsedStatement => ({
  bankId: 'chase',
  bankLabel: 'Chase (Credit Card CSV)',
  accountHolder: '',
  source: 'Chase',
  period: { start: new Date('2026-06-01T12:00:00.000Z'), end: new Date('2026-06-30T12:00:00.000Z') },
  sections: [{ name: 'Transactions', kind: 'expense', printedSubtotalCents: 575, rows }],
  reconcilable: false,
})

describe('csvImportReducer', () => {
  it('starts in idle phase', () => {
    expect(initialCsvImportState.phase).toBe('idle')
  })

  it('idle + file/parsed → list-view with drafts', () => {
    const statement = makeStatement([makeParsedTx()])
    const state = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase (Credit Card CSV)',
    })
    expect(state.phase).toBe('list-view')
    if (state.phase === 'list-view') {
      expect(Object.keys(state.drafts)).toHaveLength(1)
      expect(state.bankLabel).toBe('Chase (Credit Card CSV)')
    }
  })

  it('idle + file/parsed → undetected when no statement', () => {
    const state = csvImportReducer(initialCsvImportState, { type: 'file/undetected' })
    expect(state.phase).toBe('undetected')
  })

  it('flags a row that duplicates an existing ledger transaction', () => {
    // Hand-typed "Starbucks" vs the CSV's "Starbucks #1234", same day + amount.
    const statement = makeStatement([makeParsedTx()])
    const state = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
      existing: [{ id: 'tx-existing', date: '2026-06-01', amountCents: 575, merchant: 'Starbucks' }],
    })
    if (state.phase !== 'list-view') throw new Error('Expected list-view')
    const draft = Object.values(state.drafts)[0]
    expect(draft.duplicateOf).toBe('tx-existing')
    expect(draft.checked).toBe(false) // excluded by default, shown in review
  })

  it('does not flag when there is no matching ledger row', () => {
    const statement = makeStatement([makeParsedTx()])
    const state = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
      existing: [{ id: 'tx-other', date: '2026-06-01', amountCents: 575, merchant: 'Whole Foods' }],
    })
    if (state.phase !== 'list-view') throw new Error('Expected list-view')
    const draft = Object.values(state.drafts)[0]
    expect(draft.duplicateOf).toBeNull()
    expect(draft.checked).toBe(true)
  })

  it('list-view + draft/update → updates draft fields', () => {
    const statement = makeStatement([makeParsedTx()])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    if (listState.phase !== 'list-view') throw new Error('Expected list-view')
    const id = Object.keys(listState.drafts)[0]

    const updated = csvImportReducer(listState, {
      type: 'draft/update',
      id,
      patch: { merchant: 'Edited Merchant', notes: 'test note' },
    })
    if (updated.phase !== 'list-view') throw new Error('Expected list-view')
    expect(updated.drafts[id].merchant).toBe('Edited Merchant')
    expect(updated.drafts[id].notes).toBe('test note')
    expect(updated.drafts[id].source).toBe(listState.drafts[id].source)
  })

  it('list-view + draft/toggleChecked → flips checked flag', () => {
    const statement = makeStatement([makeParsedTx()])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    if (listState.phase !== 'list-view') throw new Error('Expected list-view')
    const id = Object.keys(listState.drafts)[0]

    const toggled = csvImportReducer(listState, { type: 'draft/toggleChecked', id })
    if (toggled.phase !== 'list-view') throw new Error('Expected list-view')
    expect(toggled.drafts[id].checked).toBe(false)

    const toggledBack = csvImportReducer(toggled, { type: 'draft/toggleChecked', id })
    if (toggledBack.phase !== 'list-view') throw new Error('Expected list-view')
    expect(toggledBack.drafts[id].checked).toBe(true)
  })

  it('list-view + draft/skip → marks checked:false and skipped:true for target', () => {
    const statement = makeStatement([makeParsedTx()])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    if (listState.phase !== 'list-view') throw new Error('Expected list-view')
    const id = Object.keys(listState.drafts)[0]

    const skipped = csvImportReducer(listState, { type: 'draft/skip', id })
    if (skipped.phase !== 'list-view') throw new Error('Expected list-view')
    expect(skipped.drafts[id].checked).toBe(false)
    expect(skipped.drafts[id].skipped).toBe(true)
  })

  it('list-view + import/start → importing phase', () => {
    const statement = makeStatement([makeParsedTx()])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    const importing = csvImportReducer(listState, { type: 'import/start' })
    expect(importing.phase).toBe('importing')
  })

  it('importing + import/done → summary phase with counts', () => {
    const statement = makeStatement([
      makeParsedTx(),
      makeParsedTx({ excluded: true, excludeReason: 'card-payment', amountCents: 15000 }),
    ])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    const importingState = csvImportReducer(listState, { type: 'import/start' })
    const summary = csvImportReducer(importingState, {
      type: 'import/done',
      addedCount: 1,
      skippedCount: 0,
      excludedCount: 1,
      duplicatesCount: 0,
      totalSpendCents: 575,
    })
    expect(summary.phase).toBe('summary')
    if (summary.phase === 'summary') {
      expect(summary.addedCount).toBe(1)
      expect(summary.excludedCount).toBe(1)
      expect(summary.totalSpendCents).toBe(575)
    }
  })

  it('payment rows arrive pre-checked:false and isPaymentRow:true', () => {
    const statement = makeStatement([
      makeParsedTx(),
      makeParsedTx({ excluded: true, excludeReason: 'card-payment' }),
    ])
    const listState = csvImportReducer(initialCsvImportState, {
      type: 'file/parsed',
      statement,
      bankLabel: 'Chase',
    })
    if (listState.phase !== 'list-view') throw new Error('Expected list-view')
    const drafts = Object.values(listState.drafts)
    const payment = drafts.find((d) => d.isPaymentRow)
    expect(payment).toBeDefined()
    expect(payment!.checked).toBe(false)
    const normal = drafts.find((d) => !d.isPaymentRow)
    expect(normal!.checked).toBe(true)
  })
})

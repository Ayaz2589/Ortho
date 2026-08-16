// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveCsvSession,
  loadCsvSession,
  clearCsvSession,
  hasCsvSession,
} from '@/lib/csv/csvImportPersistence'
import type { CsvImportState } from '@/lib/csv/csvImportSession'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import type { ParsedTransaction } from '@/scripts/import/engine/types'

const tx: ParsedTransaction = {
  dateISO: '2026-06-01T12:00:00.000Z',
  rawDescription: 'STARBUCKS',
  merchant: 'Starbucks',
  amountCents: 575,
  kind: 'expense',
  section: 'Transactions',
  category: 'coffee',
  excluded: false,
  excludeReason: null,
  duplicate: false,
  ownerIds: [],
  splits: null,
}

const draft: CsvDraftRow = {
  id: 'd1',
  source: tx,
  merchant: 'Starbucks',
  category: 'coffee',
  amountCents: 575,
  dateISO: '2026-06-01T12:00:00.000Z',
  ownerIds: ['u1'],
  paidById: null,
  split: null,
  paymentSource: 'Chase',
  tags: [],
  notes: null,
  checked: true,
  isPaymentRow: false,
  duplicateOf: null,
  skipped: false,
  edited: false,
}

const listView: CsvImportState = {
  phase: 'list-view',
  bankLabel: 'Chase (Credit Card CSV)',
  period: { start: new Date('2026-06-01'), end: new Date('2026-06-30') },
  drafts: { d1: draft },
}

beforeEach(() => sessionStorage.clear())

describe('csvImportPersistence', () => {
  it('round-trips a list-view session', () => {
    saveCsvSession(listView)
    expect(hasCsvSession()).toBe(true)
    const restored = loadCsvSession()
    expect(restored?.phase).toBe('list-view')
    expect(restored && restored.phase === 'list-view' && restored.drafts.d1.merchant).toBe('Starbucks')
    expect(restored && restored.phase === 'list-view' && restored.drafts.d1.paymentSource).toBe('Chase')
  })

  it('rehydrates the period Dates (not strings) after a JSON round-trip', () => {
    saveCsvSession(listView)
    const restored = loadCsvSession()
    const period = restored && restored.phase === 'list-view' ? restored.period : null
    expect(period?.start).toBeInstanceOf(Date)
    expect(period?.end).toBeInstanceOf(Date)
  })

  it('clears the stored session for any non-list-view phase', () => {
    saveCsvSession(listView)
    expect(hasCsvSession()).toBe(true)
    saveCsvSession({ phase: 'idle' })
    expect(hasCsvSession()).toBe(false)
    expect(loadCsvSession()).toBeNull()
  })

  it('clearCsvSession removes a stored session', () => {
    saveCsvSession(listView)
    clearCsvSession()
    expect(hasCsvSession()).toBe(false)
  })

  it('returns null / false when nothing is stored', () => {
    expect(loadCsvSession()).toBeNull()
    expect(hasCsvSession()).toBe(false)
  })

  it('tolerates malformed stored JSON', () => {
    sessionStorage.setItem('ortho.csvImport.session.v1', '{not json')
    expect(loadCsvSession()).toBeNull()
    expect(hasCsvSession()).toBe(false)
  })
})

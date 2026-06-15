import { describe, it, expect } from 'vitest'
import { renderTable, renderDetail } from '../../scripts/import/engine/render'
import type { Transaction } from '../../lib/types'

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  household_id: null,
  merchant: 'Verizon',
  category: 'utilities',
  kind: 'expense',
  scope: 'personal',
  amount_cents: 8999,
  source: 'TD Bank',
  date: '2026-05-04T12:00:00.000Z',
  created_by: 'u1',
  created_at: '',
  updated_at: '',
  owner_ids: ['u1'],
  splits: null,
  ...over,
})

describe('renderTable', () => {
  it('shows a friendly message when empty', () => {
    expect(renderTable([])).toBe('No transactions match.')
  })
  it('formats expense with − and income with +, and counts rows', () => {
    const out = renderTable([
      tx({}),
      tx({ id: 'e5f6a7b8-1111-1111-1111-111111111111', merchant: 'Payroll', kind: 'income', category: 'income', amount_cents: 417844 }),
    ])
    expect(out).toContain('a1b2c3d4')
    expect(out).toContain('−$89.99')
    expect(out).toContain('+$4,178.44')
    expect(out).toContain('(2 transactions)')
  })
  it('singularizes the count for one row', () => {
    expect(renderTable([tx({})])).toContain('(1 transaction)')
  })
  it('truncates a long merchant with an ellipsis', () => {
    const out = renderTable([tx({ merchant: 'A Very Long Merchant Name That Exceeds The Column' })])
    expect(out).toContain('…')
    expect(out).not.toContain('That Exceeds The Column')
  })
})

describe('renderDetail', () => {
  it('shows labelled fields and a split when shared', () => {
    const out = renderDetail(tx({ scope: 'shared', household_id: 'h1', owner_ids: ['u1', 'u2'], splits: { u1: 70, u2: 30 } }))
    expect(out).toContain('merchant: Verizon')
    expect(out).toContain('−$89.99')
    expect(out).toContain('splits')
  })
  it('falls back to created_by for owners and — for an empty source, no split line', () => {
    const out = renderDetail(tx({ owner_ids: [], source: '', splits: null }))
    expect(out).toContain('owners:   u1')
    expect(out).toContain('source:   —')
    expect(out).not.toContain('splits')
  })
})

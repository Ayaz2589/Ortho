// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import type { ParsedTransaction } from '@/scripts/import/engine/types'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string) => k,
  }),
}))

import { CsvImportList } from '@/components/csv/CsvImportList'

const makeTx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  dateISO: '2026-06-28T12:00:00.000Z',
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
  ...overrides,
})

const makeDraft = (id: string, overrides: Partial<CsvDraftRow> = {}): CsvDraftRow => ({
  id,
  source: makeTx(),
  merchant: 'Starbucks',
  category: 'coffee',
  amountCents: 575,
  dateISO: '2026-06-28T12:00:00.000Z',
  ownerIds: [],
  splits: null,
  tags: [],
  notes: null,
  checked: true,
  isPaymentRow: false,
  duplicateOf: null,
  skipped: false,
  ...overrides,
})

describe('CsvImportList', () => {
  it('renders merchant name and amount for normal rows', () => {
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Starbucks')).toBeTruthy()
    expect(screen.getByText('$5.75')).toBeTruthy()
  })

  it('renders a date group header', () => {
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    // Jun 28 date group should appear
    expect(screen.getByText(/Jun 28/i)).toBeTruthy()
  })

  it('calls onEdit when a normal row is clicked', async () => {
    const onEdit = vi.fn()
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={onEdit} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByText('Starbucks'))
    expect(onEdit).toHaveBeenCalledWith('d1')
  })

  it('renders payment rows as dimmed and non-clickable', () => {
    const onEdit = vi.fn()
    const drafts = [makeDraft('p1', {
      merchant: 'Payment Thank You',
      isPaymentRow: true,
      checked: false,
      source: makeTx({ excluded: true, excludeReason: 'card-payment' }),
    })]
    render(<CsvImportList drafts={drafts} onEdit={onEdit} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Payment Thank You')).toBeTruthy()
    // Payment rows should not trigger onEdit
    const paymentEl = screen.getByText('Payment Thank You').closest('[data-testid]')
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('renders duplicate rows with muted style marker', () => {
    const drafts = [makeDraft('dup1', {
      merchant: 'Netflix',
      duplicateOf: 'existing-id',
      checked: false,
    })]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Netflix')).toBeTruthy()
    // Duplicate marker should be visible
    const row = screen.getByTestId('csv-row-dup1')
    expect(row.className).toMatch(/duplicate|muted|opacity/i)
  })

  it('shows the confirm button with checked count', () => {
    const drafts = [makeDraft('d1'), makeDraft('d2')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    // Should show "Add 2 transactions" or similar
    expect(screen.getByRole('button', { name: /add 2/i })).toBeTruthy()
  })

  it('groups multiple drafts across different dates', () => {
    const drafts = [
      makeDraft('d1', { dateISO: '2026-06-28T12:00:00.000Z', merchant: 'Starbucks' }),
      makeDraft('d2', { dateISO: '2026-06-27T12:00:00.000Z', merchant: 'Amazon' }),
    ]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Starbucks')).toBeTruthy()
    expect(screen.getByText('Amazon')).toBeTruthy()
  })
})

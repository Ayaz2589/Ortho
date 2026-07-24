// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import type { ParsedTransaction } from '@/scripts/import/engine/types'

const MEMBERS = [
  { id: 'u1', name: 'Alex', initial: 'A', color_key: 'sage', is_self: true },
  { id: 'u2', name: 'Sam', initial: 'S', color_key: 'clay', is_self: false },
]

let mockMembers: typeof MEMBERS | [] = []

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string) => k,
    householdMembers: mockMembers,
    resolveUser: (id: string) =>
      MEMBERS.find((m) => m.id === id) ?? { id: '', name: '—', initial: '—', color_key: 'sage', is_self: false },
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
  split: null,
  paymentSource: 'Chase',
  tags: [],
  notes: null,
  checked: true,
  isPaymentRow: false,
  duplicateOf: null,
  skipped: false,
  edited: false,
  ...overrides,
})

describe('CsvImportList', () => {
  beforeEach(() => {
    mockMembers = []
  })

  it('renders merchant name and amount for normal rows', () => {
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
    expect(screen.getByText('Starbucks')).toBeTruthy()
    expect(screen.getByText('$5.75')).toBeTruthy()
  })

  it('renders a date group header', () => {
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
    // Jun 28 date group should appear
    expect(screen.getByText(/Jun 28/i)).toBeTruthy()
  })

  it('calls onEdit when a normal row is clicked', async () => {
    const onEdit = vi.fn()
    const drafts = [makeDraft('d1')]
    render(<CsvImportList drafts={drafts} onEdit={onEdit} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
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
    render(<CsvImportList drafts={drafts} onEdit={onEdit} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
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
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
    expect(screen.getByText('Netflix')).toBeTruthy()
    // Duplicate marker should be visible
    const row = screen.getByTestId('csv-row-dup1')
    expect(row.className).toMatch(/duplicate|muted|opacity/i)
  })

  it('shows the confirm button with checked count', () => {
    const drafts = [makeDraft('d1'), makeDraft('d2')]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
    // Should show "Add 2 transactions" or similar
    expect(screen.getByRole('button', { name: /add 2/i })).toBeTruthy()
  })

  it('groups multiple drafts across different dates', () => {
    const drafts = [
      makeDraft('d1', { dateISO: '2026-06-28T12:00:00.000Z', merchant: 'Starbucks' }),
      makeDraft('d2', { dateISO: '2026-06-27T12:00:00.000Z', merchant: 'Amazon' }),
    ]
    render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
    expect(screen.getByText('Starbucks')).toBeTruthy()
    expect(screen.getByText('Amazon')).toBeTruthy()
  })

  describe('no-source marker', () => {
    it('shows "No source" only on rows whose payment source is unset', () => {
      const drafts = [
        makeDraft('d1', { merchant: 'Sourced Row', paymentSource: 'Chase' }),
        makeDraft('d2', { merchant: 'Unsourced Row', paymentSource: '' }),
      ]
      render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
      // Exactly one "No source" tag, on the unset row.
      expect(screen.getAllByText('No source')).toHaveLength(1)
    })
  })

  describe('edited marker', () => {
    it('shows an "Edited" badge only on rows edited since import', () => {
      const drafts = [
        makeDraft('d1', { merchant: 'Untouched' }),
        makeDraft('d2', { merchant: 'Tweaked', edited: true }),
      ]
      render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
      expect(screen.queryByTestId('csv-edited-d1')).toBeNull()
      expect(screen.getByTestId('csv-edited-d2')).toBeTruthy()
      expect(screen.getByText('Edited')).toBeTruthy()
    })
  })

  describe('inline owner picker', () => {
    it('hides the owner control for a solo household', () => {
      mockMembers = []
      const drafts = [makeDraft('d1', { ownerIds: ['u1'] })]
      render(<CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={vi.fn()} />)
      expect(screen.queryByLabelText(/^Owner:/)).toBeNull()
    })

    it('assigns a second owner from the list without opening the editor', async () => {
      mockMembers = MEMBERS
      const onEdit = vi.fn()
      const onSetOwners = vi.fn()
      const drafts = [makeDraft('d1', { ownerIds: ['u1'] })]
      render(
        <CsvImportList drafts={drafts} onEdit={onEdit} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={onSetOwners} />
      )
      // Open the picker from the row's owner avatar — this must NOT open the editor.
      await userEvent.click(screen.getByLabelText(/^Owner:/))
      expect(onEdit).not.toHaveBeenCalled()
      // Toggle the currently-unassigned member on.
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Sam/ }))
      expect(onSetOwners).toHaveBeenCalledWith('d1', ['u1', 'u2'])
    })

    it('keeps at least one owner: the last owner cannot be removed', async () => {
      mockMembers = MEMBERS
      const onSetOwners = vi.fn()
      const drafts = [makeDraft('d1', { ownerIds: ['u1'] })]
      render(
        <CsvImportList drafts={drafts} onEdit={vi.fn()} onToggle={vi.fn()} onConfirm={vi.fn()} onSetOwners={onSetOwners} />
      )
      await userEvent.click(screen.getByLabelText(/^Owner:/))
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Alex/ }))
      expect(onSetOwners).not.toHaveBeenCalled()
    })
  })
})

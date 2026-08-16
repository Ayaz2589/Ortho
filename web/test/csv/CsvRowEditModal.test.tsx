// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'

const MEMBERS = [
  { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' },
  { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' },
]
let mockMembers: typeof MEMBERS | [] = []
const CARDS = [
  { id: 'c1', household_id: 'h1', name: 'Chase Sapphire', created_at: '' },
  { id: 'c2', household_id: 'h1', name: 'Amex Gold', created_at: '' },
]
let mockCards: typeof CARDS | [] = []

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    currency: 'usd',
    rate: () => 1,
    t: (k: string) => k,
    householdMembers: mockMembers,
    transactions: [],
    cards: mockCards,
    tags: [],
    addTag: vi.fn(),
    resolveUser: (id: string) => ({ id, name: id }),
  }),
}))

vi.mock('@/lib/format', () => ({
  mediumDate: (d: Date) => d.toISOString().slice(0, 10),
  shortDate: (d: Date) => d.toISOString().slice(5, 10),
}))

import { CsvRowEditModal } from '@/components/csv/CsvRowEditModal'

const baseDraft: CsvDraftRow = {
  id: 'draft-1',
  source: {
    date: '2026-06-15',
    merchant: 'Whole Foods',
    amountCents: 4250,
    category: 'groceries',
    excludeReason: null,
  } as never,
  merchant: 'Whole Foods',
  category: 'groceries',
  amountCents: 4250,
  dateISO: '2026-06-15',
  ownerIds: ['u1'],
  paidById: null,
  split: null,
  paymentSource: 'Chase Sapphire',
  tags: [],
  notes: null,
  checked: true,
  isPaymentRow: false,
  duplicateOf: null,
  skipped: false,
  edited: false,
}

describe('CsvRowEditModal', () => {
  beforeEach(() => {
    mockMembers = []
    mockCards = []
  })

  it('renders the merchant name in input', () => {
    render(
      <CsvRowEditModal
        draft={baseDraft}
        onSave={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const input = screen.getByLabelText('Merchant') as HTMLInputElement
    expect(input.value).toBe('Whole Foods')
  })

  it('calls onSave with patched merchant when Save is clicked', async () => {
    const onSave = vi.fn()
    render(
      <CsvRowEditModal
        draft={baseDraft}
        onSave={onSave}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const input = screen.getByLabelText('Merchant')
    await userEvent.clear(input)
    await userEvent.type(input, 'Target')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('draft-1', expect.objectContaining({ merchant: 'Target' }))
  })

  it('calls onSkip and onClose when Skip button is clicked', async () => {
    const onSkip = vi.fn()
    const onClose = vi.fn()
    render(
      <CsvRowEditModal
        draft={baseDraft}
        onSave={vi.fn()}
        onSkip={onSkip}
        onClose={onClose}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalledWith('draft-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows "Possible duplicate" section for duplicate rows', () => {
    const duplicateDraft: CsvDraftRow = { ...baseDraft, duplicateOf: 'tx-original', checked: false }
    render(
      <CsvRowEditModal
        draft={duplicateDraft}
        onSave={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/possible duplicate/i)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /include anyway/i })).toBeTruthy()
  })

  it('does NOT show duplicate section for non-duplicate rows', () => {
    render(
      <CsvRowEditModal
        draft={baseDraft}
        onSave={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText(/possible duplicate/i)).toBeNull()
  })

  it('calls onClose when the back button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <CsvRowEditModal
        draft={baseDraft}
        onSave={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalled()
  })

  describe('payment source', () => {
    it('shows the seeded source and lets you change it', async () => {
      mockCards = CARDS
      const onSave = vi.fn()
      render(<CsvRowEditModal draft={baseDraft} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)
      const select = screen.getByLabelText('Paid with') as HTMLSelectElement
      expect(select.value).toBe('Chase Sapphire')
      await userEvent.selectOptions(select, 'Amex Gold')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith('draft-1', expect.objectContaining({ paymentSource: 'Amex Gold' }))
    })

    it('can be set back to "Not set"', async () => {
      mockCards = CARDS
      const onSave = vi.fn()
      render(<CsvRowEditModal draft={baseDraft} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)
      await userEvent.selectOptions(screen.getByLabelText('Paid with'), '')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith('draft-1', expect.objectContaining({ paymentSource: '' }))
    })

    it('shows "No cards yet" when the household has no cards', () => {
      mockCards = []
      render(<CsvRowEditModal draft={baseDraft} onSave={vi.fn()} onSkip={vi.fn()} onClose={vi.fn()} />)
      expect(screen.queryByLabelText('Paid with')).toBeNull()
      expect(screen.getByText('No cards yet')).toBeTruthy()
    })
  })

  describe('split editor', () => {
    // A $42.50 row owned by both members.
    const twoOwner: CsvDraftRow = { ...baseDraft, ownerIds: ['u1', 'u2'], amountCents: 4250 }

    it('is hidden for a single owner', () => {
      mockMembers = MEMBERS
      render(<CsvRowEditModal draft={baseDraft} onSave={vi.fn()} onSkip={vi.fn()} onClose={vi.fn()} />)
      expect(screen.queryByRole('tab', { name: 'Even' })).toBeNull()
    })

    it('offers even/%/$ and saves a percent split as a SplitInput', async () => {
      mockMembers = MEMBERS
      const onSave = vi.fn()
      render(<CsvRowEditModal draft={twoOwner} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)
      // Even by default.
      expect(screen.getByRole('tab', { name: 'Even' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('tab', { name: '%' }))
      // Seeded 50/50; typing rebalances the other owner.
      expect((screen.getByLabelText('Alice percent') as HTMLInputElement).value).toBe('50.00')
      await userEvent.clear(screen.getByLabelText('Alice percent'))
      await userEvent.type(screen.getByLabelText('Alice percent'), '70')
      expect((screen.getByLabelText('Bob percent') as HTMLInputElement).value).toBe('30.00')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ split: { method: 'percent', percents: { u1: 70, u2: 30 } } })
      )
    })

    it('blocks Save when percentages do not total 100', async () => {
      mockMembers = MEMBERS
      const onSave = vi.fn()
      render(<CsvRowEditModal draft={twoOwner} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('tab', { name: '%' }))
      await userEvent.clear(screen.getByLabelText('Alice percent'))
      await userEvent.type(screen.getByLabelText('Alice percent'), '150')
      expect(screen.getByText('Percentages must total 100%.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).not.toHaveBeenCalled()
    })

    it('saves an even split as null (the default)', async () => {
      mockMembers = MEMBERS
      const onSave = vi.fn()
      render(<CsvRowEditModal draft={twoOwner} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith('draft-1', expect.objectContaining({ split: null }))
    })
  })
})

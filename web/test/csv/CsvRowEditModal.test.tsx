// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string) => k,
    householdMembers: [],
    transactions: [],
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
  splits: null,
  tags: [],
  notes: null,
  checked: true,
  isPaymentRow: false,
  duplicateOf: null,
  skipped: false,
}

describe('CsvRowEditModal', () => {
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
})

// @vitest-environment jsdom
//
// Review 2026-08-24, major A6: handleSave only ever set checked = true, so
// un-ticking "Include anyway" on a previously included duplicate produced a
// patch with no `checked` key — the reducer kept checked:true and the row the
// user explicitly excluded still imported. Saving must write the checkbox
// state in BOTH directions.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    currency: 'usd',
    rate: () => 1,
    t: (k: string) => k,
    householdMembers: [],
    transactions: [],
    cards: [],
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

const duplicateDraft: CsvDraftRow = {
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
  paymentSource: '',
  tags: [],
  notes: null,
  checked: true, // previously included by the user
  isPaymentRow: false,
  duplicateOf: 'existing-tx',
  skipped: false,
  edited: false,
}

describe('CsvRowEditModal duplicate include/exclude round trip (A6)', () => {
  it('un-ticking "Include anyway" saves checked: false', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<CsvRowEditModal draft={duplicateDraft} onSave={onSave} onSkip={vi.fn()} onClose={vi.fn()} />)

    const checkbox = screen.getByRole('checkbox', { name: /include anyway/i })
    expect((checkbox as HTMLInputElement).checked).toBe(true)
    await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][1]).toMatchObject({ checked: false })
  })
})

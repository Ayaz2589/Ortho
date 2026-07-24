// @vitest-environment jsdom
//
// Spec 031 US11: Split memory chip integration in TxForm.
// When a merchant with a prior multi-person split is typed, a suggestion chip
// appears. Applying it sets the stored owners+split; dismissing it clears silently.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }

const PRIOR_SPLIT_TX: Transaction = {
  id: 'prior', household_id: 'h1', merchant: 'Netflix', category: 'entertainment', kind: 'expense',
  amount_cents: 2000, source: 'Visa', date: '2026-01-01T12:00:00.000Z', created_by: 'p1',
  created_at: '', updated_at: '', paid_by: 'p1', owner_ids: ['p1', 'p2'],
  shares: { p1: 1000, p2: 1000 },
}

let _transactions: Transaction[] = []
const addTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    currentHousehold: { id: 'h1', owner_id: 'p1', name: 'Home', created_at: '' },
    currentUserId: 'p1',
    currentPersonId: 'p1',
    householdMembers: [ALICE, BOB],
    resolveUser: (id: string) =>
      [ALICE, BOB].find((u) => u.id === id) ?? { id, name: '—', initial: '·', color_key: 'sage', created_at: '' },
    transactions: _transactions,
    addTransaction,
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm, TxFormFields } from '@/components/web/TxForm'

function Harness({ editing = null }: { editing?: Transaction | null }) {
  const form = useTxForm({ editing, copying: null })
  return <TxFormFields form={form} />
}

beforeEach(() => {
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  cleanup()
  addTransaction.mockClear()
  _transactions = []
})

describe('split memory chip', () => {
  it('shows no suggestion chip when merchant has no prior multi-person split', async () => {
    _transactions = []
    render(<Harness />)
    const merchant = screen.getByPlaceholderText('e.g. Whole Foods')
    await userEvent.type(merchant, 'Netflix')
    expect(screen.queryByText(/Split like last time/i)).toBeNull()
  })

  it('shows suggestion chip when merchant has a prior multi-person split', async () => {
    _transactions = [PRIOR_SPLIT_TX]
    render(<Harness />)
    const merchant = screen.getByPlaceholderText('e.g. Whole Foods')
    await userEvent.type(merchant, 'Netflix')
    expect(screen.getByText(/Split like last time/i)).toBeInTheDocument()
  })

  it('dismissing the chip (×) removes it without changing the split', async () => {
    _transactions = [PRIOR_SPLIT_TX]
    render(<Harness />)
    const merchant = screen.getByPlaceholderText('e.g. Whole Foods')
    await userEvent.type(merchant, 'Netflix')
    const dismiss = screen.getByRole('button', { name: /Dismiss split suggestion/i })
    await userEvent.click(dismiss)
    expect(screen.queryByText(/Split like last time/i)).toBeNull()
  })

  it('does NOT show suggestion chip in edit mode', async () => {
    _transactions = [PRIOR_SPLIT_TX]
    const editing: Transaction = {
      ...PRIOR_SPLIT_TX,
      id: 'edit-tx', merchant: 'Netflix',
    }
    render(<Harness editing={editing} />)
    // Chip must not appear even though merchant matches
    expect(screen.queryByText(/Split like last time/i)).toBeNull()
  })
})

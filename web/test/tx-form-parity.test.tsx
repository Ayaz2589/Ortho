// @vitest-environment jsdom
//
// Parity behaviors of the transaction form (cross-app fix pass, 2026-07):
//  - saves the shared noon-UTC date convention (spec 004)
//  - edit pre-fills the LOCAL calendar day, not the UTC day
//  - editing locks the transfer boundary (kind can't cross it)
//  - an untouched amount in edit mode round-trips the stored cents exactly
//  - copying validates people against current membership and preserves a
//    custom split exactly
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'slate', created_at: '' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

// Mutable per-test store knobs (the vi.mock factory is static per file).
const store = { currency: 'usd' as string, rateVal: 1 }

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: store.currency,
    rate: () => store.rateVal,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    addTransaction,
    updateTransaction,
    tags: [],
    addTag: (name: string) => ({ id: `tag-${name.trim().toLowerCase()}`, household_id: 'h1', name: name.trim(), created_at: '' }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

// spec 050 made the shared owner set the DEFAULT for new transactions. These tests
// exercise mechanics that start from a single owner, so they pin the preference OFF —
// their subject is not the default. The shared default has its own coverage in
// test/transactions/shared-ownership-default.test.ts and shared-default-form.test.tsx.
beforeEach(() => {
  localStorage.setItem('ortho.sharedByDefault', 'false')
})


function Harness({
  editing = null,
  copying = null,
  onApi,
}: {
  editing?: Transaction | null
  copying?: Transaction | null
  onApi?: (api: TxFormApi) => void
}) {
  const form = useTxForm({ editing, copying })
  onApi?.(form)
  return (
    <div>
      <button disabled={!form.canSave} onClick={() => form.submit()}>
        Save
      </button>
      <TxFormFields form={form} />
    </div>
  )
}

function setup(props: { editing?: Transaction | null; copying?: Transaction | null } = {}) {
  let api: TxFormApi | null = null
  render(<Harness {...props} onApi={(a) => (api = a)} />)
  return {
    user: userEvent.setup(),
    getApi: () => api as TxFormApi,
    amount: () => document.querySelector('.ow-amount-input') as HTMLInputElement,
    merchant: () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement,
  }
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    household_id: 'h1',
    merchant: 'Whole Foods',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 1250,
    source: 'Visa',
    date: '2026-06-15T12:00:00.000Z',
    created_by: 'u1',
    created_at: '2026-06-15T12:00:00.000Z',
    updated_at: '2026-06-15T12:00:00.000Z',
    paid_by: 'u1',
    owner_ids: ['u1'],
    shares: { u1: 1250 },
    ...over,
  }
}

beforeEach(() => {
  store.currency = 'usd'
  store.rateVal = 1
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

afterEach(() => {
  addTransaction.mockClear()
  updateTransaction.mockClear()
})

describe('date convention', () => {
  it('saves noon UTC on the picked calendar day (spec 004)', async () => {
    const h = setup()
    await h.user.type(h.amount(), '10')
    await h.user.type(h.merchant(), 'Coffee Cart')
    expect(h.getApi().submit()).toBe(true)
    const saved = addTransaction.mock.calls[0][0] as Transaction
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/)
    expect(saved.date.slice(0, 10)).toBe(h.getApi().date)
  })

  it('pre-fills the LOCAL calendar day of the stored timestamp in edit mode', () => {
    // A legacy iOS-written evening timestamp: the local day (not the UTC day)
    // must be shown, so the form derives it via getFullYear/Month/Date.
    const stored = '2026-06-16T03:30:00.000Z'
    const h = setup({ editing: tx({ date: stored }) })
    const d = new Date(stored)
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    expect(h.getApi().date).toBe(expected)
  })
})

describe('edit-mode kind lock', () => {
  it('offers only expense/income when editing an expense', () => {
    const h = setup({ editing: tx() })
    expect(h.getApi().directionOptions).toEqual(['expense', 'income'])
    expect(screen.queryByRole('tab', { name: 'Transfer' })).toBeNull()
  })

  it('offers only transfer when editing a reimbursement', () => {
    const transfer = tx({
      kind: 'transfer',
      category: 'transfer',
      merchant: '',
      source: '',
      paid_by: 'u1',
      owner_ids: ['u2'],
      shares: { u2: 1250 },
    })
    const h = setup({ editing: transfer })
    expect(h.getApi().directionOptions).toEqual(['transfer'])
    expect(screen.queryByRole('tab', { name: 'Expense' })).toBeNull()
  })

  it('offers all three kinds when adding', () => {
    const h = setup()
    expect(h.getApi().directionOptions).toEqual(['expense', 'income', 'transfer'])
  })
})

describe('edit-mode amount FX round-trip', () => {
  it('preserves the stored cents verbatim when the amount is untouched', () => {
    // rate 0.5 means one display cent spans two stored cents — a re-encode of
    // the rounded display string would shift the amount.
    store.currency = 'gbp'
    store.rateVal = 0.5
    const h = setup({ editing: tx({ amount_cents: 101, shares: { u1: 101 } }) })
    expect(h.getApi().submit()).toBe(true)
    const saved = updateTransaction.mock.calls[0][0] as Transaction
    expect(saved.amount_cents).toBe(101)
    expect(saved.shares).toEqual({ u1: 101 })
  })

  it('re-encodes when the amount was edited', async () => {
    const h = setup({ editing: tx({ amount_cents: 1250 }) })
    await h.user.clear(h.amount())
    await h.user.type(h.amount(), '20')
    expect(h.getApi().submit()).toBe(true)
    const saved = updateTransaction.mock.calls[0][0] as Transaction
    expect(saved.amount_cents).toBe(2000)
  })
})

describe('tags & notes (spec 027)', () => {
  it('adds a tag via the editor and a note, saving both on submit (empty note → null)', async () => {
    const h = setup()
    await h.user.type(h.amount(), '10')
    await h.user.type(h.merchant(), 'Airbnb')
    await h.user.type(screen.getByLabelText('Add a tag'), 'vacation')
    await h.user.keyboard('{Enter}')
    await h.user.type(screen.getByLabelText('Notes'), 'weekend trip')
    expect(h.getApi().submit()).toBe(true)
    const saved = addTransaction.mock.calls[0][0] as Transaction
    expect(saved.tags).toEqual(['tag-vacation'])
    expect(saved.notes).toBe('weekend trip')
  })

  it('a whitespace-only note is stored as null', async () => {
    const h = setup()
    await h.user.type(h.amount(), '10')
    await h.user.type(h.merchant(), 'Coffee')
    await h.user.type(screen.getByLabelText('Notes'), '   ')
    expect(h.getApi().submit()).toBe(true)
    const saved = addTransaction.mock.calls[0][0] as Transaction
    expect(saved.notes).toBeNull()
  })

  it('edit mode pre-fills existing tags and notes', () => {
    const h = setup({ editing: tx({ tags: ['tag-work'], notes: 'client dinner' }) })
    expect(h.getApi().tags).toEqual(['tag-work'])
    expect(h.getApi().notes).toBe('client dinner')
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('client dinner')
  })
})

describe('copy prefill', () => {
  it('drops owners/payer that are no longer household members', () => {
    const src = tx({
      owner_ids: ['ghost'],
      paid_by: 'ghost',
      shares: { ghost: 1250 },
    })
    const h = setup({ copying: src })
    expect(h.getApi().owners).toEqual(['u1'])
    expect(h.getApi().paidBy).toBe('u1')
  })

  it('preserves a custom (non-even) split exactly via loadFrom', () => {
    const custom = tx({
      amount_cents: 10000,
      owner_ids: ['u1', 'u2'],
      shares: { u1: 7000, u2: 3000 },
    })
    const h = setup()
    act(() => h.getApi().loadFrom(custom))
    expect(h.getApi().splitMethod).toBe('value')
    expect(h.getApi().splitText).toEqual({ u1: '70.00', u2: '30.00' })
  })

  it('seeds a custom split as by-value when opened in copy mode', () => {
    const custom = tx({
      amount_cents: 10000,
      owner_ids: ['u1', 'u2'],
      shares: { u1: 7000, u2: 3000 },
    })
    const h = setup({ copying: custom })
    expect(h.getApi().splitMethod).toBe('value')
    expect(h.getApi().splitText).toEqual({ u1: '70.00', u2: '30.00' })
    expect(h.getApi().submit()).toBe(true)
    const saved = addTransaction.mock.calls[0][0] as Transaction
    expect(saved.shares).toEqual({ u1: 7000, u2: 3000 })
  })
})

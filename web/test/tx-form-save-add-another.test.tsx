// @vitest-environment jsdom
//
// "Save and add another" keeps all fields — the form stays fully pre-filled for
// the next entry after a save so batch entry doesn't force re-typing shared
// context. Covers the deliberate divergence from the prior iOS-mirrored
// `resetFormForAnotherEntry` clear behavior (PARITY.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'slate', created_at: '' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    resolveUser: (id: string) => ({ id, name: id, initial: id[0].toUpperCase(), color_key: 'sage', created_at: '' }),
    addTransaction,
    updateTransaction,
    tags: [],
    addTag: (name: string) => ({ id: `tag-${name.trim().toLowerCase()}`, household_id: 'h1', name: name.trim(), created_at: '' }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm, TxFormFields, SaveAndAddAnotherButton, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: null, copying: null })
  onApi?.(form)
  return (
    <div>
      <TxFormFields form={form} />
      <SaveAndAddAnotherButton form={form} />
    </div>
  )
}

function setup() {
  let api: TxFormApi | null = null
  render(<Harness onApi={(a) => (api = a)} />)
  return {
    user: userEvent.setup(),
    getApi: () => api as TxFormApi,
    amount: () => document.querySelector('.ow-amount-input') as HTMLInputElement,
    merchant: () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement,
    notes: () => screen.getByLabelText('Notes') as HTMLTextAreaElement,
    saveAndAddAnother: () => screen.getByRole('button', { name: 'Save and add another' }),
  }
}

beforeEach(() => {
  // jsdom provides crypto.randomUUID natively — no shim needed.
  // Each submit() call receives a real, distinct UUID from the environment.
})

afterEach(() => {
  addTransaction.mockClear()
  updateTransaction.mockClear()
})

describe('"Save and add another" field retention', () => {
  it('merchant, amount, notes, and a non-default category survive resetForAnother', async () => {
    const h = setup()

    await h.user.type(h.amount(), '25.50')
    await h.user.type(h.merchant(), 'Whole Foods')
    await h.user.type(h.notes(), 'weekly groceries')
    // Switch to a non-default category so the old reset-to-'groceries' is detectable.
    act(() => h.getApi().setCategory('dining'))
    expect(h.getApi().category).toBe('dining')

    act(() => {
      h.getApi().submit()
      h.getApi().resetForAnother()
    })

    expect(addTransaction).toHaveBeenCalledTimes(1)
    expect(h.getApi().merchant).toBe('Whole Foods')
    expect(h.getApi().amount).toBe('25.50')
    expect(h.getApi().notes).toBe('weekly groceries')
    expect(h.getApi().category).toBe('dining')
  })

  it('source, date, and owners are preserved (regression: these were already kept)', async () => {
    const h = setup()

    await h.user.type(h.amount(), '10')
    await h.user.type(h.merchant(), 'Coffee')

    const sourceBefore = h.getApi().source
    const dateBefore = h.getApi().date
    const ownersBefore = [...h.getApi().owners]

    act(() => {
      h.getApi().submit()
      h.getApi().resetForAnother()
    })

    expect(h.getApi().source).toBe(sourceBefore)
    expect(h.getApi().date).toBe(dateBefore)
    expect(h.getApi().owners).toEqual(ownersBefore)
  })

  it('splits survive after resetForAnother (two-owner percent split)', async () => {
    const h = setup()

    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Restaurant')

    // Add Bob as co-owner then set a custom 60/40 percent split.
    act(() => h.getApi().toggleOwner('u2'))
    act(() => h.getApi().setSplitMethod('percent'))
    act(() => h.getApi().setSplitPercent('u1', '60'))

    const splitMethodBefore = h.getApi().splitMethod
    const splitTextBefore = { ...h.getApi().splitText }

    act(() => {
      h.getApi().submit()
      h.getApi().resetForAnother()
    })

    expect(addTransaction).toHaveBeenCalledTimes(1)
    expect(h.getApi().splitMethod).toBe(splitMethodBefore)
    expect(h.getApi().splitText).toEqual(splitTextBefore)
  })

  it('a second submit produces a distinct transaction id with the same pre-filled values', async () => {
    const h = setup()

    await h.user.type(h.amount(), '15')
    await h.user.type(h.merchant(), 'Starbucks')

    act(() => {
      h.getApi().submit()
      h.getApi().resetForAnother()
    })
    act(() => { h.getApi().submit() })

    expect(addTransaction).toHaveBeenCalledTimes(2)
    const tx1 = addTransaction.mock.calls[0][0] as Transaction
    const tx2 = addTransaction.mock.calls[1][0] as Transaction

    // Each save is a distinct new transaction.
    expect(tx1.id).not.toBe(tx2.id)
    // Both carry the same pre-filled merchant and amount.
    expect(tx1.merchant).toBe('Starbucks')
    expect(tx2.merchant).toBe('Starbucks')
    expect(tx1.amount_cents).toBe(1500)
    expect(tx2.amount_cents).toBe(1500)
  })

  it('clicking SaveAndAddAnotherButton keeps the form pre-filled (no fields cleared)', async () => {
    const h = setup()

    await h.user.type(h.amount(), '12.00')
    await h.user.type(h.merchant(), 'Target')
    await h.user.type(h.notes(), 'household items')

    await h.user.click(h.saveAndAddAnother())

    expect(addTransaction).toHaveBeenCalledTimes(1)
    expect(h.getApi().merchant).toBe('Target')
    expect(h.getApi().amount).toBe('12.00')
    expect(h.getApi().notes).toBe('household items')
  })
})

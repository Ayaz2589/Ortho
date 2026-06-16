// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

// Two household people; the current person (Alice) is the default owner.
const ALICE: User = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }

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
    addTransaction,
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: null, copying: null })
  onApi?.(form)
  return (
    <div>
      <button disabled={!form.canSave} onClick={() => form.submit()}>
        Add
      </button>
      <TxFormFields form={form} />
    </div>
  )
}

function setup() {
  let api: TxFormApi | null = null
  render(<Harness onApi={(a) => (api = a)} />)
  return {
    user: userEvent.setup(),
    getApi: () => api as TxFormApi,
    addBtn: () => screen.getByRole('button', { name: 'Add' }),
    amount: () => document.querySelector('.ow-amount-input') as HTMLInputElement,
    merchant: () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement,
  }
}

beforeEach(() => {
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => addTransaction.mockClear())

describe('split editor', () => {
  it('hides the editor for a single owner; the owner takes the full amount', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Whole Foods')
    expect(screen.queryByRole('tab', { name: 'Even' })).toBeNull()
    expect(h.getApi().submit()).toBe(true)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(tx.owner_ids).toEqual(['p1'])
    expect(tx.shares).toEqual({ p1: 10000 })
  })

  it('multi-owner shows an even split by default', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    await h.user.click(screen.getByRole('button', { name: /Bob/ }))
    // Even method present + each owner shows $50.00.
    expect(screen.getByRole('tab', { name: 'Even' })).toBeInTheDocument()
    expect(h.getApi().shares).toEqual({ p1: 5000, p2: 5000 })
  })

  it('by-percent entry reconciles and saves; a bad total blocks save', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    await h.user.click(screen.getByRole('button', { name: /Bob/ }))
    await h.user.click(screen.getByRole('tab', { name: '%' }))

    await h.user.type(screen.getByLabelText('Alice percent'), '70')
    await h.user.type(screen.getByLabelText('Bob percent'), '30')
    expect(h.getApi().shares).toEqual({ p1: 7000, p2: 3000 })
    expect(h.addBtn()).toBeEnabled()

    // Break the total → save disabled + reconcile message.
    await h.user.clear(screen.getByLabelText('Bob percent'))
    await h.user.type(screen.getByLabelText('Bob percent'), '25')
    expect(h.addBtn()).toBeDisabled()
    expect(screen.getByText('Percentages must total 100%.')).toBeInTheDocument()
  })

  it('by-value entry reconciles to the exact amount', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    await h.user.click(screen.getByRole('button', { name: /Bob/ }))
    await h.user.click(screen.getByRole('tab', { name: '$' }))

    await h.user.type(screen.getByLabelText('Alice amount'), '60')
    await h.user.type(screen.getByLabelText('Bob amount'), '40')
    expect(h.addBtn()).toBeEnabled()
    expect(h.getApi().submit()).toBe(true)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(tx.shares).toEqual({ p1: 6000, p2: 4000 })
  })

  it('removing the second owner returns to a single full-amount owner', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    await h.user.click(screen.getByRole('button', { name: /Bob/ })) // add
    expect(h.getApi().owners).toHaveLength(2)
    await h.user.click(screen.getByRole('button', { name: /Bob/ })) // remove
    expect(h.getApi().owners).toEqual(['p1'])
    expect(screen.queryByRole('tab', { name: 'Even' })).toBeNull()
  })
})

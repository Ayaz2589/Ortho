// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

// ---------------------------------------------------------------------------
// Controlled app store. useTxForm reads: currency, rate, cards, currentHousehold,
// currentUserId, householdMembers, personalParticipants, addTransaction,
// updateTransaction.
// ---------------------------------------------------------------------------
const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1, // display currency == USD, 1:1
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    addTransaction,
    updateTransaction,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

// A minimal harness that drives the real hook through the real field stack and
// exposes the canSave-gated submit button exactly like TxFormContent does.
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
  const user = userEvent.setup()
  render(<Harness onApi={(a) => (api = a)} />)
  return {
    user,
    getApi: () => api as TxFormApi,
    addBtn: () => screen.getByRole('button', { name: 'Add' }),
    amount: () => document.querySelector('.ow-amount-input') as HTMLInputElement,
    merchant: () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 12))
  // Submit relies on crypto.randomUUID for new transactions.
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

afterEach(() => {
  vi.useRealTimers()
  addTransaction.mockClear()
  updateTransaction.mockClear()
})

describe('useTxForm validation (via TxFormFields harness)', () => {
  it('disables save with empty amount or empty merchant', async () => {
    vi.useRealTimers()
    const h = setup()
    // Initial: amount empty, merchant empty -> cannot save.
    expect(h.addBtn()).toBeDisabled()
    expect(h.getApi().canSave).toBe(false)

    // Amount only, still no merchant -> cannot save.
    await h.user.type(h.amount(), '12.00')
    expect(h.addBtn()).toBeDisabled()

    // Merchant only, no amount -> cannot save.
    await h.user.clear(h.amount())
    await h.user.type(h.merchant(), 'Whole Foods')
    expect(h.addBtn()).toBeDisabled()
  })

  it('enables save once amount > 0 and merchant are set (default owner seeded)', async () => {
    vi.useRealTimers()
    const h = setup()
    await h.user.type(h.amount(), '12.50')
    await h.user.type(h.merchant(), 'Whole Foods')
    // The current person is seeded as the sole owner, satisfying ">=1 owner".
    expect(h.getApi().owners.length).toBeGreaterThan(0)
    expect(h.getApi().canSave).toBe(true)
    expect(h.addBtn()).toBeEnabled()
  })

  it('treats a zero amount as invalid', async () => {
    vi.useRealTimers()
    const h = setup()
    await h.user.type(h.amount(), '0')
    await h.user.type(h.merchant(), 'Whole Foods')
    expect(h.getApi().canSave).toBe(false)
    expect(h.addBtn()).toBeDisabled()
  })

  it('submit() returns false and does not call addTransaction when invalid', async () => {
    vi.useRealTimers()
    const h = setup()
    await h.user.type(h.merchant(), 'Whole Foods') // amount still empty
    expect(h.getApi().submit()).toBe(false)
    expect(addTransaction).not.toHaveBeenCalled()
  })

  it('submit() returns true and calls addTransaction with the entered values when valid', async () => {
    vi.useRealTimers()
    const h = setup()
    await h.user.type(h.amount(), '12.50')
    await h.user.type(h.merchant(), 'Whole Foods')
    expect(h.getApi().submit()).toBe(true)
    expect(addTransaction).toHaveBeenCalledTimes(1)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(tx.merchant).toBe('Whole Foods')
    expect(tx.amount_cents).toBe(1250) // 12.50 USD -> 1250 cents
    expect(tx.kind).toBe('expense')
    expect(tx.owner_ids).toContain('u1')
    expect(tx.shares).toEqual({ u1: 1250 })
    expect(updateTransaction).not.toHaveBeenCalled()
  })
})

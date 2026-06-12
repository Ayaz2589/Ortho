// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

// A household of one Ortho user (you) + another member, plus a device-only
// local user that may only participate in PERSONAL transactions.
const ME: User = { id: 'u1', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'slate', created_at: '2026-01-01' }
const LARRY = { id: 'l1', name: 'Larry', initial: 'L', color_key: 'peach', created_at: '' } as User

const addTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    householdMembers: [ME, BOB],
    personalParticipants: [ME, LARRY], // you + the local user
    addTransaction,
    updateTransaction: vi.fn(),
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
  const user = userEvent.setup()
  render(<Harness onApi={(a) => (api = a)} />)
  return {
    user,
    getApi: () => api as TxFormApi,
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

describe('attaching a local user to a personal transaction', () => {
  it('hides local users in shared scope and shows them in personal scope', async () => {
    const h = setup()
    // Shared (default): household members are the owners; the local user is not.
    expect(screen.getByRole('button', { name: /Bob/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Larry/ })).toBeNull()

    await h.user.click(screen.getByRole('tab', { name: 'Personal' }))
    // Personal: you + local users are selectable; the other Ortho member is not.
    expect(h.getApi().scope).toBe('personal')
    expect(screen.getByRole('button', { name: /Larry/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bob/ })).toBeNull()
  })

  it('attaches the local user as a co-owner on submit', async () => {
    const h = setup()
    await h.user.type(h.amount(), '30')
    await h.user.type(h.merchant(), 'Whole Foods')
    await h.user.click(screen.getByRole('tab', { name: 'Personal' }))
    await h.user.click(screen.getByRole('button', { name: /Larry/ }))

    expect(h.getApi().owners).toEqual(expect.arrayContaining(['u1', 'l1']))
    expect(h.getApi().submit()).toBe(true)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(tx.scope).toBe('personal')
    expect(tx.household_id).toBeNull()
    expect(tx.owner_ids).toEqual(expect.arrayContaining(['u1', 'l1']))
  })
})

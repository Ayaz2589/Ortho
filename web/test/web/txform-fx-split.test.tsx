// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Transaction, User } from '@/lib/types'

// ---------------------------------------------------------------------------
// B1 (spec 023): editing a custom (by-value) split in a NON-USD display currency
// must keep the per-owner shares summing to the transaction total — the #1 money
// invariant — and must not falsely block Save. The parent amount is already
// protected from cents→display→cents FX round-trip drift by the
// `originalAmountText` guard; the split shares must get the same protection.
//
// Display currency = GBP at 0.78 (1 USD → 0.78 GBP), a rate at which the
// round-trip is lossy: centsToDisplay(2, .78) = "0.02", parseMoney("0.02", .78) = 3.
// So a stored split {u1: 2, u2: 9} on an 11¢ total re-parses to {3, 9} (sum 12),
// which currently gets written verbatim — 12 ≠ 11, breaking the invariant.
// ---------------------------------------------------------------------------
const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'gbp',
    rate: () => 0.78,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    resolveUser: (id: string) => ({ id, name: id, initial: id[0], color_key: 'sage', created_at: '2026-01-01' }),
    addTransaction,
    updateTransaction,
    formatMoney: (c: number) => `£${((c / 100) * 0.78).toFixed(2)}`,
    t: (k: string) => k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

const EDIT_TX: Transaction = {
  id: 't1',
  household_id: 'h1',
  merchant: 'Dinner',
  category: 'groceries',
  kind: 'expense',
  amount_cents: 11,
  source: 'Visa',
  date: '2026-06-10T12:00:00.000Z',
  paid_by: 'u1',
  owner_ids: ['u1', 'u2'],
  shares: { u1: 2, u2: 9 },
  created_by: 'u1',
  created_at: '2026-06-10T00:00:00.000Z',
  updated_at: '2026-06-10T00:00:00.000Z',
}

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: EDIT_TX, copying: null })
  onApi?.(form)
  return (
    <div>
      <button disabled={!form.canSave} onClick={() => form.submit()}>Save</button>
      <TxFormFields form={form} />
    </div>
  )
}

beforeEach(() => {
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  addTransaction.mockClear()
  updateTransaction.mockClear()
})

describe('useTxForm B1: FX split-share invariant (non-USD display currency)', () => {
  it('a no-op edit in GBP keeps per-owner shares summing to the total and does not block Save', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    // Nothing was touched. Save must be enabled...
    expect(api!.canSave).toBe(true)

    // ...and saving must preserve sum(shares) === amount_cents (currently 12 ≠ 11).
    expect(api!.submit()).toBe(true)
    expect(updateTransaction).toHaveBeenCalledTimes(1)
    const tx = updateTransaction.mock.calls[0][0] as Transaction
    const sum = Object.values(tx.shares).reduce((s, c) => s + c, 0)
    expect(tx.amount_cents).toBe(11)
    expect(sum).toBe(tx.amount_cents)
    // The exact stored per-owner cents are preserved (no display round-trip drift).
    expect(tx.shares).toEqual({ u1: 2, u2: 9 })
  })
})

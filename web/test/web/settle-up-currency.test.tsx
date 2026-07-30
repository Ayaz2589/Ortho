// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Transaction, User } from '@/lib/types'

// ---------------------------------------------------------------------------
// B9-settle (spec 023): a settle-up transfer prefilled from the exact USD-cents
// balance must create a transfer that ZEROES the balance, even in a non-USD
// display currency. The prefill amount is seeded via centsToDisplay and, if the
// user doesn't touch it, must be reused verbatim — otherwise the FX round-trip
// (11¢ → "0.09" → 12¢ at GBP 0.78) leaves the pair unsettled by a cent.
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

import { useTxForm, type TxFormApi, type TransferPrefill } from '@/components/web/TxForm'

// Bob owes Alice 11¢; the exact balance is carried into the transfer prefill.
const PREFILL: TransferPrefill = { from: 'u2', to: 'u1', amountCents: 11 }

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: null, copying: null, initialTransfer: PREFILL })
  onApi?.(form)
  return null
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

describe('useTxForm B9: settle-up transfer zeroes the balance in a non-USD currency', () => {
  it('an untouched settle-up prefill saves the exact balance cents (no FX drift)', () => {
    let api: TxFormApi | null = null
    render(<Harness onApi={(a) => (api = a)} />)

    expect(api!.canSave).toBe(true)
    expect(api!.submit()).toBe(true)
    expect(addTransaction).toHaveBeenCalledTimes(1)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    // The transfer must be for the exact 11¢ balance, not the drifted 12¢.
    expect(tx.amount_cents).toBe(11)
    expect(tx.shares).toEqual({ u1: 11 })
  })
})

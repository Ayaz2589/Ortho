// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { Transaction, User } from '@/lib/types'

// ---------------------------------------------------------------------------
// Review 2026-08-24, major B8: under a non-USD display currency, choosing the
// by-value split seeds per-owner fields in DISPLAY units (evenValueStrings),
// but validation re-parses each field independently to USD cents. Under a
// lossy rate the independently-rounded shares frequently miss the total by a
// cent, so the moment the user taps the value-split segment, Save is blocked
// with values the app itself computed. The drift (bounded by one cent per
// owner) must be absorbed so the app's own seeds are always valid.
//
// GBP at 0.78: amount "1.11" → 142¢; even seeds ["0.55","0.56"] → 71 + 72 =
// 143 ≠ 142 (the pre-fix false block).
// ---------------------------------------------------------------------------
const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }

const addTransaction = vi.fn()

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
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `£${((c / 100) * 0.78).toFixed(2)}`,
    t: (k: string) => k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi }: { onApi?: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: null, copying: null })
  onApi?.(form)
  return <TxFormFields form={form} />
}

beforeEach(() => {
  addTransaction.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

describe('by-value split seeds under a lossy display rate (B8)', () => {
  it("the app's own even seeds validate and save with shares summing to the total", () => {
    let api: TxFormApi = null as never
    render(<Harness onApi={(a) => (api = a)} />)

    act(() => {
      api.setAmount('1.11')
      api.setMerchant('Dinner')
    })
    act(() => {
      api.setSplitMethod('value')
    })

    expect(api.splitOk).toBe(true)
    expect(api.canSave).toBe(true)

    let saved = false
    act(() => {
      saved = api.submit()
    })
    expect(saved).toBe(true)
    expect(addTransaction).toHaveBeenCalledTimes(1)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    const sum = Object.values(tx.shares).reduce((s, c) => s + c, 0)
    expect(sum).toBe(tx.amount_cents)
  })
})

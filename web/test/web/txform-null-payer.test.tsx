// @vitest-environment jsdom
//
// Review 2026-08-24, major A2: spec 053 FR-012 — a row with no payer must
// contribute nothing to balances, because inventing a payer fabricates debts.
// The edit form had no null-payer state: paidBy seeded to the editing person
// whenever src.paid_by was null and submit wrote it unconditionally, so fixing
// a typo on any pre-053 imported row silently converted paid_by from null to
// the editor. Editing must PRESERVE a legacy null payer unless the user
// actually picks one.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
const BOB: User = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }

const updateTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE, BOB],
    resolveUser: (id: string) => ({ id, name: id, initial: id[0], color_key: 'sage', created_at: '2026-01-01' }),
    addTransaction: vi.fn(),
    updateTransaction,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string) => k,
  }),
}))

import { useTxForm, type TxFormApi } from '@/components/web/TxForm'

// A pre-053 imported expense: no payer recorded.
const LEGACY: Transaction = {
  id: 't1',
  household_id: 'h1',
  merchant: 'Chase import',
  category: 'groceries',
  kind: 'expense',
  amount_cents: 5000,
  source: 'Chase',
  date: '2026-06-10T12:00:00.000Z',
  paid_by: null,
  owner_ids: ['u1', 'u2'],
  shares: { u1: 2500, u2: 2500 },
  created_by: 'u1',
  created_at: '2026-06-10T00:00:00.000Z',
  updated_at: '2026-06-10T00:00:00.000Z',
}

function Harness({ onApi }: { onApi: (api: TxFormApi) => void }) {
  const form = useTxForm({ editing: LEGACY, copying: null })
  onApi(form)
  return null
}

beforeEach(() => {
  updateTransaction.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})

describe('editing a legacy null-payer expense (A2)', () => {
  it('an unrelated edit preserves paid_by = null', () => {
    let api: TxFormApi = null as never
    render(<Harness onApi={(a) => (api = a)} />)

    act(() => {
      api.setMerchant('Whole Foods')
    })
    let ok = false
    act(() => {
      ok = api.submit()
    })
    expect(ok).toBe(true)
    expect(updateTransaction).toHaveBeenCalledTimes(1)
    expect((updateTransaction.mock.calls[0][0] as Transaction).paid_by).toBeNull()
  })

  it('explicitly picking a payer writes that payer', () => {
    let api: TxFormApi = null as never
    render(<Harness onApi={(a) => (api = a)} />)

    act(() => {
      api.setPaidBy('u2')
    })
    act(() => {
      api.submit()
    })
    expect((updateTransaction.mock.calls[0][0] as Transaction).paid_by).toBe('u2')
  })
})

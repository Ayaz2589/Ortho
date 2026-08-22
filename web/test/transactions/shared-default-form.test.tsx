// @vitest-environment jsdom
//
// spec 050 — the shared default and the one-tap "Who is this for?" control, at the form
// level. Companion to shared-ownership-default.test.ts (which covers the pure resolver and
// the preference). Harness mirrors test/split-editor.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }
const CARA: User = { id: 'p3', name: 'Cara', initial: 'C', color_key: 'peach', created_at: '' }

const addTransaction = vi.fn()
let members: User[] = [ALICE, BOB, CARA]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '' }],
    depositAccounts: [],
    currentHousehold: { id: 'h1', owner_id: 'p1', name: 'Home', created_at: '' },
    currentUserId: 'p1',
    currentPersonId: 'p1',
    householdMembers: members,
    resolveUser: (id: string) =>
      [ALICE, BOB, CARA].find((u) => u.id === id) ?? { id, name: '—', initial: '·', color_key: 'sage', created_at: '' },
    addTransaction,
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi, editing = null, copying = null }: {
  onApi?: (api: TxFormApi) => void
  editing?: Transaction | null
  copying?: Transaction | null
}) {
  const form = useTxForm({ editing, copying })
  onApi?.(form)
  return (
    <div>
      <button disabled={!form.canSave} onClick={() => form.submit()}>Add</button>
      <TxFormFields form={form} />
    </div>
  )
}

function setup(opts: { editing?: Transaction | null; copying?: Transaction | null } = {}) {
  let api: TxFormApi | null = null
  render(<Harness onApi={(a) => (api = a)} editing={opts.editing ?? null} copying={opts.copying ?? null} />)
  const user = userEvent.setup()
  return {
    user,
    getApi: () => api as TxFormApi,
    amount: () => document.querySelector('.ow-amount-input') as HTMLInputElement,
    merchant: () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement,
  }
}

function baseTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'src-1',
    household_id: 'h1',
    merchant: 'Dinner',
    category: 'dining',
    kind: 'expense',
    amount_cents: 1250,
    source: 'Visa',
    date: '2026-08-01T12:00:00.000Z',
    created_by: 'p1',
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    paid_by: 'p1',
    owner_ids: ['p1'],
    shares: { p1: 1250 },
    notes: null,
    ...over,
  } as Transaction
}

beforeEach(() => {
  members = [ALICE, BOB, CARA]
  localStorage.clear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => addTransaction.mockClear())

describe('spec 050 — a new transaction starts shared', () => {
  it('pre-selects every active person', () => {
    const h = setup()
    expect(h.getApi().owners).toEqual(['p1', 'p2', 'p3'])
  })

  it('persists one share row per person, summing to the amount', async () => {
    const h = setup()
    await h.user.type(h.amount(), '60')
    await h.user.type(h.merchant(), 'Whole Foods')
    expect(h.getApi().submit()).toBe(true)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(tx.owner_ids).toHaveLength(3)
    expect(tx.shares).toEqual({ p1: 2000, p2: 2000, p3: 2000 })
    expect(Object.values(tx.shares).reduce((s, c) => s + c, 0)).toBe(tx.amount_cents)
  })

  it('splits an indivisible amount without losing a cent', async () => {
    const h = setup()
    await h.user.type(h.amount(), '10')
    await h.user.type(h.merchant(), 'Coffee')
    expect(h.getApi().submit()).toBe(true)
    const tx = addTransaction.mock.calls[0][0] as Transaction
    expect(Object.values(tx.shares).reduce((s, c) => s + c, 0)).toBe(1000)
  })

  it('leaves a ONE-person household on the single owner', () => {
    members = [ALICE]
    const h = setup()
    expect(h.getApi().owners).toEqual(['p1'])
  })

  it('respects the preference when it is turned off', () => {
    localStorage.setItem('ortho.sharedByDefault', 'false')
    const h = setup()
    expect(h.getApi().owners).toEqual(['p1'])
  })

  it('does NOT re-attribute an existing transaction being edited', () => {
    const h = setup({ editing: baseTx({ owner_ids: ['p2'], shares: { p2: 1250 } }) })
    expect(h.getApi().owners).toEqual(['p2'])
  })

  it('keeps a copied transaction’s own owners rather than the default', () => {
    const h = setup({ copying: baseTx({ owner_ids: ['p2'], shares: { p2: 1250 } }) })
    expect(h.getApi().owners).toEqual(['p2'])
  })
})

describe('spec 050 — "Who is this for?" is one tap', () => {
  const preset = (name: string) => screen.getByRole('tab', { name })

  it('offers both presets in a shared household', () => {
    setup()
    expect(preset('Everyone')).toBeInTheDocument()
    expect(preset('Just me')).toBeInTheDocument()
  })

  it('is not rendered at all for a one-person household', () => {
    members = [ALICE]
    setup()
    expect(screen.queryByRole('tab', { name: 'Everyone' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Just me' })).toBeNull()
  })

  it('narrows to the current person in one tap', async () => {
    const h = setup()
    await h.user.click(preset('Just me'))
    expect(h.getApi().owners).toEqual(['p1'])
  })

  it('expands back to everyone in one tap', async () => {
    const h = setup()
    await h.user.click(preset('Just me'))
    await h.user.click(preset('Everyone'))
    expect(h.getApi().owners).toEqual(['p1', 'p2', 'p3'])
  })

  it('marks the matching preset as selected', async () => {
    const h = setup()
    expect(preset('Everyone')).toHaveAttribute('aria-selected', 'true')
    await h.user.click(preset('Just me'))
    expect(preset('Just me')).toHaveAttribute('aria-selected', 'true')
    expect(preset('Everyone')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows NEITHER preset as selected for a custom subset', () => {
    const h = setup({ copying: baseTx({ owner_ids: ['p1', 'p2'], shares: { p1: 625, p2: 625 } }) })
    expect(h.getApi().owners).toEqual(['p1', 'p2'])
    expect(preset('Everyone')).toHaveAttribute('aria-selected', 'false')
    expect(preset('Just me')).toHaveAttribute('aria-selected', 'false')
  })

  it('re-splits evenly after narrowing then expanding', async () => {
    const h = setup()
    await h.user.type(h.amount(), '90')
    await h.user.type(h.merchant(), 'Groceries')
    await h.user.click(preset('Just me'))
    await h.user.click(preset('Everyone'))
    expect(h.getApi().shares).toEqual({ p1: 3000, p2: 3000, p3: 3000 })
  })
})

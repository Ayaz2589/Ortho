// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

// Two ACTIVE household people; the current person (Alice) is the default owner.
const ALICE: User = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }
// Carol was REMOVED from the household (not in householdMembers) but is still
// referenced by older transactions — resolveUser must still resolve her.
const CAROL: User = { id: 'p3', name: 'Carol', initial: 'C', color_key: 'peach', created_at: '' }

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
    resolveUser: (id: string) =>
      [ALICE, BOB, CAROL].find((u) => u.id === id) ?? { id, name: '—', initial: '·', color_key: 'sage', created_at: '' },
    addTransaction,
    updateTransaction: vi.fn(),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({ onApi, editing = null }: { onApi?: (api: TxFormApi) => void; editing?: Transaction | null }) {
  const form = useTxForm({ editing, copying: null })
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
    // Switch to "We each paid" mode — sets owners to all members (Alice + Bob)
    await h.user.click(screen.getByRole('tab', { name: /We each paid/i }))
    // Even method present + each owner shows $50.00.
    expect(screen.getByRole('tab', { name: 'Even' })).toBeInTheDocument()
    expect(h.getApi().shares).toEqual({ p1: 5000, p2: 5000 })
  })

  it('switching to percent seeds even values and editing one field rebalances the other (iOS mirror)', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    // Switch to "We each paid" mode — sets owners to all members
    await h.user.click(screen.getByRole('tab', { name: /We each paid/i }))
    await h.user.click(screen.getByRole('tab', { name: '%' }))

    // Seeded even — the editor opens valid.
    expect((screen.getByLabelText('Alice percent') as HTMLInputElement).value).toBe('50.00')
    expect((screen.getByLabelText('Bob percent') as HTMLInputElement).value).toBe('50.00')
    expect(h.addBtn()).toBeEnabled()

    // Editing Alice live-rebalances Bob so the total stays 100.
    await h.user.clear(screen.getByLabelText('Alice percent'))
    await h.user.type(screen.getByLabelText('Alice percent'), '70')
    expect((screen.getByLabelText('Bob percent') as HTMLInputElement).value).toBe('30.00')
    expect(h.getApi().shares).toEqual({ p1: 7000, p2: 3000 })
    expect(h.addBtn()).toBeEnabled()

    // An over-100 entry leaves nothing for the others → total ≠ 100 → blocked.
    await h.user.clear(screen.getByLabelText('Alice percent'))
    await h.user.type(screen.getByLabelText('Alice percent'), '150')
    expect((screen.getByLabelText('Bob percent') as HTMLInputElement).value).toBe('0.00')
    expect(h.addBtn()).toBeDisabled()
    expect(screen.getByText('Percentages must total 100%.')).toBeInTheDocument()
  })

  it('by-value entry seeds even and reconciles to the exact amount', async () => {
    const h = setup()
    await h.user.type(h.amount(), '100')
    await h.user.type(h.merchant(), 'Dinner')
    // Switch to "We each paid" mode — sets owners to all members
    await h.user.click(screen.getByRole('tab', { name: /We each paid/i }))
    await h.user.click(screen.getByRole('tab', { name: '$' }))

    // Seeded to an even split of the entered amount.
    expect((screen.getByLabelText('Alice amount') as HTMLInputElement).value).toBe('50.00')
    expect((screen.getByLabelText('Bob amount') as HTMLInputElement).value).toBe('50.00')

    await h.user.clear(screen.getByLabelText('Alice amount'))
    await h.user.type(screen.getByLabelText('Alice amount'), '60')
    await h.user.clear(screen.getByLabelText('Bob amount'))
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
    // Switch to "We each paid" — adds all members (Alice + Bob)
    await h.user.click(screen.getByRole('tab', { name: /We each paid/i }))
    expect(h.getApi().owners).toHaveLength(2)
    // Click Bob's chip to deselect him from the split
    await h.user.click(screen.getByRole('button', { name: /Bob/ }))
    expect(h.getApi().owners).toEqual(['p1'])
    expect(screen.queryByRole('tab', { name: 'Even' })).toBeNull()
  })

  it('edit mode still renders an owner who was since removed from the household', () => {
    // A 50/50 expense owned by Alice (active) + Carol (removed). The removed
    // owner must still show as a chip and a named split row — not "—".
    const editing: Transaction = {
      id: 'tx1', household_id: 'h1', merchant: 'Dinner', category: 'dining', kind: 'expense',
      amount_cents: 10000, source: 'Visa', date: '2026-01-01T12:00:00.000Z', created_by: 'p1',
      created_at: '', updated_at: '', paid_by: 'p1', owner_ids: ['p1', 'p3'],
      shares: { p1: 5000, p3: 5000 },
    }
    render(<Harness editing={editing} />)
    // Both owners render (chip + split-editor row); Carol is not dropped or "—".
    expect(screen.getAllByText('Carol').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    const owners = screen.getByText('Owners').closest('.ow-card') as HTMLElement
    expect(owners).not.toBeNull()
    expect(owners.textContent).not.toContain('—')
  })
})

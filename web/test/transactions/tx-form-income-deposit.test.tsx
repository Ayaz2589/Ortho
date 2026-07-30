// @vitest-environment jsdom
// spec 033 — "Deposit to" picker on income transactions:
//   - income form shows configured deposit accounts (not hardcoded strings)
//   - empty state shows "No accounts yet" placeholder
//   - orphan source value renders verbatim
//   - direction toggle expense→income resets source to first deposit account
//   - direction toggle income→expense resets source to first card
//   - expense form is unaffected (uses cards, not deposit accounts)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }

const addTransaction = vi.fn()
const updateTransaction = vi.fn()

const store = {
  cards: [{ id: 'c1', household_id: 'h1', name: 'Chase Sapphire', created_at: '' }],
  depositAccounts: [
    { id: 'da-1', household_id: 'h1', name: 'Chase Checking', created_at: '' },
    { id: 'da-2', household_id: 'h1', name: 'Joint Savings', created_at: '' },
  ] as Array<{ id: string; household_id: string; name: string; created_at: string }>,
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: store.cards,
    depositAccounts: store.depositAccounts,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' },
    currentUserId: 'u1',
    currentPersonId: 'u1',
    householdMembers: [ALICE],
    resolveUser: (id: string) => ({ id, name: id, initial: '?', color_key: 'sage', created_at: '' }),
    addTransaction,
    updateTransaction,
    tags: [],
    transactions: [],
    addTag: (name: string) => ({ id: `tag-${name}`, household_id: 'h1', name, created_at: '' }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { useTxForm, TxFormFields, type TxFormApi } from '@/components/web/TxForm'

function Harness({
  editing = null,
  copying = null,
  onApi,
}: {
  editing?: Transaction | null
  copying?: Transaction | null
  onApi?: (api: TxFormApi) => void
}) {
  const form = useTxForm({ editing, copying })
  onApi?.(form)
  return <TxFormFields form={form} />
}

function setup(props: { editing?: Transaction | null; copying?: Transaction | null } = {}) {
  let api: TxFormApi | null = null
  render(<Harness {...props} onApi={(a) => (api = a)} />)
  return { user: userEvent.setup(), getApi: () => api as TxFormApi }
}

function incomeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    household_id: 'h1',
    merchant: 'Acme Co.',
    category: 'salary',
    kind: 'income',
    amount_cents: 300000,
    source: 'Chase Checking',
    date: '2026-07-01T12:00:00.000Z',
    created_by: 'u1',
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
    paid_by: null,
    owner_ids: ['u1'],
    shares: { 'u1': 300000 },
    tags: [],
    notes: null,
    ...over,
  }
}

describe('TxForm — income deposit accounts (spec 033)', () => {
  beforeEach(() => {
    addTransaction.mockClear()
    updateTransaction.mockClear()
    store.depositAccounts = [
      { id: 'da-1', household_id: 'h1', name: 'Chase Checking', created_at: '' },
      { id: 'da-2', household_id: 'h1', name: 'Joint Savings', created_at: '' },
    ]
    store.cards = [{ id: 'c1', household_id: 'h1', name: 'Chase Sapphire', created_at: '' }]
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('income form shows deposit account names in the "Deposit to" select', async () => {
    const { user, getApi } = setup()
    // Switch to income
    const incomeBtn = screen.getByText('Income')
    await user.click(incomeBtn)

    // The "Deposit to" row should not contain the old hardcoded strings
    expect(screen.queryByText('ACH · Checking')).toBeNull()
    expect(screen.queryByText('ACH · Joint')).toBeNull()
    expect(screen.queryByText('Wire')).toBeNull()

    // Should show configured deposit accounts
    expect(screen.queryByText('Chase Checking')).toBeTruthy()
    expect(screen.queryByText('Joint Savings')).toBeTruthy()

    void getApi
  })

  it('income form shows "No accounts yet" when depositAccounts is empty', async () => {
    store.depositAccounts = []
    const { user } = setup()
    const incomeBtn = screen.getByText('Income')
    await user.click(incomeBtn)
    expect(screen.queryByText('No accounts yet')).toBeTruthy()
  })

  it('expense form shows cards, not deposit accounts', () => {
    setup()
    // Default is expense — "Paid with" shows cards
    expect(screen.queryByText('Chase Sapphire')).toBeTruthy()
    // Deposit accounts must NOT appear in expense form
    expect(screen.queryByText('Chase Checking')).toBeNull()
    expect(screen.queryByText('Joint Savings')).toBeNull()
  })

  it('direction toggle expense→income: source resets to first deposit account', async () => {
    const { user, getApi } = setup()
    const incomeBtn = screen.getByText('Income')
    await user.click(incomeBtn)
    expect(getApi().source).toBe('Chase Checking')
  })

  it('direction toggle income→expense: source resets to first card', async () => {
    const { user, getApi } = setup()
    await user.click(screen.getByText('Income'))
    await user.click(screen.getByText('Expense'))
    expect(getApi().source).toBe('Chase Sapphire')
  })

  it('edit income tx: "Deposit to" pre-fills the stored source', () => {
    const tx = incomeTx({ source: 'Joint Savings' })
    const { getApi } = setup({ editing: tx })
    expect(getApi().source).toBe('Joint Savings')
  })

  it('copy income tx: form pre-fills stored source', () => {
    const tx = incomeTx({ source: 'Joint Savings' })
    const { getApi } = setup({ copying: tx })
    expect(getApi().source).toBe('Joint Savings')
  })

  it('orphan source value (deleted account) renders verbatim in select', async () => {
    // "Old Bank" is not in depositAccounts — should still appear as orphan option
    const tx = incomeTx({ source: 'Old Bank Account' })
    setup({ editing: tx })
    // The orphan renders as a visible option text
    expect(screen.queryByText('Old Bank Account')).toBeTruthy()
  })

  it('legacy hardcoded source "ACH · Checking" renders verbatim as orphan', async () => {
    const tx = incomeTx({ source: 'ACH · Checking' })
    setup({ editing: tx })
    expect(screen.queryByText('ACH · Checking')).toBeTruthy()
  })
})

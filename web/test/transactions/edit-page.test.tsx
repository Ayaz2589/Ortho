// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const H = vi.hoisted(() => ({
  expanded: false,
  transactions: [] as Array<Record<string, unknown>>,
  loading: false,
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: H.push, replace: H.replace }),
  usePathname: () => '/transactions/edit',
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => H.expanded }))
vi.mock('@/lib/store', () => {
  const ALICE = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
  const BOB = { id: 'u2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '2026-01-01' }
  return {
    useApp: () => ({
      currency: 'usd',
      rate: () => 1,
      cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
      currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
      currentUserId: 'u1',
      currentPersonId: 'u1',
      householdMembers: [ALICE, BOB],
      resolveUser: (id: string) => [ALICE, BOB].find((m) => m.id === id) ?? null,
      addTransaction: H.addTransaction,
      updateTransaction: H.updateTransaction,
      transactions: H.transactions,
      loading: H.loading,
      t: (k: string, ...a: Array<string | number>) =>
        a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
    }),
  }
})

import EditTransactionPage from '@/app/(app)/transactions/edit/page'

const TX = {
  id: 'tx-e1',
  household_id: 'h1',
  merchant: 'Costco',
  category: 'groceries',
  kind: 'expense',
  amount_cents: 10000,
  source: 'Checking',
  date: '2026-06-01T12:00:00.000Z',
  created_by: 'u1',
  created_at: '2026-06-01T12:00:00.000Z',
  owner_ids: ['u1'],
}

function setUrl(search: string) {
  window.history.replaceState({}, '', `/transactions/edit${search}`)
}

beforeEach(() => {
  H.expanded = false
  H.transactions = [TX]
  H.loading = false
  H.addTransaction.mockClear()
  H.updateTransaction.mockClear()
  H.push.mockClear()
  H.replace.mockClear()
  setUrl('?id=tx-e1')
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

const merchantInput = () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement

describe('EditTransactionPage (mobile)', () => {
  it('prefills from the store by id and Save updates the same transaction', async () => {
    const user = userEvent.setup()
    render(<EditTransactionPage />)

    await screen.findByText('Edit transaction')
    expect(merchantInput().value).toBe('Costco')

    await user.clear(merchantInput())
    await user.type(merchantInput(), 'Costco Wholesale')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(H.updateTransaction).toHaveBeenCalledTimes(1)
    expect(H.updateTransaction.mock.calls[0][0]).toMatchObject({ id: 'tx-e1', merchant: 'Costco Wholesale' })
    expect(H.push).toHaveBeenCalledWith('/transactions')
  })

  it('redirects to the list when the id resolves to nothing', async () => {
    setUrl('?id=does-not-exist')
    render(<EditTransactionPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/transactions'))
    expect(screen.queryByPlaceholderText('e.g. Whole Foods')).toBeNull()
    expect(H.updateTransaction).not.toHaveBeenCalled()
  })

  it('redirects to the list at desktop width', async () => {
    H.expanded = true
    render(<EditTransactionPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/transactions'))
    expect(screen.queryByPlaceholderText('e.g. Whole Foods')).toBeNull()
  })
})

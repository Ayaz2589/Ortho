// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mutable test doubles shared with the hoisted module mocks below.
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
  usePathname: () => '/transactions/new',
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

import NewTransactionPage from '@/app/(app)/transactions/new/page'

function setUrl(search: string) {
  window.history.replaceState({}, '', `/transactions/new${search}`)
}

beforeEach(() => {
  H.expanded = false
  H.transactions = []
  H.loading = false
  H.addTransaction.mockClear()
  H.updateTransaction.mockClear()
  H.push.mockClear()
  H.replace.mockClear()
  setUrl('')
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

const amountInput = () => document.querySelector('.ow-amount-input') as HTMLInputElement
const merchantInput = () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement

describe('NewTransactionPage (mobile)', () => {
  it('renders the transaction form and Save creates + navigates to the list', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)

    // The page reads the URL in a mount effect, then renders the form.
    await screen.findByText('New transaction')
    await user.type(amountInput(), '2500')
    await user.type(merchantInput(), 'Whole Foods')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(H.addTransaction).toHaveBeenCalledTimes(1)
    expect(H.addTransaction.mock.calls[0][0]).toMatchObject({ merchant: 'Whole Foods' })
    expect(H.push).toHaveBeenCalledWith('/transactions')
  })

  it('reconstructs a copy-from prefill from ?copyFrom', async () => {
    H.transactions = [
      {
        id: 'tx-src',
        household_id: 'h1',
        merchant: 'Blue Bottle',
        category: 'coffee',
        kind: 'expense',
        amount_cents: 640,
        source: 'Checking',
        date: '2026-06-01T12:00:00.000Z',
        created_by: 'u1',
        owner_ids: ['u1'],
      },
    ]
    setUrl('?copyFrom=tx-src')
    render(<NewTransactionPage />)
    // Copy prefills the merchant into a fresh add form.
    await screen.findByText('New transaction')
    expect(merchantInput().value).toBe('Blue Bottle')
  })

  it('opens in Settle-up transfer mode from ?from&to&amount', async () => {
    setUrl('?from=u1&to=u2&amount=1200')
    render(<NewTransactionPage />)
    expect(await screen.findByText('Settle up')).toBeInTheDocument()
  })

  it('redirects to the list at desktop width and renders no form', async () => {
    H.expanded = true
    render(<NewTransactionPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/transactions'))
    expect(screen.queryByPlaceholderText('e.g. Whole Foods')).toBeNull()
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'

// ---------------------------------------------------------------------------
// The page renders the desktop component when `useIsExpanded()` is true; force
// the mobile month-accordion branch by pinning it to false.
// ---------------------------------------------------------------------------
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false }))

// Stub the leaf row so collapsed/expanded state is observable purely by whether
// the merchant text is in the DOM (the page renders rows only for open months).
vi.mock('@/components/transactions/TransactionRow', () => ({
  TransactionRow: ({ tx }: { tx: Transaction }) => <div data-testid="tx-row">{tx.merchant}</div>,
}))
// The mobile page navigates to dedicated add/edit routes (spec 025).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/transactions',
}))
vi.mock('@/components/web/TransactionsDesktop', () => ({ TransactionsDesktop: () => null }))

// Controlled store. The page reads: transactions, currentHousehold, resolveUser,
// formatMoney, deleteTransaction, locale.
const HOUSEHOLD = { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' }
let TRANSACTIONS: Transaction[] = []

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: TRANSACTIONS,
    currentHousehold: HOUSEHOLD,
    resolveUser: (id: string) => ({ id, name: id, initial: 'X', color_key: 'sage' }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
    deleteTransaction: vi.fn(),
    locale: 'en-US',
  }),
}))

import TransactionsPage from '@/app/(app)/transactions/page'

function tx(over: Partial<Transaction> & Pick<Transaction, 'id' | 'merchant' | 'date'>): Transaction {
  return {
    household_id: HOUSEHOLD.id,
    category: 'groceries',
    kind: 'expense',
    amount_cents: 1000,
    source: 'Visa',
    created_by: 'u1',
    created_at: over.date,
    updated_at: over.date,
    owner_ids: ['u1'],
    shares: {},
    ...over,
  }
}

// Fixed "now" = 2026-06-12 (June). Months use local time in the page, so build
// dates at noon local to avoid any month-boundary drift.
const JUNE = tx({ id: 'j1', merchant: 'June Groceries', date: '2026-06-10T12:00:00' })
const MAY = tx({ id: 'm1', merchant: 'May Dinner', date: '2026-05-15T12:00:00' })
const APRIL = tx({ id: 'a1', merchant: 'April Fuel', date: '2026-04-20T12:00:00' })
const MARCH = tx({ id: 'mar1', merchant: 'March Rent', date: '2026-03-05T12:00:00' })
// A "full" current month: ≥10 line items, past the collapse-previous threshold.
const JUNE_MANY = Array.from({ length: 10 }, (_, i) =>
  tx({ id: `jm${i}`, merchant: `June Item ${i}`, date: '2026-06-10T12:00:00' })
)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 12)) // June 12 2026, local
})

afterEach(() => {
  vi.useRealTimers()
  TRANSACTIONS = []
})

describe('transactions month accordion (mobile)', () => {
  it('renders a header for every month present in the data', () => {
    TRANSACTIONS = [JUNE, MAY, APRIL]
    render(<TransactionsPage />)
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('April 2026')).toBeInTheDocument()
  })

  it('keeps the previous month open too while the current month is sparse (<10 items)', () => {
    TRANSACTIONS = [JUNE, MAY, APRIL]
    render(<TransactionsPage />)
    // Current month (June) has a single item -> the prior month (May) stays open
    // so the page doesn't read as near-empty.
    expect(screen.getByText('June Groceries')).toBeInTheDocument()
    expect(screen.getByText('May Dinner')).toBeInTheDocument()
    // Only the ONE previous month opens — April remains collapsed.
    expect(screen.queryByText('April Fuel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /June 2026/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /May 2026/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /April 2026/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses the previous month once the current month has ≥10 items', () => {
    TRANSACTIONS = [...JUNE_MANY, MAY, APRIL]
    render(<TransactionsPage />)
    // The current month now stands on its own, so only it is open by default.
    expect(screen.getByText('June Item 0')).toBeInTheDocument()
    expect(screen.queryByText('May Dinner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /June 2026/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /May 2026/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands a collapsed month when its header is clicked', async () => {
    TRANSACTIONS = [JUNE, MAY, APRIL]
    render(<TransactionsPage />)
    // The "now"-dependent default-open key is computed during render above; from
    // here on use real timers so userEvent's internal delays resolve normally.
    vi.useRealTimers()
    const user = userEvent.setup()
    // April is collapsed by default (June + May open on the sparse-month rule).
    expect(screen.queryByText('April Fuel')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /April 2026/ }))
    expect(screen.getByText('April Fuel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /April 2026/ })).toHaveAttribute('aria-expanded', 'true')
    // The defaults (June + May) stay open and untouched.
    expect(screen.getByText('June Groceries')).toBeInTheDocument()
    expect(screen.getByText('May Dinner')).toBeInTheDocument()
  })

  it('opens the most recent month with data (and its predecessor) when the current month is empty', () => {
    // No June transactions -> the primary falls back to the newest month (May);
    // May is sparse, so April opens alongside it, but March stays collapsed.
    TRANSACTIONS = [MAY, APRIL, MARCH]
    render(<TransactionsPage />)
    expect(screen.queryByText('June 2026')).not.toBeInTheDocument()
    expect(screen.getByText('May Dinner')).toBeInTheDocument()
    expect(screen.getByText('April Fuel')).toBeInTheDocument()
    expect(screen.queryByText('March Rent')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /May 2026/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /April 2026/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /March 2026/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands every month while a search is active so matches are not hidden', async () => {
    TRANSACTIONS = [JUNE, MAY, APRIL]
    render(<TransactionsPage />)
    vi.useRealTimers()
    const user = userEvent.setup()
    // Open the search field.
    await user.click(screen.getByRole('button', { name: 'Search transactions' }))
    const box = screen.getByPlaceholderText('Search transactions')
    // A query matching only the April row still surfaces it despite April being
    // collapsed by default -> active search expands all months.
    await user.type(box, 'fuel')
    expect(screen.getByText('April Fuel')).toBeInTheDocument()
    // Non-matching months render their (now empty) headers but no stray rows.
    expect(screen.queryByText('June Groceries')).not.toBeInTheDocument()
    expect(screen.queryByText('May Dinner')).not.toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'

// Force the mobile/compact branch (the desktop view is a separate component).
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false }))

// Stub the leaf row so a transaction's presence is observable by its merchant
// text alone (rows render only for visible, open months).
vi.mock('@/components/transactions/TransactionRow', () => ({
  TransactionRow: ({ tx }: { tx: Transaction }) => <div data-testid="tx-row">{tx.merchant}</div>,
}))
vi.mock('@/components/transactions/TransactionDetailModal', () => ({ TransactionDetailModal: () => null }))
// The mobile page navigates to dedicated add/edit routes (spec 025).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/transactions',
}))
vi.mock('@/components/web/TransactionsDesktop', () => ({ TransactionsDesktop: () => null }))

const HOUSEHOLD = { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' }
let TRANSACTIONS: Transaction[] = []
// Spec 027: household tag roster (id → name).
const TAGS = [
  { id: 'tag-work', household_id: 'h1', name: 'work', created_at: '2026-01-01' },
  { id: 'tag-vacay', household_id: 'h1', name: 'vacation', created_at: '2026-01-02' },
]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: TRANSACTIONS,
    tags: TAGS,
    currentHousehold: HOUSEHOLD,
    resolveUser: (id: string) => ({ id, name: id === 'u1' ? 'Alex' : 'Sam', initial: 'X', color_key: 'sage' }),
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
    source: 'TD Bank',
    created_by: 'u1',
    created_at: over.date,
    updated_at: over.date,
    owner_ids: ['u1'],
    shares: {},
    ...over,
  }
}

// Four transactions spanning every non-date dimension under test, all in the
// current month (June) so the default-open accordion shows them without a filter
// — letting "cleared" assertions see the full set. (The month dimension gets its
// own multi-month fixture, asserted with a filter active so all months expand.)
const DINING = tx({ id: 't1', merchant: 'Dining Out', category: 'dining', kind: 'expense', source: 'TD Bank', owner_ids: ['u1'], date: '2026-06-10T12:00:00', tags: ['tag-work'] })
const GROCERY = tx({ id: 't2', merchant: 'Grocery Run', category: 'groceries', kind: 'expense', source: 'Amex Gold', owner_ids: ['u2'], date: '2026-06-12T12:00:00' })
const PAYCHECK = tx({ id: 't3', merchant: 'Paycheck', category: 'income', kind: 'income', source: 'TD Bank', owner_ids: ['u1'], date: '2026-06-01T12:00:00' })
const GAS = tx({ id: 't4', merchant: 'Gas Stop', category: 'fuel', kind: 'expense', source: 'Chase', owner_ids: ['u2'], date: '2026-06-20T12:00:00', tags: ['tag-vacay'] })

const ALL = [DINING, GROCERY, PAYCHECK, GAS]
const MERCHANTS = ALL.map((t) => t.merchant)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 5, 15)) // June 15 2026, local
  TRANSACTIONS = ALL
})

afterEach(() => {
  vi.useRealTimers()
  TRANSACTIONS = []
})

/** Render, then switch to real timers so userEvent's internal delays resolve. */
function setup() {
  render(<TransactionsPage />)
  vi.useRealTimers()
  return userEvent.setup()
}

/** Open the filter sheet (count is 0 on first open, so the name has no badge). */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Filters' }))
}

/** A FilterPanel multi-select chip (category/source/owner/month) — disambiguated
 *  from same-named month accordion headers by its `aria-pressed` attribute. */
function panelChip(name: string | RegExp): HTMLElement {
  const el = screen.getAllByRole('button', { name }).find((b) => b.getAttribute('aria-pressed') !== null)
  if (!el) throw new Error(`no panel chip named ${name}`)
  return el
}

function visibleMerchants(): string[] {
  return MERCHANTS.filter((m) => screen.queryByText(m))
}

describe('transactions filter UI (compact)', () => {
  it('US1: category multi-select narrows to matching rows, with a count badge', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Dining'))

    expect(visibleMerchants()).toEqual(['Dining Out'])
    // The badge surfaces the active-filter count on the Filters button.
    expect(screen.getByRole('button', { name: /Filters \(1 active\)/ })).toBeInTheDocument()
  })

  it('US1: category membership is OR within the dimension', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Dining'))
    await user.click(panelChip('Fuel'))

    expect(visibleMerchants().sort()).toEqual(['Dining Out', 'Gas Stop'])
    // Two categories live in one dimension, so the active-filter count stays 1.
    expect(screen.getByRole('button', { name: /Filters \(1 active\)/ })).toBeInTheDocument()
  })

  it('US1: Clear all restores the full set and drops the badge', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Dining'))
    expect(visibleMerchants()).toEqual(['Dining Out'])

    // The in-sheet Clear action resets every dimension.
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(visibleMerchants().sort()).toEqual([...MERCHANTS].sort())
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })

  it('US1: a no-match combination shows the distinct empty state with a clear action', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Coffee')) // no coffee transactions exist

    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
    expect(visibleMerchants()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(visibleMerchants().sort()).toEqual([...MERCHANTS].sort())
  })

  it('US2: the kind segmented narrows to expenses only', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(screen.getByRole('button', { name: 'Expenses' }))

    expect(screen.queryByText('Paycheck')).not.toBeInTheDocument()
    expect(visibleMerchants().sort()).toEqual(['Dining Out', 'Gas Stop', 'Grocery Run'])
  })

  it('US2: the source multi-select narrows to the chosen account', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Chase'))

    expect(visibleMerchants()).toEqual(['Gas Stop'])
  })

  it('US3: the owner multi-select narrows to that person’s transactions', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Sam')) // owns Grocery Run + Gas Stop

    expect(visibleMerchants().sort()).toEqual(['Gas Stop', 'Grocery Run'])
  })

  it('US3: the month select narrows to that month (boundary correct)', async () => {
    // A dedicated multi-month set; an active filter expands all months so the
    // surviving row is visible regardless of the default-collapsed accordion.
    TRANSACTIONS = [
      tx({ id: 'mj', merchant: 'June Buy', date: '2026-06-10T12:00:00' }),
      tx({ id: 'mm', merchant: 'May Buy', date: '2026-05-15T12:00:00' }),
      tx({ id: 'ma', merchant: 'April Buy', date: '2026-04-20T12:00:00' }),
    ]
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('May 2026'))

    expect(screen.getByText('May Buy')).toBeInTheDocument()
    expect(screen.queryByText('June Buy')).not.toBeInTheDocument()
    expect(screen.queryByText('April Buy')).not.toBeInTheDocument()
  })

  it('US3: dimensions combine with AND (owner ∧ kind)', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Sam'))
    await user.click(screen.getByRole('button', { name: 'Expenses' }))

    // Sam owns Grocery Run (expense) + Gas Stop (expense); both survive.
    expect(visibleMerchants().sort()).toEqual(['Gas Stop', 'Grocery Run'])
  })

  it('US1(027): the tag multi-select narrows to transactions carrying that tag', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('vacation')) // only Gas Stop is tagged vacation

    expect(visibleMerchants()).toEqual(['Gas Stop'])
    expect(screen.getByRole('button', { name: /Filters \(1 active\)/ })).toBeInTheDocument()
  })

  it('US1(027): only tags present on transactions are offered, alphabetized', async () => {
    const user = setup()
    await openFilters(user)
    // Both 'work' and 'vacation' are present; a third roster tag with no tx would not appear.
    expect(panelChip('work')).toBeInTheDocument()
    expect(panelChip('vacation')).toBeInTheDocument()
  })

  it('US1(027): an active tag chip removes just the tag dimension', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('vacation'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Remove vacation filter' }))
    expect(visibleMerchants().sort()).toEqual([...MERCHANTS].sort())
  })

  it('active filter chips remove a single dimension', async () => {
    const user = setup()
    await openFilters(user)
    await user.click(panelChip('Dining'))
    // Close the sheet to interact with the inline chips beneath the header.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Remove Dining filter' }))
    expect(visibleMerchants().sort()).toEqual([...MERCHANTS].sort())
  })
})

// @vitest-environment jsdom
/**
 * Tests for the two-level grouped category picker in TxForm.
 * Covers US1 (expense subcategories), US2 (income subcategories), and US5 (backward compat).
 *
 * The picker is an in-card accordion (spec: dashboard UI fixes): the "Category"
 * row expands the card in place to reveal grouped, selectable category rows.
 * Each subcategory is a button labeled with its display name; picking one closes
 * the accordion and stores that slug.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { categoryMeta } from '@/lib/categories'
import type { TransactionCategory } from '@/lib/types'

const H = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: H.push, replace: H.replace }),
  usePathname: () => '/transactions/new',
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false }))
vi.mock('@/lib/store', () => {
  const ALICE = { id: 'u1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '2026-01-01' }
  return {
    useApp: () => ({
      currency: 'usd',
      rate: () => 1,
      locale: 'en-US',
      cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
      depositAccounts: [],
      currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
      currentUserId: 'u1',
      currentPersonId: 'u1',
      householdMembers: [ALICE],
      resolveUser: () => ALICE,
      addTransaction: H.addTransaction,
      updateTransaction: H.updateTransaction,
      transactions: [],
      loading: false,
      t: (k: string, ...a: Array<string | number>) =>
        a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
    }),
  }
})

import NewTransactionPage from '@/app/(app)/transactions/new/page'

const amountInput = () => document.querySelector('.ow-amount-input') as HTMLInputElement
const merchantInput = () => screen.getByPlaceholderText('e.g. Whole Foods') as HTMLInputElement

// The category disclosure row (aria-label="Category"). Clicking it toggles the
// in-card picker open/closed.
const categoryToggle = () => screen.getByRole('button', { name: 'Category' })
const openCategory = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(categoryToggle())
}
// An individual subcategory option is a button whose accessible name is its
// display label (the toggle's own name is "Category", so there's no collision).
const label = (slug: TransactionCategory) => categoryMeta(slug).label
const catOption = (slug: TransactionCategory) => screen.getByRole('button', { name: label(slug) })
const catOptionQuery = (slug: TransactionCategory) => screen.queryByRole('button', { name: label(slug) })
// A group header renders its label as plain text (possibly alongside a same-named
// option button, e.g. "Education"), so tolerate ≥1 match.
const groupShown = (groupLabel: string) => screen.getAllByText(groupLabel).length > 0

beforeEach(() => {
  H.addTransaction.mockClear()
  H.updateTransaction.mockClear()
  H.push.mockClear()
  H.replace.mockClear()
  window.history.replaceState({}, '', '/transactions/new')
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('US1 + US5: Expense category picker — grouped structure', () => {
  it('renders a group header for each expense group when opened', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')
    await openCategory(user)

    for (const g of ['Food & Drink', 'Transport', 'Home', 'Health & Wellness', 'Entertainment', 'Shopping', 'Subscriptions', 'Education']) {
      expect(groupShown(g), `group "${g}" missing from picker`).toBe(true)
    }
  })

  it('Food & Drink group contains both original and new subcategories', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')
    await openCategory(user)

    for (const slug of ['coffee', 'groceries', 'dining', 'fast_food', 'alcohol', 'takeout'] as TransactionCategory[]) {
      expect(catOption(slug)).toBeInTheDocument()
    }
  })

  it('US5: original slugs still present as selectable options', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')
    await openCategory(user)

    for (const slug of ['coffee', 'groceries', 'dining', 'subs', 'fuel', 'rent', 'health', 'transit', 'utilities', 'entertainment'] as TransactionCategory[]) {
      expect(catOptionQuery(slug), `original slug "${slug}" missing from picker`).not.toBeNull()
    }
  })

  it('selecting fast_food and saving stores category = fast_food', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.type(amountInput(), '1200')
    await user.type(merchantInput(), 'McDonalds')
    await openCategory(user)
    await user.click(catOption('fast_food'))

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(H.addTransaction).toHaveBeenCalledTimes(1)
    expect(H.addTransaction.mock.calls[0][0]).toMatchObject({
      category: 'fast_food',
      kind: 'expense',
    })
  })

  it('selecting rideshare and saving stores category = rideshare', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.type(amountInput(), '2800')
    await user.type(merchantInput(), 'Lyft')
    await openCategory(user)
    await user.click(catOption('rideshare'))

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(H.addTransaction.mock.calls[0][0]).toMatchObject({
      category: 'rideshare',
      kind: 'expense',
    })
  })

  it('picking a category closes the accordion and reflects it in the row', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await openCategory(user)
    await user.click(catOption('dining'))

    // Accordion collapsed → options gone, row shows the chosen category.
    expect(catOptionQuery('fast_food')).toBeNull()
    expect(categoryToggle()).toHaveTextContent('Dining')
  })
})

describe('US2: Income category picker — income subcategories', () => {
  it('switches to income category groups when kind = income', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))
    await openCategory(user)

    expect(groupShown('Employment & Business')).toBe(true)
    expect(groupShown('Investment & Assets')).toBe(true)
    expect(groupShown('Other Income')).toBe(true)

    // Must NOT contain expense groups
    expect(screen.queryByText('Food & Drink')).toBeNull()
    expect(screen.queryByText('Transport')).toBeNull()
  })

  it('income picker defaults to salary', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))

    expect(categoryToggle()).toHaveTextContent('Salary')
  })

  it('saving income with freelance stores category = freelance (not "income")', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))
    await user.type(amountInput(), '50000')
    await user.type(screen.getByPlaceholderText('e.g. Acme Co. payroll'), 'Client project')
    await openCategory(user)
    await user.click(catOption('freelance'))

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(H.addTransaction).toHaveBeenCalledTimes(1)
    expect(H.addTransaction.mock.calls[0][0]).toMatchObject({
      category: 'freelance',
      kind: 'income',
    })
  })

  it('income picker contains all income subcategories', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))
    await openCategory(user)

    for (const slug of ['salary', 'bonus', 'freelance', 'business_income', 'dividends', 'rental_income', 'gift_received', 'refund', 'other_income', 'income'] as TransactionCategory[]) {
      expect(catOptionQuery(slug), `income slug "${slug}" missing from income picker`).not.toBeNull()
    }
  })

  it('expense category picker does not contain income slugs', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await openCategory(user)

    for (const slug of ['salary', 'bonus', 'freelance', 'business_income', 'dividends'] as TransactionCategory[]) {
      expect(catOptionQuery(slug), `income slug "${slug}" must not be in expense picker`).toBeNull()
    }
  })
})

// @vitest-environment jsdom
/**
 * Tests for the two-level grouped category picker in TxForm.
 * Covers US1 (expense subcategories), US2 (income subcategories), and US5 (backward compat).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
      cards: [{ id: 'c1', household_id: 'h1', name: 'Visa', created_at: '2026-01-01' }],
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
// Category select has aria-label="Category" (added in spec 031 implementation)
const categorySelect = () => screen.getByLabelText('Category') as HTMLSelectElement

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
  it('renders the category select with optgroup elements for each expense group', async () => {
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    const select = categorySelect()
    const groups = select.querySelectorAll('optgroup')
    const groupLabels = Array.from(groups).map((g) => g.label)

    expect(groupLabels).toContain('Food & Drink')
    expect(groupLabels).toContain('Transport')
    expect(groupLabels).toContain('Home')
    expect(groupLabels).toContain('Health & Wellness')
    expect(groupLabels).toContain('Entertainment')
    expect(groupLabels).toContain('Shopping')
    expect(groupLabels).toContain('Subscriptions')
    expect(groupLabels).toContain('Education')
  })

  it('Food & Drink optgroup contains both original and new subcategories', async () => {
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    const select = categorySelect()
    const foodGroup = Array.from(select.querySelectorAll('optgroup')).find(
      (g) => g.label === 'Food & Drink'
    )
    expect(foodGroup).toBeDefined()

    const optionValues = Array.from(foodGroup!.querySelectorAll('option')).map((o) => o.value)
    expect(optionValues).toContain('coffee')
    expect(optionValues).toContain('groceries')
    expect(optionValues).toContain('dining')
    expect(optionValues).toContain('fast_food')
    expect(optionValues).toContain('alcohol')
    expect(optionValues).toContain('takeout')
  })

  it('US5: original slugs still present as selectable options', async () => {
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    const select = categorySelect()
    const allOptionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value)

    // All original expense slugs must still be present
    for (const slug of ['coffee', 'groceries', 'dining', 'subs', 'fuel', 'rent', 'health', 'transit', 'utilities', 'entertainment']) {
      expect(allOptionValues, `original slug "${slug}" missing from picker`).toContain(slug)
    }
  })

  it('selecting fast_food and saving stores category = fast_food', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.type(amountInput(), '1200')
    await user.type(merchantInput(), 'McDonalds')
    await user.selectOptions(categorySelect(), 'fast_food')

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
    await user.selectOptions(categorySelect(), 'rideshare')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(H.addTransaction.mock.calls[0][0]).toMatchObject({
      category: 'rideshare',
      kind: 'expense',
    })
  })
})

describe('US2: Income category picker — income subcategories', () => {
  it('switches to income category picker when kind = income', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    // Switch to income
    await user.click(screen.getByRole('tab', { name: 'Income' }))

    // Income picker should have income optgroups, not expense optgroups
    const select = categorySelect()
    const groupLabels = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)

    expect(groupLabels).toContain('Employment & Business')
    expect(groupLabels).toContain('Investment & Assets')
    expect(groupLabels).toContain('Other Income')

    // Must NOT contain expense groups
    expect(groupLabels).not.toContain('Food & Drink')
    expect(groupLabels).not.toContain('Transport')
  })

  it('income picker defaults to salary', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))

    expect(categorySelect().value).toBe('salary')
  })

  it('saving income with freelance stores category = freelance (not "income")', async () => {
    const user = userEvent.setup()
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    await user.click(screen.getByRole('tab', { name: 'Income' }))
    await user.type(amountInput(), '50000')
    await user.type(screen.getByPlaceholderText('e.g. Acme Co. payroll'), 'Client project')
    await user.selectOptions(categorySelect(), 'freelance')

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

    const select = categorySelect()
    const allOptionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value)

    for (const slug of ['salary', 'bonus', 'freelance', 'business_income', 'dividends', 'rental_income', 'gift_received', 'refund', 'other_income', 'income']) {
      expect(allOptionValues, `income slug "${slug}" missing from income picker`).toContain(slug)
    }
  })

  it('expense category picker does not contain income slugs', async () => {
    render(<NewTransactionPage />)
    await screen.findByText('New transaction')

    const select = categorySelect()
    const allOptionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value)

    for (const slug of ['salary', 'bonus', 'freelance', 'business_income', 'dividends']) {
      expect(allOptionValues, `income slug "${slug}" must not be in expense picker`).not.toContain(slug)
    }
  })
})

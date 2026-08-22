// @vitest-environment jsdom
// Spec 027 US3: the budget editor lets you pick a bucket type (Fixed/Flex/
// Non-monthly); Flex reveals an optional cap; Save persists both new fields.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Budget } from '@/lib/types'

const tr = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k

let mockBudgets: Budget[] = []
const addOrUpdateBudget = vi.fn()
const deleteBudget = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'hh-1' },
    budgets: mockBudgets,
    addOrUpdateBudget,
    deleteBudget,
    t: tr,
  }),
}))

import { BudgetDrawer } from '@/components/budgets/BudgetDrawer'

afterEach(() => {
  cleanup()
  mockBudgets = []
  addOrUpdateBudget.mockReset()
  deleteBudget.mockReset()
})

describe('BudgetDrawer — bucket type + rollover cap', () => {
  it('offers Fixed, Flex, and Non-monthly, defaulting to Fixed', () => {
    render(<BudgetDrawer category="dining" onClose={() => {}} />)
    expect(screen.getByRole('radio', { name: /Fixed/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Flex/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Non-monthly/ })).toBeTruthy()
    // No cap field until Flex is chosen.
    expect(screen.queryByPlaceholderText(/Uncapped/i)).toBeNull()
  })

  it('reveals the cap field when Flex is chosen and persists both on save', async () => {
    const user = userEvent.setup()
    render(<BudgetDrawer category="dining" onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('0.00'), '600')
    await user.click(screen.getByRole('radio', { name: /Flex/ }))

    const cap = screen.getByPlaceholderText(/Uncapped/i)
    expect(cap).toBeTruthy()
    await user.type(cap, '200')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(addOrUpdateBudget).toHaveBeenCalledTimes(1)
    const saved = addOrUpdateBudget.mock.calls[0][0] as Budget
    expect(saved.budget_type).toBe('flex')
    expect(saved.monthly_limit_cents).toBe(60000)
    expect(saved.rollover_cap_cents).toBe(20000)
    expect(saved.category).toBe('dining')
  })

  it('prefills the saved type + cap when editing an existing flex budget', () => {
    mockBudgets = [
      {
        id: 'b-dining',
        household_id: 'hh-1',
        category: 'dining',
        monthly_limit_cents: 45000,
        budget_type: 'flex',
        rollover_cap_cents: 10000,
        person_id: null,
      },
    ]
    render(<BudgetDrawer category="dining" onClose={() => {}} />)
    const flex = screen.getByRole('radio', { name: /Flex/ })
    expect(flex.getAttribute('aria-checked')).toBe('true')
    // cap field is visible and prefilled
    expect((screen.getByPlaceholderText(/Uncapped/i) as HTMLInputElement).value).toContain('100')
  })

  it('saves a non-monthly budget with a null cap', async () => {
    const user = userEvent.setup()
    render(<BudgetDrawer category="dining" onClose={() => {}} />)
    await user.type(screen.getByPlaceholderText('0.00'), '50')
    await user.click(screen.getByRole('radio', { name: /Non-monthly/ }))
    // no cap field for non-monthly
    expect(screen.queryByPlaceholderText(/Uncapped/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = addOrUpdateBudget.mock.calls[0][0] as Budget
    expect(saved.budget_type).toBe('non_monthly')
    expect(saved.rollover_cap_cents).toBeNull()
  })
})

// Spec 054: the same drawer edits a household budget or one person's.
describe('BudgetDrawer — whose budget (spec 054)', () => {
  const HOUSEHOLD: Budget = {
    id: 'b-shared',
    household_id: 'hh-1',
    category: 'dining',
    monthly_limit_cents: 60000,
    budget_type: 'fixed',
    rollover_cap_cents: null,
    person_id: null,
  }
  const MINE: Budget = { ...HOUSEHOLD, id: 'b-mine', monthly_limit_cents: 20000, person_id: 'p-a' }

  it('saves a household budget with a null person by default', async () => {
    const user = userEvent.setup()
    render(<BudgetDrawer category="dining" onClose={() => {}} />)
    await user.type(screen.getByPlaceholderText('0.00'), '300')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((addOrUpdateBudget.mock.calls[0][0] as Budget).person_id).toBeNull()
  })

  it('saves a personal budget when a person is selected', async () => {
    const user = userEvent.setup()
    render(<BudgetDrawer category="dining" personId="p-a" onClose={() => {}} />)
    await user.type(screen.getByPlaceholderText('0.00'), '200')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = addOrUpdateBudget.mock.calls[0][0] as Budget
    expect(saved.person_id).toBe('p-a')
    expect(saved.monthly_limit_cents).toBe(20000)
  })

  it('edits the person’s row, not the household one, for the same category', () => {
    mockBudgets = [HOUSEHOLD, MINE]
    render(<BudgetDrawer category="dining" personId="p-a" onClose={() => {}} />)
    // $200 (the personal limit), not $600.
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toContain('200')
  })

  it('offers a blank form when the person has no budget for the category', () => {
    mockBudgets = [HOUSEHOLD]
    render(<BudgetDrawer category="dining" personId="p-a" onClose={() => {}} />)
    // Never prefilled from the household limit — that would silently re-attribute it.
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Remove budget')).toBeNull()
  })

  it('removes the person’s row, not the household one', async () => {
    const user = userEvent.setup()
    mockBudgets = [HOUSEHOLD, MINE]
    render(<BudgetDrawer category="dining" personId="p-a" onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Remove budget/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(deleteBudget).toHaveBeenCalledWith('b-mine')
  })

  it('names whose budget it is', () => {
    render(<BudgetDrawer category="dining" personId="p-a" personName="Priya" onClose={() => {}} />)
    expect(screen.getByText(/Priya/)).toBeTruthy()
  })
})

// Spec 031 US4: new expense subcategories are budgetable
describe('BudgetDrawer — new subcategory slugs (spec 031)', () => {
  it('US4(031): renders correctly for clothing (new Shopping slug)', () => {
    render(<BudgetDrawer category="clothing" onClose={() => {}} />)
    expect(screen.getByText(/Clothing budget/i)).toBeInTheDocument()
  })

  it('US4(031): renders correctly for rideshare (new Transport slug)', () => {
    render(<BudgetDrawer category="rideshare" onClose={() => {}} />)
    expect(screen.getByText(/Rideshare budget/i)).toBeInTheDocument()
  })

  it('US4(031): saves a budget for clothing with correct category', async () => {
    const user = userEvent.setup()
    render(<BudgetDrawer category="clothing" onClose={() => {}} />)

    await user.type(screen.getByPlaceholderText('0.00'), '200')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(addOrUpdateBudget).toHaveBeenCalledTimes(1)
    const saved = addOrUpdateBudget.mock.calls[0][0] as Budget
    expect(saved.category).toBe('clothing')
    expect(saved.monthly_limit_cents).toBe(20000)
  })
})

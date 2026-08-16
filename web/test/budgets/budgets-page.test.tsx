// @vitest-environment jsdom
// Spec 054 — the Budgets page gains the same "whose money" axis the Planning hub
// has. "Everyone" edits the household budgets (the pre-054 page); a person edits
// their own limits, and a category they haven't budgeted reads "Not set" rather
// than borrowing the household number.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Budget } from '@/lib/types'

const tr = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k

const HOUSEHOLD: Budget = {
  id: 'b-shared',
  household_id: 'hh-1',
  category: 'groceries',
  monthly_limit_cents: 50_000,
  budget_type: 'fixed',
  rollover_cap_cents: null,
  person_id: null,
}
const MINE: Budget = {
  ...HOUSEHOLD,
  id: 'b-mine',
  category: 'dining',
  monthly_limit_cents: 20_000,
  person_id: 'p-a',
}

const h = vi.hoisted(() => ({
  budgets: [] as unknown[],
  members: [] as unknown[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    budgets: h.budgets,
    householdMembers: h.members,
    currentHousehold: { id: 'hh-1' },
    currency: 'usd',
    rate: () => 1,
    formatMoney: (c: number) => `$${c / 100}`,
    addOrUpdateBudget: vi.fn(),
    deleteBudget: vi.fn(),
    t: tr,
  }),
}))

import BudgetsPage from '@/app/(app)/planning/budget/page'

/** The clickable row for a category label. */
function row(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement
}

beforeEach(() => {
  h.budgets = [HOUSEHOLD, MINE]
  h.members = [
    { id: 'p-a', name: 'Priya' },
    { id: 'p-b', name: 'Amir' },
  ]
})
afterEach(cleanup)

describe('Budgets page — whose budgets', () => {
  it('offers Everyone plus each person', () => {
    render(<BudgetsPage />)
    const bar = screen.getByRole('tablist', { name: 'Whose money' })
    expect(within(bar).getByRole('tab', { name: 'Everyone' })).toBeTruthy()
    expect(within(bar).getByRole('tab', { name: 'Priya' })).toBeTruthy()
    expect(within(bar).getByRole('tab', { name: 'Amir' })).toBeTruthy()
  })

  it('hides the selector entirely for a one-person household', () => {
    h.members = [{ id: 'p-a', name: 'Priya' }]
    render(<BudgetsPage />)
    expect(screen.queryByRole('tablist', { name: 'Whose money' })).toBeNull()
  })

  it('shows household limits under Everyone and hides personal ones', () => {
    render(<BudgetsPage />)
    expect(within(row('Groceries')).getByText('$500 / mo')).toBeTruthy()
    expect(within(row('Dining')).getByText('Not set')).toBeTruthy()
  })

  it('shows a person’s own limits when they are selected', async () => {
    const user = userEvent.setup()
    render(<BudgetsPage />)
    await user.click(screen.getByRole('tab', { name: 'Priya' }))
    expect(within(row('Dining')).getByText('$200 / mo')).toBeTruthy()
    // The household grocery budget is NOT borrowed for her (FR-003).
    expect(within(row('Groceries')).getByText('Not set')).toBeTruthy()
  })

  it('shows another person none of it', async () => {
    const user = userEvent.setup()
    render(<BudgetsPage />)
    await user.click(screen.getByRole('tab', { name: 'Amir' }))
    expect(within(row('Dining')).getByText('Not set')).toBeTruthy()
    expect(within(row('Groceries')).getByText('Not set')).toBeTruthy()
  })

  it('opens the drawer for the selected person', async () => {
    const user = userEvent.setup()
    render(<BudgetsPage />)
    await user.click(screen.getByRole('tab', { name: 'Priya' }))
    await user.click(row('Dining'))
    expect(screen.getByText("Priya's budget")).toBeTruthy()
  })

  it('opens a household drawer under Everyone', async () => {
    const user = userEvent.setup()
    render(<BudgetsPage />)
    await user.click(row('Dining'))
    expect(screen.queryByText("Priya's budget")).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Budget, Goal, GoalContribution, Transaction } from '@/lib/types'
import { buildPlanSummary, currentMonthKey, type SinkingFund } from '@/lib/planning/planSummary'

// Reference "today": June 15 2026 (June has 30 days → half elapsed).
const NOW = new Date(2026, 5, 15, 12, 0, 0, 0)

const replaceSpy = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/planning',
  useRouter: () => ({ push: vi.fn(), replace: replaceSpy }),
}))

// A mutable store view each test populates.
interface StoreView {
  budgets: Budget[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  transactions: Transaction[]
  formatMoney: (cents: number, opts?: { leadingPlus?: boolean }) => string
  t: (key: string, ...args: (string | number)[]) => string
  locale: string
}
let store: StoreView
vi.mock('@/lib/store', () => ({
  useApp: () => store,
}))

import { PlanHealthHero } from '@/components/planning/PlanHealthHero'
import { BudgetSummaryCard } from '@/components/planning/BudgetSummaryCard'
import { GoalsSummaryCard } from '@/components/planning/GoalsSummaryCard'
import { SinkingFundsPanel } from '@/components/planning/SinkingFundsPanel'
import { PlanningMonthBar } from '@/components/planning/PlanningMonthBar'
import PlanningPage from '@/app/(app)/planning/page'
import SettingsPlanningRedirect from '@/app/(app)/settings/planning/page'

// ── builders ──────────────────────────────────────────────────────────────────
function makeBudget(o: Partial<Budget> = {}): Budget {
  return {
    id: o.id ?? 'b-1',
    household_id: 'hh-1',
    category: o.category ?? 'groceries',
    monthly_limit_cents: o.monthly_limit_cents ?? 100000,
    budget_type: o.budget_type ?? 'fixed',
    rollover_cap_cents: o.rollover_cap_cents ?? null,
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    ...o,
  }
}
function makeGoal(o: Partial<Goal> = {}): Goal {
  return {
    id: o.id ?? 'g-1',
    household_id: 'hh-1',
    name: o.name ?? 'Goal',
    kind: o.kind ?? 'savings',
    target_cents: o.target_cents ?? 120000,
    target_date: o.target_date ?? null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u-me',
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}
function makeTx(o: Partial<Transaction> = {}): Transaction {
  return {
    id: o.id ?? `tx-${Math.round((o.amount_cents ?? 0))}-${o.date ?? ''}`,
    household_id: 'hh-1',
    merchant: 'X',
    category: o.category ?? 'groceries',
    kind: o.kind ?? 'expense',
    amount_cents: o.amount_cents ?? 1000,
    source: 'Checking',
    date: o.date ?? '2026-06-10T12:00:00.000Z',
    created_by: 'u-me',
    created_at: o.date ?? '2026-06-10T12:00:00.000Z',
    updated_at: o.date ?? '2026-06-10T12:00:00.000Z',
    owner_ids: ['u-me'],
    shares: { 'u-me': o.amount_cents ?? 1000 },
    ...o,
  }
}
function contrib(goal_id: string, amount_cents: number): GoalContribution {
  return { id: `c-${goal_id}-${amount_cents}`, goal_id, amount_cents, date: '2026-02-01', note: null, created_by: 'u-me', created_at: '2026-02-01' }
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** Build the summary from the current mocked store, the way the page does. */
function summaryFor(monthKey = '2026-06') {
  return buildPlanSummary(
    { budgets: store.budgets, goals: store.goals, goalContributions: store.goalContributions, transactions: store.transactions, monthKey },
    NOW,
  )
}

beforeEach(() => {
  replaceSpy.mockClear()
  store = {
    budgets: [],
    goals: [],
    goalContributions: [],
    transactions: [],
    formatMoney: money,
    t: (key, ...args) => (args.length ? key.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)])) : key),
    locale: 'en-US',
  }
})

// ── US2: plan-health hero ───────────────────────────────────────────────────────
describe('PlanHealthHero (US2)', () => {
  it('shows Left to plan and the income / budgeted / goals breakdown', () => {
    store.transactions = [makeTx({ kind: 'income', category: 'income', amount_cents: 400000, date: '2026-06-05T12:00:00.000Z' })]
    store.budgets = [makeBudget({ monthly_limit_cents: 100000 })]
    render(<PlanHealthHero health={summaryFor().health} />)

    expect(screen.getByText(/Left to plan/i)).toBeInTheDocument()
    expect(screen.getByTestId('left-to-plan')).toHaveTextContent(money(300000))
    const breakdown = screen.getByTestId('plan-breakdown')
    expect(breakdown).toHaveTextContent(money(400000)) // income
    expect(breakdown).toHaveTextContent(money(100000)) // budgeted
  })

  it('renders an over-committed month as attention, never using the destructive token', () => {
    store.transactions = [makeTx({ kind: 'income', category: 'income', amount_cents: 100000, date: '2026-06-05T12:00:00.000Z' })]
    store.budgets = [makeBudget({ monthly_limit_cents: 500000 })]
    render(<PlanHealthHero health={summaryFor().health} />)
    const value = screen.getByTestId('left-to-plan')
    expect(value.getAttribute('style') ?? '').not.toContain('--destructive')
  })

  it('reflects the selected month (FR-007): a month with no income shows zero income', () => {
    store.transactions = [makeTx({ kind: 'income', category: 'income', amount_cents: 400000, date: '2026-06-05T12:00:00.000Z' })]
    const { rerender } = render(<PlanHealthHero health={summaryFor('2026-06').health} />)
    expect(screen.getByTestId('plan-breakdown')).toHaveTextContent(money(400000))
    rerender(<PlanHealthHero health={summaryFor('2026-05').health} />)
    expect(screen.getByTestId('plan-breakdown')).toHaveTextContent(money(0)) // no May income
  })
})

// ── US3: budget summary ─────────────────────────────────────────────────────────
describe('BudgetSummaryCard (US3)', () => {
  it('shows an overall bar and at-risk categories with remaining/over + rollover carry', () => {
    store.budgets = [
      makeBudget({ id: 'b-g', category: 'groceries', budget_type: 'fixed', monthly_limit_cents: 100000 }),
      makeBudget({ id: 'b-d', category: 'dining', budget_type: 'flex', monthly_limit_cents: 100000, created_at: '2026-05-01T00:00:00.000Z' }),
      makeBudget({ id: 'b-t', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 50000 }),
    ]
    store.transactions = [makeTx({ category: 'groceries', amount_cents: 90000, date: '2026-06-10T12:00:00.000Z' })]
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)

    expect(screen.getByTestId('budget-overall-bar')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText(`${money(10000)} left`)).toBeInTheDocument()
    // dining (flex, created last month, unspent) carries a surplus into June.
    expect(screen.getByText(/rolled over/i)).toBeInTheDocument()
    // insurance is non-monthly → excluded from the budget summary.
    expect(screen.queryByText('Insurance')).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: /view all budgets/i })
    expect(link).toHaveAttribute('href', '/budgets')
  })

  it('labels an over-limit category as over', () => {
    store.budgets = [makeBudget({ category: 'groceries', monthly_limit_cents: 100000 })]
    store.transactions = [makeTx({ category: 'groceries', amount_cents: 120000, date: '2026-06-10T12:00:00.000Z' })]
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByText(`${money(20000)} over`)).toBeInTheDocument()
  })

  it('shows a calm empty state with a link when there are no budgets', () => {
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByRole('link', { name: /budgets/i })).toHaveAttribute('href', '/budgets')
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument()
  })

  it('shows the empty state (not a zeroed card) when the only budgets are non-monthly sinking funds', () => {
    store.budgets = [makeBudget({ category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000 })]
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('budget-overall-bar')).not.toBeInTheDocument()
  })
})

// ── US4: goals summary ──────────────────────────────────────────────────────────
describe('GoalsSummaryCard (US4)', () => {
  it('lists behind goals first with a suggested monthly, undated goals neutral', () => {
    store.goals = [
      makeGoal({ id: 'g-on', name: 'On Track', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2027-12-31' }),
      makeGoal({ id: 'g-un', name: 'Someday', target_cents: 50000, target_date: null }),
      makeGoal({ id: 'g-behind', name: 'Behind Fund', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2026-07-01' }),
    ]
    store.goalContributions = [contrib('g-on', 60000)]
    render(<GoalsSummaryCard summary={summaryFor().goals} />)

    const rows = screen.getAllByTestId('goal-row')
    expect(within(rows[0]).getByText(/Behind Fund/)).toBeInTheDocument()
    expect(within(rows[0]).getByText(/\/mo/)).toBeInTheDocument() // catch-up suggestion

    const undated = rows.find((r) => within(r).queryByText('Someday'))!
    expect(within(undated).queryByText(/\/mo/)).toBeNull()

    expect(screen.getByRole('link', { name: /view all goals/i })).toHaveAttribute('href', '/goals')
  })

  it('shows a calm empty state with a link when there are no goals', () => {
    render(<GoalsSummaryCard summary={summaryFor().goals} />)
    expect(screen.getByRole('link', { name: /goals/i })).toHaveAttribute('href', '/goals')
    expect(screen.getByTestId('goals-empty')).toBeInTheDocument()
  })
})

// ── US5: sinking funds ──────────────────────────────────────────────────────────
describe('SinkingFundsPanel (US5)', () => {
  it('lists non-monthly categories with their set-aside amount', () => {
    store.budgets = [makeBudget({ id: 'b-t', category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000, created_at: '2026-01-01T00:00:00.000Z' })]
    render(<SinkingFundsPanel funds={summaryFor().sinkingFunds} />)
    expect(screen.getByTestId('sinking-funds')).toBeInTheDocument()
    expect(screen.getByText('Insurance')).toBeInTheDocument()
  })

  it('shows a carried shortfall (not a negative "set aside") when a fund was overspent', () => {
    const funds: SinkingFund[] = [{ budgetId: 'b-t', category: 'insurance', setAsideCents: -5000, baseLimitCents: 20000 }]
    render(<SinkingFundsPanel funds={funds} />)
    expect(screen.getByText(`${money(5000)} carried shortfall`)).toBeInTheDocument()
    expect(screen.queryByText(/set aside/)).toBeNull()
  })

  it('renders nothing when there are no non-monthly budgets', () => {
    const { container } = render(<SinkingFundsPanel funds={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ── US1: month bar, hub page, old-link redirect ─────────────────────────────────
describe('PlanningMonthBar (US1)', () => {
  it('disables "Next" at the current month (no fabricated future income)', () => {
    render(<PlanningMonthBar monthKey={currentMonthKey(NOW)} now={NOW} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /next month/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /previous month/i })).not.toBeDisabled()
  })

  it('enables "Next" on a past month and offers a This month reset', () => {
    render(<PlanningMonthBar monthKey="2026-04" now={NOW} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /next month/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /this month/i })).toBeInTheDocument()
  })
})

describe('Planning hub page (US1)', () => {
  it('renders the Planning header, a month bar, and links out to Budgets and Goals', () => {
    render(<PlanningPage />)
    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view all budgets/i })).toHaveAttribute('href', '/budgets')
    expect(screen.getByRole('link', { name: /view all goals/i })).toHaveAttribute('href', '/goals')
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument()
  })
})

describe('Settings › Planning redirect (US1, FR-004)', () => {
  it('redirects the old location to the new top-level hub', () => {
    render(<SettingsPlanningRedirect />)
    expect(replaceSpy).toHaveBeenCalledWith('/planning')
  })
})

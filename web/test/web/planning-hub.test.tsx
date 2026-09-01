// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
  // spec 051 — the hub's scope bar reads the roster; a solo household hides it entirely.
  householdMembers: Array<{ id: string; name: string }>
  formatMoney: (cents: number, opts?: { leadingPlus?: boolean }) => string
  t: (key: string, ...args: (string | number)[]) => string
  locale: string
  // The Goals section now owns the goal + contribution forms (spec 045), so the
  // mocked store has to carry what those forms read.
  currency: string
  rate: (c: string) => number
  currentHousehold: { id: string } | null
  currentUserId: string
  linkedAccounts: unknown[]
  addGoal: (g: Goal) => void
  updateGoal: (g: Goal) => void
  deleteGoal: (id: string) => void
  addContribution: (c: GoalContribution) => void
  updateContribution: (c: GoalContribution) => void
  deleteContribution: (id: string) => void
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
    person_id: o.person_id ?? null,
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
    householdMembers: [{ id: 'u-me', name: 'Me' }],
    formatMoney: money,
    t: (key, ...args) => (args.length ? key.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)])) : key),
    locale: 'en-US',
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'hh-1' },
    currentUserId: 'u-me',
    linkedAccounts: [],
    addGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    addContribution: vi.fn(),
    updateContribution: vi.fn(),
    deleteContribution: vi.fn(),
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

  it('shows unbudgeted spend in the breakdown and subtracts it from Left to plan (spec 040)', () => {
    store.transactions = [
      makeTx({ kind: 'income', category: 'income', amount_cents: 1000000, date: '2026-06-05T12:00:00.000Z' }),
      makeTx({ kind: 'expense', category: 'entertainment', amount_cents: 500000, date: '2026-06-12T12:00:00.000Z' }),
    ]
    store.budgets = [makeBudget({ category: 'groceries', monthly_limit_cents: 200000 })]
    render(<PlanHealthHero health={summaryFor().health} />)

    const breakdown = screen.getByTestId('plan-breakdown')
    expect(breakdown).toHaveTextContent('Spent (unbudgeted)')
    expect(breakdown).toHaveTextContent(money(500000))
    // 1,000,000 − 200,000 budgeted − 500,000 unbudgeted = 300,000.
    expect(screen.getByTestId('left-to-plan')).toHaveTextContent(money(300000))
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
    expect(link).toHaveAttribute('href', '/planning/budget')
  })

  it('labels an over-limit category as over', () => {
    store.budgets = [makeBudget({ category: 'groceries', monthly_limit_cents: 100000 })]
    store.transactions = [makeTx({ category: 'groceries', amount_cents: 120000, date: '2026-06-10T12:00:00.000Z' })]
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByText(`${money(20000)} over`)).toBeInTheDocument()
  })

  it('shows a calm empty state with a link when there are no budgets', () => {
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByRole('link', { name: /budgets/i })).toHaveAttribute('href', '/planning/budget')
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument()
  })

  it('shows the empty state (not a zeroed card) when the only budgets are non-monthly sinking funds', () => {
    store.budgets = [makeBudget({ category: 'insurance', budget_type: 'non_monthly', monthly_limit_cents: 20000 })]
    render(<BudgetSummaryCard summary={summaryFor().budgets} />)
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('budget-overall-bar')).not.toBeInTheDocument()
  })
})

// ── US4: goals summary (spec 045 — one card per goal, no index page) ────────────
describe('GoalsSummaryCard (US4)', () => {
  const threeGoals = () => {
    store.goals = [
      makeGoal({ id: 'g-on', name: 'On Track', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2027-12-31' }),
      makeGoal({ id: 'g-un', name: 'Someday', target_cents: 50000, target_date: null }),
      makeGoal({ id: 'g-behind', name: 'Behind Fund', target_cents: 120000, created_at: '2026-01-01T00:00:00.000Z', target_date: '2026-07-01' }),
    ]
    store.goalContributions = [contrib('g-on', 60000)]
  }

  it('renders one card per item, behind first', () => {
    threeGoals()
    render(<GoalsSummaryCard summary={summaryFor().goals} />)

    const cards = screen.getAllByTestId('savings-debt-card')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]).getByText(/Behind Fund/)).toBeInTheDocument()
  })

  it('no longer prescribes a catch-up monthly amount (spec 059 FR-035)', () => {
    // The old card told you to "set aside $X/mo to reach it by ...". The
    // redesign describes the cadence you ARE paying and offers levers on the
    // detail page; it never recommends an amount or judges the pace.
    threeGoals()
    render(<GoalsSummaryCard summary={summaryFor().goals} />)

    const behind = screen
      .getAllByTestId('savings-debt-card')
      .find((c) => within(c).queryByText(/Behind Fund/))!
    expect(within(behind).queryByText(/set aside/i)).toBeNull()
    expect(within(behind).queryByText(/behind pace/i)).toBeNull()
  })

  it('opens each goal at its own detail address', () => {
    threeGoals()
    render(<GoalsSummaryCard summary={summaryFor().goals} />)
    expect(screen.getByRole('link', { name: /Behind Fund/ })).toHaveAttribute(
      'href',
      '/planning/goals?id=g-behind'
    )
  })

  it('no longer links to an all-goals index', () => {
    threeGoals()
    render(<GoalsSummaryCard summary={summaryFor().goals} />)
    // Every goals link must target a SPECIFIC goal — the index is retired.
    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('/planning/goals')) expect(href).toContain('?id=')
    }
    expect(screen.queryByRole('link', { name: /view all goals/i })).toBeNull()
  })

  it('offers item creation, which the retired index page used to own', () => {
    render(<GoalsSummaryCard summary={summaryFor().goals} />)
    expect(screen.getByRole('button', { name: /new item/i })).toBeInTheDocument()
  })

  it('shows a calm empty state when there are no goals', () => {
    render(<GoalsSummaryCard summary={summaryFor().goals} />)
    expect(screen.getByTestId('goals-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('savings-debt-card')).toBeNull()
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
  it('renders the Planning header, a month bar, the Budgets link and the Savings & Debts section', () => {
    render(<PlanningPage />)
    expect(screen.getByRole('heading', { name: 'Planning' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view all budgets/i })).toHaveAttribute('href', '/planning/budget')
    // Savings & Debts has no "view all" any more — the section itself is where
    // the items live.
    expect(screen.queryByRole('link', { name: /view all goals/i })).toBeNull()
    expect(screen.getByRole('button', { name: /new item/i })).toBeInTheDocument()
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

// ── spec 051: the money-scope bar ────────────────────────────────────────────

describe('Planning hub — whose money (spec 051)', () => {
  it('hides the scope bar for a one-person household', () => {
    render(<PlanningPage />)
    expect(screen.queryByRole('tablist', { name: 'Whose money' })).toBeNull()
  })

  it('offers Everyone plus each person once there are two', () => {
    store.householdMembers = [
      { id: 'u-me', name: 'Me' },
      { id: 'u-them', name: 'Sam' },
    ]
    render(<PlanningPage />)
    const bar = screen.getByRole('tablist', { name: 'Whose money' })
    expect(within(bar).getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true')
    expect(within(bar).getByRole('tab', { name: 'Me' })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: 'Sam' })).toBeInTheDocument()
  })

  it('re-scopes the figures to one person’s share', () => {
    store.householdMembers = [
      { id: 'u-me', name: 'Me' },
      { id: 'u-them', name: 'Sam' },
    ]
    // A household grocery budget AND one person's own (spec 054) — the two must not
    // be confused for each other when the scope changes.
    store.budgets = [
      makeBudget({ category: 'groceries', monthly_limit_cents: 40000 }),
      makeBudget({ id: 'b-mine', category: 'groceries', monthly_limit_cents: 20000, person_id: 'u-me' }),
    ]
    store.transactions = [
      {
        id: 't1',
        household_id: 'hh-1',
        merchant: 'Grocer',
        category: 'groceries',
        kind: 'expense',
        amount_cents: 30000,
        source: '',
        date: new Date().toISOString(),
        created_by: 'u-me',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        paid_by: 'u-me',
        owner_ids: ['u-me', 'u-them'],
        shares: { 'u-me': 15000, 'u-them': 15000 },
        notes: null,
      } as Transaction,
    ]
    const { container } = render(<PlanningPage />)
    const bar = screen.getByRole('tablist', { name: 'Whose money' })

    // Household scope counts the whole $300 of shared spend against the household's
    // $400 limit, and never shows the personal $200 one.
    expect(container.textContent).toContain('$300.00')
    expect(container.textContent).not.toContain('$150.00')
    expect(container.textContent).toContain('$400.00')
    expect(container.textContent).not.toContain('$200.00')

    // Scoping to one person counts only their $150 share, measured against THEIR OWN
    // $200 limit — the $400 household allowance is not borrowed (spec 054, FR-003).
    fireEvent.click(within(bar).getByRole('tab', { name: 'Me' }))
    expect(within(bar).getByRole('tab', { name: 'Me' })).toHaveAttribute('aria-selected', 'true')
    expect(container.textContent).toContain('$150.00')
    expect(container.textContent).toContain('$200.00')
    expect(container.textContent).not.toContain('$400.00')
  })
})

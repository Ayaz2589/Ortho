// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { DashboardScopeProvider } from '@/lib/widgets/DashboardScopeContext'
import { WIDGETS } from '@/lib/widgets/registry'
import { WIDGETS_STORAGE_KEY } from '@/lib/widgets/preferences'

// Integration: all data-wired widgets compose under ONE DashboardScopeProvider
// against a realistic store, each reading the same window. Net summary is now the
// baked-in hero (tested separately), not a board widget. Dates are anchored to the
// real "now" so they land in the default "This month" scope regardless of when the
// suite runs.

const now = new Date()
const day = Math.min(now.getDate(), 28)
const inMonth = new Date(now.getFullYear(), now.getMonth(), day, 12).toISOString()
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    locale: 'en-US',
    formatMoney: (c: number) => `$${c}`,
    transactions: [
      { id: 'i1', kind: 'income', merchant: 'Employer', category: 'salary', amount_cents: 300000, date: inMonth, owner_ids: ['p1'] },
      { id: 'e1', kind: 'expense', merchant: 'Costco', category: 'groceries', amount_cents: 120000, date: inMonth, owner_ids: ['p1'] },
      { id: 'e2', kind: 'expense', merchant: 'Cafe', category: 'coffee', amount_cents: 45000, date: inMonth, owner_ids: ['p1'] },
    ],
    budgets: [
      { id: 'b1', category: 'groceries', monthly_limit_cents: 200000, budget_type: 'fixed', rollover_cap_cents: null, created_at: firstOfMonth },
    ],
    goals: [
      { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 100000, target_date: null, created_at: firstOfMonth },
    ],
    goalContributions: [{ id: 'c1', goal_id: 'g1', amount_cents: 60000, date: firstOfMonth }],
    // spec 041 — Financial Health surface. A profile makes the widget render a real score.
    userFinancialProfile: {
      id: 'p', user_id: 'p1', monthly_income_cents: 300000, income_is_variable: false,
      income_low_estimate_cents: null, housing_type: 'rent', housing_cost_cents: 100000,
      housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: '1_3m',
      created_at: firstOfMonth, updated_at: firstOfMonth,
    },
    userFixedCosts: [],
    userDimensionWeights: [],
    healthSnapshots: [],
    // No properties → the housing widgets (spec 036) render their calm empty states;
    // their headings still count toward WIDGETS.length.
    properties: [],
    ownersDisplay: () => ({ avatarUser: {}, label: 'Maya', count: 1 }),
    // spec 053 — the household-balances widget needs a roster to resolve names against.
    // Two people, so it renders its real (all-settled) state rather than the solo prompt:
    // the fixture transactions carry no payer, so no balance can arise.
    householdMembers: [
      { id: 'p1', name: 'Maya', initial: 'M', color_key: 'sage', created_at: firstOfMonth },
      { id: 'p2', name: 'Jordan', initial: 'J', color_key: 'slate', created_at: firstOfMonth },
    ],
    currentPersonId: 'p1',
    resolveUser: (id: string) => ({ id, name: id === 'p1' ? 'Maya' : 'Jordan', initial: 'M', color_key: 'sage', created_at: firstOfMonth }),
    routines: [],
  }),
}))

beforeEach(() => {
  localStorage.clear()
  // Enable every widget (activity ships default-off).
  localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(Object.fromEntries(WIDGETS.map((w) => [w.id, true]))))
})
afterEach(cleanup)

describe('dashboard board — all widgets wired to one scope', () => {
  it('renders every widget with real household figures', async () => {
    render(
      <DashboardScopeProvider>
        <WidgetBoard />
      </DashboardScopeProvider>
    )
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(WIDGETS.length)
    })

    // savings-trends: rate = (income 300000 − expense 165000) / 300000 = 45%.
    expect(screen.getByText('Savings rate')).toBeTruthy()
    expect(screen.getByText('45%')).toBeTruthy()

    // budgets: 200000 − 120000 = 80000 left on Groceries.
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('$80000 left')).toBeTruthy()

    // savings & debts: a savings item leads with what has accumulated (spec 059).
    expect(screen.getByText('Emergency fund')).toBeTruthy()
    expect(screen.getByText('$60000 saved')).toBeTruthy()

    // top-merchants + activity both surface the merchant names.
    expect(screen.getAllByText('Costco').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Employer')).toBeTruthy() // activity feed (income)

    // spending-pace readout present (expenses this month).
    expect(screen.getByText('Avg / day')).toBeTruthy()
  })
})

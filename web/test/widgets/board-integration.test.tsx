// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { DashboardScopeProvider } from '@/lib/widgets/DashboardScopeContext'
import { WIDGETS } from '@/lib/widgets/registry'
import { WIDGETS_STORAGE_KEY } from '@/lib/widgets/preferences'

// Section 7 (integration): all six data-wired widgets compose under ONE
// DashboardScopeProvider against a realistic store, each reading the same window.
// Dates are anchored to the real "now" so they land in the default "This month"
// scope regardless of when the suite runs.

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
    ownersDisplay: () => ({ avatarUser: {}, label: 'Maya', count: 1 }),
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

    // net-summary: net = 300000 − (120000 + 45000) = 135000, income 300000.
    expect(screen.getByText('Net')).toBeTruthy()
    expect(screen.getByText('$135000')).toBeTruthy()
    // $300000 (income) shows in both net-summary and the activity feed row.
    expect(screen.getAllByText('$300000').length).toBeGreaterThanOrEqual(1)

    // budgets: 200000 − 120000 = 80000 left on Groceries.
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('$80000 left')).toBeTruthy()

    // goals: 100000 − 60000 = 40000 to go.
    expect(screen.getByText('Emergency fund')).toBeTruthy()
    expect(screen.getByText('$40000 to go')).toBeTruthy()

    // top-merchants + activity both surface the merchant names.
    expect(screen.getAllByText('Costco').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Employer')).toBeTruthy() // activity feed (income)

    // spending-pace readout present (expenses this month).
    expect(screen.getByText('Avg / day')).toBeTruthy()
  })
})

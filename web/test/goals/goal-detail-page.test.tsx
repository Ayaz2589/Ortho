// @vitest-environment jsdom
//
// spec 045 US2 — /planning/goals is no longer an index of every goal; it is the
// DETAIL page for the one goal named by `?id=`. Route contract C1.
//
// The redirect guards are the fragile part: the query string is read after mount
// and the store loads asynchronously, so a page that redirects eagerly would bounce
// a legitimate refresh to /planning before the goal ever arrives. Both "not known
// yet" states must render nothing and redirect nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

const replaceSpy = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/planning/goals',
  useRouter: () => ({ push: vi.fn(), replace: replaceSpy }),
}))

interface StoreView {
  goals: Goal[]
  goalContributions: GoalContribution[]
  loading: boolean
  currency: string
  rate: () => number
  currentHousehold: { id: string } | null
  currentUserId: string
  linkedAccounts: unknown[]
  locale: string
  formatMoney: (c: number) => string
  t: (k: string, ...a: Array<string | number>) => string
  addGoal: () => void
  updateGoal: () => void
  deleteGoal: (id: string) => void
  addContribution: () => void
  updateContribution: () => void
  deleteContribution: (id: string) => void
}
let store: StoreView
vi.mock('@/lib/store', () => ({ useApp: () => store }))

// Keep this suite on the route contract — the chart leaves have their own concerns
// and are loaded dynamically in the real page.
vi.mock('@/components/goals/charts/GoalCumulativeChart', () => ({
  GoalCumulativeChart: () => <div data-testid="cumulative-chart" />,
}))
vi.mock('@/components/goals/charts/GoalMonthlyChart', () => ({
  GoalMonthlyChart: () => <div data-testid="monthly-chart" />,
}))

import GoalDetailPage from '@/app/(app)/planning/goals/page'

const GOAL: Goal = {
  id: 'g1',
  household_id: 'h1',
  name: 'Emergency fund',
  kind: 'savings',
  target_cents: 100000,
  target_date: '2026-12-31',
  linked_account_id: null,
  linked_category: null,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as Goal

const CONTRIB: GoalContribution = {
  id: 'c1',
  goal_id: 'g1',
  amount_cents: 25000,
  date: '2026-03-01',
  note: null,
  created_by: 'u1',
  created_at: '2026-03-01T00:00:00.000Z',
}

function setSearch(search: string) {
  window.history.replaceState({}, '', `/planning/goals${search}`)
}

beforeEach(() => {
  replaceSpy.mockClear()
  setSearch('')
  store = {
    goals: [GOAL],
    goalContributions: [CONTRIB],
    loading: false,
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'h1' },
    currentUserId: 'u1',
    linkedAccounts: [],
    locale: 'en-US',
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
    addGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    addContribution: vi.fn(),
    updateContribution: vi.fn(),
    deleteContribution: vi.fn(),
  }
})
afterEach(cleanup)

describe('goal detail page — resolving the goal', () => {
  it('renders the named goal', async () => {
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByText('Emergency fund')).toBeTruthy())
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('shows that goal’s money figures and progress', async () => {
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('goal-headline')).toBeTruthy())
    expect(screen.getByTestId('goal-headline')).toHaveTextContent('$250.00')
    expect(screen.getByTestId('goal-headline')).toHaveTextContent('$1000.00')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('shows the whole ledger, not a capped preview', async () => {
    store.goalContributions = Array.from({ length: 6 }, (_, i) => ({
      ...CONTRIB,
      id: `c${i}`,
      date: `2026-0${i + 1}-01`,
    }))
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('contribution-list')).toBeTruthy())
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
  })

  it('renders both charts when there are contributions', async () => {
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('cumulative-chart')).toBeTruthy())
    expect(screen.getByTestId('monthly-chart')).toBeTruthy()
  })

  it('replaces the charts with a calm empty state when there are none', async () => {
    store.goalContributions = []
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('goal-charts-empty')).toBeTruthy())
    expect(screen.queryByTestId('cumulative-chart')).toBeNull()
    expect(screen.queryByTestId('monthly-chart')).toBeNull()
  })
})

describe('goal detail page — redirect guards', () => {
  it('returns to Planning with no query string', async () => {
    setSearch('')
    render(<GoalDetailPage />)
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/planning'))
  })

  it('returns to Planning on a blank id', async () => {
    setSearch('?id=%20')
    render(<GoalDetailPage />)
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/planning'))
  })

  it('returns to Planning on an unknown id', async () => {
    setSearch('?id=nope')
    render(<GoalDetailPage />)
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/planning'))
  })

  it('returns to Planning when the goal is deleted while open', async () => {
    setSearch('?id=g1')
    const { rerender } = render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByText('Emergency fund')).toBeTruthy())

    store.goals = []
    rerender(<GoalDetailPage />)
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/planning'))
  })

  it('does NOT redirect while the store is still loading', async () => {
    // A refresh must not bounce to Planning before the goals arrive.
    store.loading = true
    store.goals = []
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await new Promise((r) => setTimeout(r, 20))
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(screen.queryByText('Emergency fund')).toBeNull()
  })

  it('renders no error screen on an unresolvable id — just nothing, then the redirect', async () => {
    setSearch('?id=nope')
    const { container } = render(<GoalDetailPage />)
    await waitFor(() => expect(replaceSpy).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})

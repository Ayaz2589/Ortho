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

// Keep this suite on the route contract and the block structure — the chart leaf
// has its own concerns and is loaded dynamically in the real page.
vi.mock('@/components/goals/charts/GoalProgressChart', () => ({
  GoalProgressChart: () => <div data-testid="progress-chart" />,
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
  it('renders the named item', async () => {
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByText('Emergency fund')).toBeTruthy())
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('leads with the type-appropriate headline and the target as a qualifier', async () => {
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('detail-headline')).toBeTruthy())
    // A savings item is measured by what has accumulated.
    expect(screen.getByTestId('detail-headline')).toHaveTextContent('$250.00')
    expect(screen.getByTestId('detail-headline')).toHaveTextContent('saved of $1000.00')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('leads a debt with what remains instead', async () => {
    store.goals = [{ ...GOAL, kind: 'debt_payoff' } as Goal]
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('detail-headline')).toBeTruthy())
    expect(screen.getByTestId('detail-headline')).toHaveTextContent('$750.00')
    expect(screen.getByTestId('detail-headline')).toHaveTextContent('left of $1000.00')
  })

  it('shows the whole ledger, not a capped preview', async () => {
    store.goalContributions = Array.from({ length: 6 }, (_, i) => ({
      ...CONTRIB,
      id: `c${i}`,
      date: `2026-0${i + 1}-01`,
    }))
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getAllByTestId('ledger-row').length).toBe(6))
    expect(screen.queryByText('See all in detail')).toBeNull()
  })

  it('renders all five blocks when there is enough history', async () => {
    store.goalContributions = Array.from({ length: 6 }, (_, i) => ({
      ...CONTRIB,
      id: `c${i}`,
      amount_cents: 10000,
      date: `2026-0${i + 1}-01`,
    }))
    setSearch('?id=g1')
    render(<GoalDetailPage />)

    await waitFor(() => expect(screen.getByTestId('block-projected-finish-value')).toBeTruthy())
    expect(screen.getByTestId('block-progress-value')).toBeTruthy()
    expect(screen.getByTestId('block-pace-value')).toBeTruthy()
    expect(screen.getByTestId('block-consistency-value')).toBeTruthy()
    expect(screen.getByTestId('ledger-total')).toBeTruthy()
    expect(screen.queryByTestId('detail-no-projection')).toBeNull()
  })

  it('collapses the four analysis blocks to one honest line without enough history', async () => {
    // One contribution. The ledger still renders in full — what already
    // happened is still true; only the FUTURE is unknowable.
    setSearch('?id=g1')
    render(<GoalDetailPage />)

    await waitFor(() => expect(screen.getByTestId('detail-no-projection')).toBeTruthy())
    expect(screen.getByTestId('detail-no-projection')).toHaveTextContent('Not enough history to project yet')
    expect(screen.queryByTestId('block-projected-finish-value')).toBeNull()
    expect(screen.queryByTestId('block-progress-value')).toBeNull()
    expect(screen.queryByTestId('block-pace-value')).toBeNull()
    expect(screen.queryByTestId('block-consistency-value')).toBeNull()
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(1)
  })

  it('names no date anywhere when the projection was refused', async () => {
    setSearch('?id=g1')
    const { container } = render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByTestId('detail-no-projection')).toBeTruthy())
    expect(container.textContent ?? '').not.toMatch(/payments to go|deposits to go/)
  })

  it('says so calmly when there are no contributions at all', async () => {
    store.goalContributions = []
    setSearch('?id=g1')
    render(<GoalDetailPage />)
    await waitFor(() => expect(screen.getByText('No contributions yet')).toBeTruthy())
    expect(screen.queryByTestId('progress-chart')).toBeNull()
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

// @vitest-environment jsdom
//
// spec 056 — the dashboard page owns the money scope and supplies it to the board.
//
// Before this, the page held a `personId` string that reached the net hero only,
// and the widget board below stayed household-wide: picking a person changed the
// hero's numbers while every widget kept reporting everyone's. The page now holds
// a MoneyScope (mirroring app/(app)/planning/page.tsx) and wraps the board in a
// MoneyScopeProvider; `personId` is DERIVED from the scope for the picker and hero.
//
// The board is stubbed with a probe here — what each widget does with the scope is
// test/widgets/person-scoped-widgets.test.tsx's job. This suite is about the wiring.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import { useMoneyScope } from '@/lib/widgets/MoneyScopeContext'

const ALICE = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }

const h = vi.hoisted(() => ({
  members: [] as Array<{ id: string; name: string }>,
  /** Every scope the board has been handed, in render order — lets us assert identity. */
  seen: [] as MoneyScope[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string) => k,
    locale: 'en-US',
    transactions: [{ id: 't1', date: '2026-08-15T12:00:00.000Z' }],
    householdMembers: h.members,
  }),
}))

vi.mock('@/components/dashboard/NetSummaryHero', () => ({
  NetSummaryHero: ({ personId }: { personId?: string | null }) => (
    <div data-testid="net-hero">{personId ?? 'household'}</div>
  ),
}))

// The board stub reads the people axis exactly as a real widget body would.
vi.mock('@/components/widgets/WidgetBoard', () => ({
  WidgetBoard: () => {
    const scope = useMoneyScope()
    h.seen.push(scope)
    return (
      <div data-testid="board-scope">
        {scope.kind}
        {scope.kind === 'person' ? `:${scope.personId}` : ''}
      </div>
    )
  },
}))

import DashboardPage from '@/app/(app)/dashboard/page'

const boardScope = () => screen.getByTestId('board-scope').textContent
const pickMember = (name: string) => {
  const picker = screen.getByLabelText('Member view')
  fireEvent.click(within(picker).getByRole('button'))
  fireEvent.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
  localStorage.clear()
  h.members = [ALICE, BOB]
  h.seen = []
})
afterEach(cleanup)

describe('dashboard money scope', () => {
  it('starts on the household', () => {
    render(<DashboardPage />)
    expect(boardScope()).toBe('household')
    expect(screen.getByTestId('net-hero').textContent).toBe('household')
  })

  it('supplies the selected person to the board', () => {
    render(<DashboardPage />)
    pickMember('Bob')
    expect(boardScope()).toBe('person:p2')
  })

  it('keeps the hero and the board on the same subject', () => {
    // The whole defect this feature fixes was these two disagreeing.
    render(<DashboardPage />)
    pickMember('Alice')
    expect(boardScope()).toBe('person:p1')
    expect(screen.getByTestId('net-hero').textContent).toBe('p1')
  })

  it('returns to the household when Household is reselected', () => {
    render(<DashboardPage />)
    pickMember('Bob')
    pickMember('Household')
    expect(boardScope()).toBe('household')
  })

  it('falls back to the household when the selected person leaves the roster', () => {
    // FR-004 / C-10 — a stale selection must degrade, never empty the board.
    const { rerender } = render(<DashboardPage />)
    pickMember('Bob')
    expect(boardScope()).toBe('person:p2')

    h.members = [ALICE]
    rerender(<DashboardPage />)
    expect(boardScope()).toBe('household')
  })

  it('hands the board a referentially STABLE scope across re-renders', () => {
    // useScopedTransactions memoizes on the scope object. If the page rebuilt it
    // each render (e.g. `personId ? personScope(personId) : HOUSEHOLD_SCOPE` in the
    // render body) every downstream memo would silently recompute every render.
    const { rerender } = render(<DashboardPage />)
    pickMember('Bob')
    const afterPick = h.seen[h.seen.length - 1]

    rerender(<DashboardPage />)
    expect(h.seen[h.seen.length - 1]).toBe(afterPick)
  })

  it('renders with no picker and household scope for a one-person household', () => {
    h.members = [ALICE]
    render(<DashboardPage />)
    expect(screen.queryByLabelText('Member view')).toBeNull()
    expect(boardScope()).toBe('household')
  })

  it('tolerates a store with no household roster at all', () => {
    // Pre-existing suites (e.g. test/widgets/dashboard-scope-bar.test.tsx) mock the
    // store without `householdMembers`. Those files are the regression lock for this
    // feature and must not be edited, so the page has to cope.
    h.members = undefined as never
    expect(() => render(<DashboardPage />)).not.toThrow()
    expect(boardScope()).toBe('household')
  })
})

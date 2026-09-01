// @vitest-environment jsdom
//
// spec 057 US9 → reworked by spec 059 US5. The panel now reads the SHARED
// projection engine instead of deriving its own months-remaining figure, so it
// cannot disagree with the Planning card it links to.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

const h = vi.hoisted(() => ({
  goals: [] as Goal[],
  contributions: [] as GoalContribution[],
  scope: {} as { now: Date },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')) : k,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    goals: h.goals,
    goalContributions: h.contributions,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

import { GoalsPanel } from '@/components/widgets/panels/GoalsPanel'
import { SavingsDebtCard } from '@/components/goals/SavingsDebtCard'
import { WIDGETS } from '@/lib/widgets/registry'

const NOW = new Date(2026, 7, 15)

const goal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: 'g1',
    household_id: 'h1',
    name: 'Tasnuva Owes Ayaz',
    kind: 'debt_payoff',
    target_cents: 1_750_000,
    target_date: null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u1',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    ...over,
  }) as Goal

const contrib = (goalId: string, date: string, cents: number): GoalContribution => ({
  id: `${goalId}-${date}`,
  goal_id: goalId,
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

const STEADY = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']

beforeEach(() => {
  h.scope = { now: NOW }
  h.goals = [goal()]
  h.contributions = STEADY.map((d) => contrib('g1', d, 60_000))
})
afterEach(cleanup)

describe('GoalsPanel — vocabulary', () => {
  it('leads a debt with what remains and a savings item with what has accumulated', () => {
    h.goals = [goal(), goal({ id: 'g2', name: 'ROG XReal Glasses', kind: 'savings', target_cents: 100_000 })]
    h.contributions = [
      ...STEADY.map((d) => contrib('g1', d, 60_000)),
      ...['2026-06-01', '2026-07-01', '2026-08-01'].map((d) => contrib('g2', d, 10_000)),
    ]
    render(<GoalsPanel />)
    expect(screen.getByText('$13300.00 left')).toBeTruthy()
    expect(screen.getByText('$300.00 saved')).toBeTruthy()
  })

  it('states the combined monthly commitment', () => {
    render(<GoalsPanel />)
    expect(screen.getByText('$600.00')).toBeTruthy()
  })

  it('says so honestly when an item cannot be projected', () => {
    h.contributions = [contrib('g1', '2026-02-01', 60_000)]
    render(<GoalsPanel />)
    expect(screen.getByTestId('panel-eta')).toHaveTextContent('Not enough history to project yet')
    expect(screen.getByTestId('panel-eta').textContent ?? '').not.toMatch(/20\d\d/)
  })

  it('never says "goal"', () => {
    h.goals = []
    const { container } = render(<GoalsPanel />)
    expect(container.textContent ?? '').not.toMatch(/goal/i)
  })
})

describe('GoalsPanel — agrees with the Planning card', () => {
  it('states the SAME finish month and payment count as the card, for the same reference date', () => {
    // The regression this rework exists to prevent: the panel used to derive its
    // own months-remaining from an average of monthly totals, so it could state
    // a different date than the card it links to.
    const { container: panel } = render(<GoalsPanel />)
    const panelEta = within(panel).getByTestId('panel-eta').textContent ?? ''
    cleanup()

    const { container: card } = render(
      <SavingsDebtCard goal={goal()} contributions={h.contributions} now={NOW} />
    )
    const cardEta = within(card).getByTestId('sd-eta').textContent ?? ''

    expect(panelEta).toContain('July 2028')
    expect(cardEta).toContain('July 2028')
    expect(panelEta).toContain('23 more payments')
    expect(cardEta).toContain('23 more payments')
  })
})

describe('savings & debts widget registration', () => {
  const widget = WIDGETS.find((w) => w.id === 'goals')

  it('is titled "Savings & Debts", never "Goals"', () => {
    expect(widget?.title).toBe('Savings & Debts')
    expect(widget?.description ?? '').not.toMatch(/goal/i)
  })

  it('KEEPS the id "goals" despite the rename', () => {
    // The id is the localStorage key for per-browser widget enablement. Renaming
    // it to match the new title would silently reset every existing user's
    // dashboard layout — a data-shaped regression hiding behind a cosmetic
    // rename (spec 059 research R5).
    expect(widget).toBeDefined()
    expect(WIDGETS.some((w) => w.id === 'savings-debts')).toBe(false)
  })
})

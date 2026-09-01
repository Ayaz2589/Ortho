// @vitest-environment jsdom
//
// spec 059 US2 + US3 — the Savings & Debts section on the Planning hub: the
// aggregate header no single card can show, and the one-open-at-a-time ledger.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

const deleteGoal = vi.fn()
const deleteContribution = vi.fn()

const goals: Goal[] = [
  mkGoal('a', 'Tasnuva Pay Off Credit Card', 'debt_payoff', 2_300_000),
  mkGoal('b', 'Tasnuva Owes Ayaz', 'debt_payoff', 1_750_000),
  mkGoal('c', 'ROG XReal Glasses', 'savings', 100_000),
]

function mkGoal(id: string, name: string, kind: Goal['kind'], target: number): Goal {
  return {
    id,
    household_id: 'h1',
    name,
    kind,
    target_cents: target,
    target_date: null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function contrib(goalId: string, date: string, cents: number): GoalContribution {
  return {
    id: `${goalId}-${date}`,
    goal_id: goalId,
    amount_cents: cents,
    date,
    note: null,
    created_by: 'u1',
    created_at: `${date}T00:00:00.000Z`,
  }
}

const MONTHS_A = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']
const MONTHS_B = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']
const MONTHS_C = ['2026-06-01', '2026-07-01', '2026-08-01']

const goalContributions: GoalContribution[] = [
  ...MONTHS_A.map((d) => contrib('a', d, 142_800)),
  ...MONTHS_B.map((d) => contrib('b', d, 60_000)),
  ...MONTHS_C.map((d) => contrib('c', d, 10_000)),
]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    goals,
    goalContributions,
    deleteGoal,
    deleteContribution,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

vi.mock('@/components/goals/GoalForm', () => ({ GoalForm: () => null }))
vi.mock('@/components/goals/ContributionForm', () => ({ ContributionForm: () => null }))

import { GoalsSummaryCard } from '@/components/planning/GoalsSummaryCard'

const NOW = new Date(2026, 7, 15)

const summary = {
  rows: goals.map((g) => ({ goalId: g.id, name: g.name, savedCents: 0, targetCents: g.target_cents, offTrack: false, targetDate: null })),
  goalCount: goals.length,
} as never

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Savings & Debts section — naming', () => {
  it('is titled "Savings & Debts", never "Goals"', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    expect(screen.getByText('Savings & Debts')).toBeTruthy()
    expect(screen.queryByText('Goals')).toBeNull()
  })
})

describe('Savings & Debts section — the aggregate header', () => {
  it('states the monthly commitment, what is behind you, and the combined total', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    const verdict = screen.getByTestId('sd-aggregate')
    expect(verdict).toHaveTextContent('$2128.00') // 1428 + 600 + 100
    expect(verdict).toHaveTextContent('$15924.00') // combined contributed
    expect(verdict).toHaveTextContent('$41500.00') // combined target
  })

  it('names the next and the last item to finish', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    const sub = screen.getByTestId('sd-aggregate-sub')
    expect(sub).toHaveTextContent('ROG XReal Glasses')
    expect(sub).toHaveTextContent('Tasnuva Owes Ayaz')
  })

  it('splits the bar by the funded share of the combined total', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    // 1,592,400 / 4,150,000 = 38.37%
    expect(screen.getByTestId('sd-split-funded').style.width).toBe('38.3710843373494%')
  })

  it('closes with a footer stating the active count and the monthly commitment', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    const footer = screen.getByTestId('sd-section-footer')
    expect(footer).toHaveTextContent('3 active')
    expect(footer).toHaveTextContent('$2128.00')
  })
})

describe('Savings & Debts section — one ledger open at a time', () => {
  it('opens a card ledger in place', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    expect(screen.queryAllByTestId('ledger-row')).toHaveLength(0)

    fireEvent.click(screen.getAllByTestId('sd-disclosure')[1])
    expect(screen.getAllByTestId('ledger-row').length).toBeGreaterThan(0)
  })

  it('collapses the first when a second is opened', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    const disclosures = screen.getAllByTestId('sd-disclosure')

    fireEvent.click(disclosures[1]) // 7 contributions
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(7)

    fireEvent.click(disclosures[2]) // 3 contributions
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(3)
  })

  it('closes an open ledger when its own disclosure is pressed again', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    const disclosure = screen.getAllByTestId('sd-disclosure')[1]

    fireEvent.click(disclosure)
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(7)
    fireEvent.click(disclosure)
    expect(screen.queryAllByTestId('ledger-row')).toHaveLength(0)
  })

  it('deletes a contribution without leaving the page', () => {
    render(<GoalsSummaryCard summary={summary} now={NOW} />)
    fireEvent.click(screen.getAllByTestId('sd-disclosure')[2])

    const firstRow = screen.getAllByTestId('ledger-row')[0]
    fireEvent.click(within(firstRow).getByLabelText('Delete contribution'))
    expect(deleteContribution).toHaveBeenCalledWith('c-2026-08-01')
  })
})

describe('Savings & Debts section — empty', () => {
  it('invites a first item without mentioning goals', () => {
    render(<GoalsSummaryCard summary={{ rows: [], goalCount: 0 } as never} now={NOW} />)
    const empty = screen.getByTestId('goals-empty')
    expect(empty.textContent ?? '').not.toMatch(/goal/i)
    expect(screen.queryByTestId('sd-aggregate')).toBeNull()
  })
})

// @vitest-environment jsdom
//
// spec 045 US1 — GoalCard is now the Planning hub's per-goal card, not just the
// old index page's row. It gains an "open goal" link, a capped recent-contribution
// list (the full ledger lives on the detail page), and optional per-contribution
// edit/delete actions used only by the detail page.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { GoalCard } from '@/components/goals/GoalCard'

const NOW = new Date(2026, 5, 15) // 2026-06-15

const goal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: 'g1',
    household_id: 'h1',
    name: 'Emergency fund',
    kind: 'savings',
    target_cents: 100000,
    target_date: null,
    linked_account_id: null,
    linked_category: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Goal

const contrib = (date: string, cents: number, id = `${date}-${cents}`): GoalContribution => ({
  id,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

afterEach(cleanup)

describe('GoalCard — money and progress', () => {
  it('shows saved of target, remaining, and an accessible progress bar', () => {
    render(<GoalCard goal={goal()} contributions={[contrib('2026-03-01', 25000)]} now={NOW} />)

    // Scoped to the headline — the same amount also appears in the ledger below.
    const headline = screen.getByTestId('goal-headline')
    expect(headline).toHaveTextContent('$250.00')
    expect(headline).toHaveTextContent('$1000.00')
    expect(screen.getByText('$750.00 to go')).toBeTruthy()

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
  })

  it('reads as reached once the target is met, and never claims over 100%', () => {
    render(<GoalCard goal={goal()} contributions={[contrib('2026-03-01', 150000)]} now={NOW} />)
    expect(screen.getByText('Reached')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('survives a non-positive target without dividing by zero', () => {
    render(<GoalCard goal={goal({ target_cents: 0 })} contributions={[contrib('2026-03-01', 500)]} now={NOW} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('GoalCard — pace', () => {
  it('states the monthly catch-up for a behind-pace goal, in calm sand and never red', () => {
    render(
      <GoalCard
        goal={goal({ target_date: '2026-07-01' })}
        contributions={[contrib('2026-02-01', 1000)]}
        now={NOW}
      />
    )
    const pace = screen.getByText(/Behind pace/)
    expect(pace).toHaveStyle({ color: 'var(--accent)' })
    expect(pace.style.color).not.toMatch(/red|#f|rgb\(2[0-9]{2}, ?[0-9]{1,2}, ?[0-9]{1,2}\)/i)
  })

  it('makes no pace claim at all for an undated goal', () => {
    render(<GoalCard goal={goal({ target_date: null })} contributions={[contrib('2026-03-01', 1000)]} now={NOW} />)
    expect(screen.queryByText(/Behind pace/)).toBeNull()
    expect(screen.queryByText(/On pace/)).toBeNull()
  })
})

describe('GoalCard — contributions', () => {
  const many = [
    contrib('2026-05-01', 100, 'a'),
    contrib('2026-04-01', 200, 'b'),
    contrib('2026-03-01', 300, 'c'),
    contrib('2026-02-01', 400, 'd'),
    contrib('2026-01-01', 500, 'e'),
  ]

  it('caps the list on the hub and lists newest first', () => {
    render(<GoalCard goal={goal()} contributions={many} now={NOW} maxContributions={3} />)
    const rows = within(screen.getByTestId('contribution-list')).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('$1.00') // 2026-05-01, the newest
  })

  it('shows the whole ledger when no cap is given', () => {
    render(<GoalCard goal={goal()} contributions={many} now={NOW} />)
    expect(within(screen.getByTestId('contribution-list')).getAllByRole('listitem')).toHaveLength(5)
  })

  it('says so calmly when there are none', () => {
    render(<GoalCard goal={goal()} contributions={[]} now={NOW} />)
    expect(screen.getByText('No contributions yet')).toBeTruthy()
  })
})

describe('GoalCard — actions', () => {
  it('links to the goal’s own detail page when href is given', () => {
    render(<GoalCard goal={goal()} contributions={[]} now={NOW} href="/planning/goals?id=g1" />)
    expect(screen.getByRole('link', { name: /Emergency fund/ })).toHaveAttribute(
      'href',
      '/planning/goals?id=g1'
    )
  })

  it('renders no open-goal link without href', () => {
    render(<GoalCard goal={goal()} contributions={[]} now={NOW} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers add-contribution only when handled', () => {
    const onAdd = vi.fn()
    const { rerender } = render(<GoalCard goal={goal()} contributions={[]} now={NOW} />)
    expect(screen.queryByRole('button', { name: /Add contribution/ })).toBeNull()

    rerender(<GoalCard goal={goal()} contributions={[]} now={NOW} onAddContribution={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /Add contribution/ }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }))
  })

  it('offers per-contribution edit and delete only when handled', () => {
    const onEditC = vi.fn()
    const onDeleteC = vi.fn()
    const one = contrib('2026-03-01', 2500, 'c1')

    const { rerender } = render(<GoalCard goal={goal()} contributions={[one]} now={NOW} />)
    expect(screen.queryByRole('button', { name: /Edit contribution/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete contribution/ })).toBeNull()

    rerender(
      <GoalCard
        goal={goal()}
        contributions={[one]}
        now={NOW}
        onEditContribution={onEditC}
        onDeleteContribution={onDeleteC}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Edit contribution/ }))
    expect(onEditC).toHaveBeenCalledWith(one)
    fireEvent.click(screen.getByRole('button', { name: /Delete contribution/ }))
    expect(onDeleteC).toHaveBeenCalledWith(one)
  })
})

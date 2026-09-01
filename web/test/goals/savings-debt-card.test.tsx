// @vitest-environment jsdom
//
// spec 059 US1 — the card that answers "when is this done?".
//
// The card this replaces put its ledger on the front: three identical rows
// ($600, $600, $600) plus an "N more" line, so the tallest element carried the
// least information and nothing stated a finish date. These tests pin the three
// things that fixes: a headline chosen by TYPE, a cadence stated once as a line
// instead of repeated as rows, and a projected finish.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { SavingsDebtCard } from '@/components/goals/SavingsDebtCard'

const NOW = new Date(2026, 7, 15) // 2026-08-15

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

const contrib = (date: string, cents: number): GoalContribution => ({
  id: date,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

/** $600 on the 1st, Feb–Aug 2026 — the handoff's worked example. */
const steady = (cents = 60_000) =>
  ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map((d) =>
    contrib(d, cents)
  )

afterEach(cleanup)

describe('SavingsDebtCard — a debt reads by what remains', () => {
  it('leads with the amount LEFT, not the amount paid', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    expect(screen.getByTestId('sd-headline')).toHaveTextContent('$13300.00 left')
  })

  it('states the type and cadence on one line, and the percentage as "paid"', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    expect(screen.getByTestId('sd-cadence')).toHaveTextContent('Debt')
    expect(screen.getByTestId('sd-cadence')).toHaveTextContent('$600.00/mo')
    expect(screen.getByTestId('sd-cadence')).toHaveTextContent('Feb 2026')
    expect(screen.getByTestId('sd-percent')).toHaveTextContent('24% paid')
  })

  it('captions the track with progress toward the target', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    const caption = screen.getByTestId('sd-track-caption')
    expect(caption).toHaveTextContent('$4200.00 paid')
    expect(caption).toHaveTextContent('$17500.00')
  })

  it('closes with a projected finish in PAYMENTS', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    const eta = screen.getByTestId('sd-eta')
    expect(eta).toHaveTextContent('Clear by')
    expect(eta).toHaveTextContent('July 2028')
    expect(eta).toHaveTextContent('23 more payments')
  })
})

describe('SavingsDebtCard — savings reads by what has accumulated', () => {
  const savings = goal({ kind: 'savings', name: 'ROG XReal Glasses', target_cents: 100_000 })
  const deposits = [contrib('2026-06-01', 10_000), contrib('2026-07-01', 10_000), contrib('2026-08-01', 10_000)]

  it('leads with the amount SAVED, not the amount remaining', () => {
    render(<SavingsDebtCard goal={savings} contributions={deposits} now={NOW} />)
    expect(screen.getByTestId('sd-headline')).toHaveTextContent('$300.00 saved')
  })

  it('states the percentage as "funded" and captions with what is left to go', () => {
    render(<SavingsDebtCard goal={savings} contributions={deposits} now={NOW} />)
    expect(screen.getByTestId('sd-percent')).toHaveTextContent('30% funded')
    expect(screen.getByTestId('sd-track-caption')).toHaveTextContent('$700.00 to go')
  })

  it('closes with a projected finish in DEPOSITS', () => {
    render(<SavingsDebtCard goal={savings} contributions={deposits} now={NOW} />)
    const eta = screen.getByTestId('sd-eta')
    expect(eta).toHaveTextContent('Funded by')
    expect(eta).toHaveTextContent('March 2027')
    expect(eta).toHaveTextContent('7 more deposits')
  })
})

describe('SavingsDebtCard — direction of travel', () => {
  it('grows a savings bar from the left', () => {
    const savings = goal({ kind: 'savings', target_cents: 100_000 })
    render(<SavingsDebtCard goal={savings} contributions={[contrib('2026-06-01', 30_000)]} now={NOW} />)
    const fill = screen.getByTestId('sd-fill-saved')
    expect(fill.style.width).toBe('30%')
    expect(fill.style.left).toBe('0px')
  })

  it('anchors a debt bar right so it depletes toward zero, with the paid share behind it', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    const remaining = screen.getByTestId('sd-fill-remaining')
    const paid = screen.getByTestId('sd-fill-paid')
    expect(remaining.style.right).toBe('0px')
    expect(remaining.style.width).toBe('76%')
    expect(paid.style.left).toBe('0px')
    expect(paid.style.width).toBe('24%')
  })

  it('uses one hue for both kinds — direction and wording carry the difference', () => {
    const { container: debt } = render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    const debtFill = debt.querySelector('[data-testid="sd-fill-remaining"]') as HTMLElement
    cleanup()
    const savings = goal({ kind: 'savings', target_cents: 100_000 })
    const { container: sav } = render(
      <SavingsDebtCard goal={savings} contributions={[contrib('2026-06-01', 30_000)]} now={NOW} />
    )
    const savFill = sav.querySelector('[data-testid="sd-fill-saved"]') as HTMLElement
    expect(debtFill.style.background).toBe(savFill.style.background)
  })

  it('keeps the progress bar accessible', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('24')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })
})

describe('SavingsDebtCard — never states what it cannot derive', () => {
  it.each([0, 1, 2])('says so plainly with %i contributions, and names no date', (n) => {
    render(<SavingsDebtCard goal={goal()} contributions={steady().slice(0, n)} now={NOW} />)
    expect(screen.getByTestId('sd-eta')).toHaveTextContent('Not enough history to project yet')
    const eta = screen.getByTestId('sd-eta').textContent ?? ''
    expect(eta).not.toMatch(/20\d\d/) // no year
    expect(eta).not.toMatch(/\d+ more/) // no payment count
  })

  it('drops the cadence line entirely when there are no contributions', () => {
    render(<SavingsDebtCard goal={goal()} contributions={[]} now={NOW} />)
    expect(screen.queryByTestId('sd-cadence')).toBeNull()
  })

  it('reads as reached rather than projecting, once the target is met', () => {
    render(<SavingsDebtCard goal={goal({ target_cents: 100_000 })} contributions={steady()} now={NOW} />)
    const eta = screen.getByTestId('sd-eta')
    expect(eta).toHaveTextContent('Reached')
    expect(eta.textContent ?? '').not.toMatch(/more (payments|deposits)/)
  })
})

describe('SavingsDebtCard — the card is a fixed height', () => {
  it('renders no contribution rows when collapsed', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} />)
    expect(screen.queryByTestId('sd-ledger')).toBeNull()
  })

  it('renders the same collapsed structure for 3 contributions and for 30', () => {
    // The old card's flaw was height that grew with contribution count. Without
    // this test it can silently come back.
    //
    // The target is deliberately far out of reach of 30 payments, so both cards
    // are in the SAME projection state — otherwise this would compare a
    // projecting card against a reached one and fail for the wrong reason.
    const big = goal({ target_cents: 10_000_000 })
    const many: GoalContribution[] = []
    for (let i = 0; i < 30; i++) {
      const month = String((i % 12) + 1).padStart(2, '0')
      const year = 2024 + Math.floor(i / 12)
      many.push({ ...contrib(`${year}-${month}-01`, 60_000), id: `m${i}` })
    }

    const { container: few } = render(
      <SavingsDebtCard goal={big} contributions={steady().slice(0, 3)} now={NOW} onToggleExpanded={() => {}} />
    )
    const fewCount = few.querySelectorAll('*').length
    cleanup()
    const { container: lots } = render(
      <SavingsDebtCard goal={big} contributions={many} now={NOW} onToggleExpanded={() => {}} />
    )
    expect(lots.querySelectorAll('*').length).toBe(fewCount)
  })

  it('states the contribution count and cadence in the disclosure instead of listing them', () => {
    render(<SavingsDebtCard goal={goal()} contributions={steady()} now={NOW} onToggleExpanded={() => {}} />)
    const disclosure = screen.getByTestId('sd-disclosure')
    expect(disclosure).toHaveTextContent('7 contributions')
    expect(disclosure).toHaveTextContent('every 1st')
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('SavingsDebtCard — long names do not push money off screen', () => {
  it('truncates the name and keeps the headline unshrunk', () => {
    const long = goal({ name: 'A very long savings target name that would otherwise widen the row indefinitely' })
    render(<SavingsDebtCard goal={long} contributions={steady()} now={NOW} />)
    expect(screen.getByTestId('sd-name').className).toContain('truncate')
    expect(screen.getByTestId('sd-name').className).toContain('min-w-0')
    expect(screen.getByTestId('sd-headline').className).toContain('shrink-0')
  })
})

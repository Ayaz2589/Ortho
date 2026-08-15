// @vitest-environment jsdom
//
// Dashboard member scope. The old design put a person `<select>` BELOW the net
// hero and rendered a separate row of personal figures beside the household
// hero, so the same four numbers appeared twice in two different shapes.
//
// Now the selector sits ABOVE the hero and re-scopes the hero itself: with
// "Everyone" the hero is the household's, with a member picked the same hero —
// net figure, spend bar, income/expenses, and the heatmap on the right — shows
// that person's share. Picking a member adds a Transfers figure, because a
// person's net includes money moved between members while a household's does not.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { Transaction, User } from '@/lib/types'

const ALICE: User = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB: User = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'sky', created_at: '' }

const state = vi.hoisted(() => ({ txns: [] as Transaction[] }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: state.txns,
    householdMembers: [ALICE, BOB],
    formatMoney: (c: number) => `$${c}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => ({
    interval: AUG,
    now: new Date(2026, 7, 4),
    periodLabel: 'This month',
  }),
}))

import { NetSummaryHero } from '@/components/dashboard/NetSummaryHero'
import { MemberScopePicker } from '@/components/dashboard/MemberScopePicker'

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: 'x', household_id: 'h', merchant: 'm', category: 'groceries', kind: 'expense',
    amount_cents: 0, source: '', date: '2026-08-10T12:00:00.000Z', created_by: 'u',
    created_at: '', updated_at: '', owner_ids: [], shares: {},
    ...over,
  }) as Transaction

// A household month: $1000 income split 60/40, a $500 expense split evenly, and
// Bob sending Alice $50.
const MONTH: Transaction[] = [
  tx({ id: 'i1', kind: 'income', amount_cents: 100000, owner_ids: ['p1', 'p2'], shares: { p1: 60000, p2: 40000 } }),
  tx({ id: 'e1', kind: 'expense', amount_cents: 50000, owner_ids: ['p1', 'p2'], shares: { p1: 25000, p2: 25000 } }),
  tx({ id: 't1', kind: 'transfer', category: 'transfer', amount_cents: 5000, paid_by: 'p2', owner_ids: ['p1'], shares: { p1: 5000 } }),
]

afterEach(() => {
  cleanup()
  state.txns = []
})

describe('MemberScopePicker', () => {
  it('defaults to Everyone and offers each household member', () => {
    render(<MemberScopePicker personId={null} onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { expanded: false })
    expect(trigger).toHaveTextContent('Everyone')

    fireEvent.click(trigger)
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true')
    expect(within(list).getByRole('option', { name: 'Alice' })).toBeTruthy()
    expect(within(list).getByRole('option', { name: 'Bob' })).toBeTruthy()
  })

  it('reports the picked member and closes', () => {
    const onChange = vi.fn()
    render(<MemberScopePicker personId={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Bob' }))

    expect(onChange).toHaveBeenCalledWith('p2')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('returns to Everyone', () => {
    const onChange = vi.fn()
    render(<MemberScopePicker personId="p2" onChange={onChange} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Bob')
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Everyone' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders nothing for a single-person household', () => {
    // Nothing to compare — the hero is already that person's.
    const { container } = render(<MemberScopePicker personId={null} onChange={vi.fn()} members={[ALICE]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NetSummaryHero scoped to Everyone', () => {
  it('shows household income, expenses and net, with no transfers figure', () => {
    state.txns = MONTH
    render(<NetSummaryHero personId={null} />)

    expect(screen.getByTestId('hero-income')).toHaveTextContent('$100000')
    expect(screen.getByTestId('hero-expenses')).toHaveTextContent('$50000')
    expect(screen.getByTestId('hero-net')).toHaveTextContent('$50000')
    // Transfers are neither income nor expense for a household — the figure is
    // meaningless at that scope and must not appear.
    expect(screen.queryByTestId('hero-transfers')).toBeNull()
    expect(screen.getByTestId('net-spend-fill').style.width).toBe('50%')
  })
})

describe('NetSummaryHero scoped to one member', () => {
  it("shows that person's income share, expense share, transfers and net", () => {
    state.txns = MONTH
    render(<NetSummaryHero personId="p1" />)

    // Alice: 60000 income share, 25000 expense share, +5000 received.
    expect(screen.getByTestId('hero-income')).toHaveTextContent('$60000')
    expect(screen.getByTestId('hero-expenses')).toHaveTextContent('$25000')
    expect(screen.getByTestId('hero-transfers')).toHaveTextContent('$5000')
    expect(screen.getByTestId('hero-net')).toHaveTextContent('$40000')
  })

  it('nets transfers sent against received', () => {
    state.txns = MONTH
    render(<NetSummaryHero personId="p2" />)

    // Bob: 40000 income share, 25000 expense share, −5000 sent.
    expect(screen.getByTestId('hero-income')).toHaveTextContent('$40000')
    expect(screen.getByTestId('hero-expenses')).toHaveTextContent('$25000')
    expect(screen.getByTestId('hero-transfers')).toHaveTextContent('$-5000')
    expect(screen.getByTestId('hero-net')).toHaveTextContent('$10000')
  })

  it('fills the spend bar from that person’s own income and spending', () => {
    state.txns = MONTH
    render(<NetSummaryHero personId="p2" />)
    // 25000 / 40000 = 62.5%
    expect(screen.getByTestId('net-spend-fill').style.width).toBe('62.5%')
  })

  it('never renders a personal shortfall in red', () => {
    state.txns = [
      tx({ id: 'e9', kind: 'expense', amount_cents: 30000, owner_ids: ['p1'], shares: { p1: 30000 } }),
    ]
    render(<NetSummaryHero personId="p1" />)
    expect(screen.getByTestId('hero-net').style.color).toBe('var(--text)')
  })

  it('a member with no activity reads as zeros, not a crash', () => {
    state.txns = [
      tx({ id: 'e8', kind: 'expense', amount_cents: 30000, owner_ids: ['p1'], shares: { p1: 30000 } }),
    ]
    render(<NetSummaryHero personId="p2" />)
    expect(screen.getByTestId('hero-income')).toHaveTextContent('$0')
    expect(screen.getByTestId('hero-expenses')).toHaveTextContent('$0')
    expect(screen.getByTestId('hero-net')).toHaveTextContent('$0')
  })
})

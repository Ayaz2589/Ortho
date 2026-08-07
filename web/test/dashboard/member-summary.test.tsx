// @vitest-environment jsdom
// spec 043 US2 — dashboard individual-member view: a person selector (default
// "Everyone") + a personal summary row (income / split-share expenses / net
// transfers / net) for the shared scope. Household hero is separate & untouched.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    household_id: 'h',
    merchant: '',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 0,
    source: '',
    date: '2026-06-15',
    created_by: 'u',
    created_at: '',
    updated_at: '',
    owner_ids: [],
    shares: {},
    ...over,
  } as Transaction
}

const h = vi.hoisted(() => ({
  transactions: [] as unknown[],
  interval: { start: new Date('2026-06-01'), end: new Date('2026-07-01') },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: h.transactions,
    householdMembers: [
      { id: 'p1', name: 'Ayaz', initial: 'A', color_key: 'sage' },
      { id: 'p2', name: 'Sam', initial: 'S', color_key: 'slate' },
    ],
    formatMoney: (c: number) => `${c < 0 ? '−' : ''}$${Math.abs(c / 100).toFixed(2)}`,
    t: (k: string, ...a: unknown[]) =>
      k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => ({ interval: h.interval }),
}))

import { MemberSummary } from '@/components/dashboard/MemberSummary'

beforeEach(() => {
  h.transactions = [
    tx({ kind: 'income', amount_cents: 3000, owner_ids: ['p1'], shares: { p1: 3000 } }),
    tx({ kind: 'expense', amount_cents: 1000, owner_ids: ['p1', 'p2'], shares: { p1: 600, p2: 400 } }),
    tx({ kind: 'transfer', amount_cents: 200, paid_by: 'p2', owner_ids: ['p1'], shares: {} }),
    // outside the June window — must be excluded:
    tx({ kind: 'income', amount_cents: 9999, owner_ids: ['p1'], shares: { p1: 9999 }, date: '2026-05-01' }),
  ]
  h.interval = { start: new Date('2026-06-01'), end: new Date('2026-07-01') }
})
afterEach(cleanup)

describe('MemberSummary', () => {
  it('defaults to Everyone with no personal summary row', () => {
    render(<MemberSummary />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('') // Everyone
    expect(screen.queryByTestId('member-net')).toBeNull()
  })

  it('lists the active household members', () => {
    render(<MemberSummary />)
    expect(screen.getByRole('option', { name: 'Everyone' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ayaz' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sam' })).toBeInTheDocument()
  })

  it('shows the selected member income / split-share expenses / net transfers / net', async () => {
    render(<MemberSummary />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p1')
    // income 3000 (May 9999 excluded), expenses = p1 share 600, transfers +200, net 2600
    expect(screen.getByTestId('member-income')).toHaveTextContent('$30.00')
    expect(screen.getByTestId('member-expenses')).toHaveTextContent('$6.00')
    expect(screen.getByTestId('member-transfers')).toHaveTextContent('$2.00')
    expect(screen.getByTestId('member-net')).toHaveTextContent('$26.00')
  })

  it('counts only the member split share of a shared expense', async () => {
    render(<MemberSummary />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p2')
    // p2: no income, expense share 400, sent the 200 transfer → net = −400 − 200 = −600
    expect(screen.getByTestId('member-expenses')).toHaveTextContent('$4.00')
    expect(screen.getByTestId('member-transfers')).toHaveTextContent('−$2.00')
    expect(screen.getByTestId('member-net')).toHaveTextContent('−$6.00')
  })

  it('renders a negative net without red (calm)', async () => {
    render(<MemberSummary />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p2')
    const net = screen.getByTestId('member-net')
    // never red: neutral text token for a shortfall, positive token otherwise
    expect(net.style.color).toBe('var(--text)')
  })

  it('hides the personal row when switched back to Everyone', async () => {
    render(<MemberSummary />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p1')
    expect(screen.getByTestId('member-net')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox'), '')
    expect(screen.queryByTestId('member-net')).toBeNull()
  })
})

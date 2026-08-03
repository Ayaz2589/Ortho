// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NetSummaryBody } from '@/components/widgets/bodies/NetSummaryBody'

// Widget 1 (net-summary): income − expenses over the shared scope window, read
// PROPLESS from useApp() + useDashboardScopeContext(). Transfers are excluded
// (member-to-member reimbursement, neither income nor expense). A day-of-month
// pace note appears only when the window is the current calendar month.

const h = vi.hoisted(() => ({
  txns: [] as Array<{ id: string; kind: string; amount_cents: number; date: string }>,
  scope: {} as { interval: { start: Date; end: Date }; now: Date },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    transactions: h.txns,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }

beforeEach(() => {
  h.txns = [
    { id: 'i1', kind: 'income', amount_cents: 500000, date: '2026-08-05T12:00:00.000Z' },
    { id: 'e1', kind: 'expense', amount_cents: 200000, date: '2026-08-10T12:00:00.000Z' },
    // Outside the window (July) — excluded.
    { id: 'e0', kind: 'expense', amount_cents: 999999, date: '2026-07-15T12:00:00.000Z' },
    // Transfer inside the window — excluded from both income and expense.
    { id: 'x1', kind: 'transfer', amount_cents: 111111, date: '2026-08-12T12:00:00.000Z' },
  ]
  h.scope = { interval: AUG, now: new Date(2026, 7, 20) }
})
afterEach(cleanup)

describe('NetSummaryBody', () => {
  it('shows income, expenses, and net over the window (transfers + out-of-window excluded)', () => {
    render(<NetSummaryBody />)
    expect(screen.getByText('$500000')).toBeTruthy() // income
    expect(screen.getByText('$200000')).toBeTruthy() // expenses
    expect(screen.getByText('$300000')).toBeTruthy() // net = 500000 − 200000
    expect(screen.getByText('Income')).toBeTruthy()
    expect(screen.getByText('Expenses')).toBeTruthy()
    expect(screen.getByText('Net')).toBeTruthy()
    // The excluded rows never leak in.
    expect(screen.queryByText('$999999')).toBeNull()
    expect(screen.queryByText('$111111')).toBeNull()
  })

  it('shows a "Day X of Y" pace note for the current calendar month', () => {
    render(<NetSummaryBody />)
    // now = Aug 20 2026; August has 31 days.
    expect(screen.getByText('Day 20 of 31')).toBeTruthy()
  })

  it('omits the pace note for a multi-month window', () => {
    h.scope = { interval: { start: new Date(2026, 2, 1), end: new Date(2026, 8, 1) }, now: new Date(2026, 7, 20) }
    render(<NetSummaryBody />)
    expect(screen.queryByText(/Day \d+ of/)).toBeNull()
  })

  it('omits the pace note for a single month that is not the current month', () => {
    h.scope = { interval: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) }, now: new Date(2026, 7, 20) }
    render(<NetSummaryBody />)
    expect(screen.queryByText(/Day \d+ of/)).toBeNull()
  })

  it('renders a calm zero state with no transactions in the window', () => {
    h.txns = []
    render(<NetSummaryBody />)
    // net / income / expenses all zero.
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1)
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<NetSummaryBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

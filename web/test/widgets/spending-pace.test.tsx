// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SpendingPaceBody } from '@/components/widgets/bodies/SpendingPaceBody'

// Widget 2 (spending-pace): trailing 30 vs prior 30 days of EXPENSES, anchored at
// the end of the scope window (clamped to now). Avg/day + delta vs the prior 30.
// The recharts area lives behind next/dynamic so it never renders in this suite;
// we assert the numeric readouts and the empty state.

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

beforeEach(() => {
  // Anchor at Aug 30 2026; recent 30 = ~Aug, prior 30 = ~Jul.
  h.scope = { interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }, now: new Date(2026, 7, 30, 12) }
  h.txns = [
    // recent 30: 3 × 100000 = 300000 → avg/day 10000
    { id: 'r1', kind: 'expense', amount_cents: 100000, date: '2026-08-05T12:00:00.000Z' },
    { id: 'r2', kind: 'expense', amount_cents: 100000, date: '2026-08-15T12:00:00.000Z' },
    { id: 'r3', kind: 'expense', amount_cents: 100000, date: '2026-08-25T12:00:00.000Z' },
    // prior 30: 2 × 100000 = 200000 → delta +50%
    { id: 'p1', kind: 'expense', amount_cents: 100000, date: '2026-07-10T12:00:00.000Z' },
    { id: 'p2', kind: 'expense', amount_cents: 100000, date: '2026-07-20T12:00:00.000Z' },
    // income in-window is ignored (expenses only)
    { id: 'i1', kind: 'income', amount_cents: 900000, date: '2026-08-12T12:00:00.000Z' },
  ]
})
afterEach(cleanup)

describe('SpendingPaceBody', () => {
  it('shows average per day and the delta vs the prior 30 days', () => {
    render(<SpendingPaceBody />)
    expect(screen.getByText('Avg / day')).toBeTruthy()
    expect(screen.getByText('$10000')).toBeTruthy() // 300000 / 30
    expect(screen.getByText('vs. prior 30')).toBeTruthy()
    expect(screen.getByText('+50%')).toBeTruthy() // (300000 − 200000) / 200000
    expect(screen.getByText('Last 30 days')).toBeTruthy()
  })

  it('renders a calm empty state when there are no expenses in the last 30 days', () => {
    h.txns = [{ id: 'p1', kind: 'expense', amount_cents: 100000, date: '2026-07-10T12:00:00.000Z' }]
    render(<SpendingPaceBody />)
    expect(screen.getByText('No expenses in the last 30 days.')).toBeTruthy()
    expect(screen.queryByText('Avg / day')).toBeNull()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<SpendingPaceBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

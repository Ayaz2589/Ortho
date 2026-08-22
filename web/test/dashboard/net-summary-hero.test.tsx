// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NetSummaryHero } from '@/components/dashboard/NetSummaryHero'

// Dashboard polish: the hero's proportion bar should FILL as spending consumes
// income (expenses ÷ income), so it reads as "how much of this period's income is
// gone" — clamped at 100% and NEVER drawn red (money-first system).

const state = vi.hoisted(() => ({ txns: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: state.txns,
    formatMoney: (c: number) => `$${c}`,
    t: (k: string) => k,
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
// Keep the suite on the hero — the heatmap has its own suite.
vi.mock('@/components/dashboard/SpendHeatmap', () => ({ SpendHeatmap: () => <div /> }))

afterEach(() => {
  cleanup()
  state.txns = []
})

const tx = (kind: string, cents: number) => ({
  id: `${kind}-${cents}`,
  kind,
  amount_cents: cents,
  date: '2026-08-10T12:00:00.000Z',
})

describe('NetSummaryHero spend bar', () => {
  it('fills to the share of income spent (expenses ÷ income)', () => {
    state.txns = [tx('income', 100000), tx('expense', 25000)]
    render(<NetSummaryHero />)
    expect(screen.getByTestId('net-spend-fill').style.width).toBe('25%')
  })

  it('clamps at 100% when spending exceeds income', () => {
    state.txns = [tx('income', 100000), tx('expense', 250000)]
    render(<NetSummaryHero />)
    expect(screen.getByTestId('net-spend-fill').style.width).toBe('100%')
  })

  it('never renders a negative net in red (loss stays neutral)', () => {
    state.txns = [tx('income', 100000), tx('expense', 250000)]
    render(<NetSummaryHero />)
    const net = screen.getByText('$-150000')
    expect(net.style.color).toBe('var(--text)')
  })
})

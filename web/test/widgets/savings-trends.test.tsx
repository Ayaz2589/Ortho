// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SavingsTrendsBody } from '@/components/widgets/bodies/SavingsTrendsBody'

// Savings-trends widget (spec 036 follow-up, replaces Reports mode): per-month
// savings rate over the scope window, computed LOCALLY from transactions, with the
// window's overall rate as the headline. The recharts bar series is behind
// next/dynamic and does not render here; we assert the headline + states.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scope: {} as {
    interval: { start: Date; end: Date }
    isSpecificMonth?: boolean
    selectedMonth?: string | null
    availableMonths?: string[]
  },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    locale: 'en-US',
    transactions: h.txns,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

beforeEach(() => {
  // Jun–Aug 2026 window.
  h.scope = { interval: { start: new Date(2026, 5, 1), end: new Date(2026, 8, 1) } }
  h.txns = [
    { id: 'j-i', kind: 'income', amount_cents: 100000, date: '2026-06-15T12:00:00.000Z' },
    { id: 'j-e', kind: 'expense', amount_cents: 60000, date: '2026-06-15T12:00:00.000Z' },
    { id: 'l-i', kind: 'income', amount_cents: 100000, date: '2026-07-15T12:00:00.000Z' },
    { id: 'l-e', kind: 'expense', amount_cents: 80000, date: '2026-07-15T12:00:00.000Z' },
    { id: 'a-i', kind: 'income', amount_cents: 100000, date: '2026-08-15T12:00:00.000Z' },
    { id: 'a-e', kind: 'expense', amount_cents: 50000, date: '2026-08-15T12:00:00.000Z' },
    // Out of window — excluded.
    { id: 'x', kind: 'income', amount_cents: 999999, date: '2026-01-10T12:00:00.000Z' },
  ]
})
afterEach(cleanup)

describe('SavingsTrendsBody', () => {
  it('shows the window overall savings rate as the headline', () => {
    render(<SavingsTrendsBody />)
    // income 300000, expense 190000 → (300000−190000)/300000 = 36.67% → 37%.
    expect(screen.getByText('Savings rate')).toBeTruthy()
    expect(screen.getByText('37%')).toBeTruthy()
  })

  it('renders a calm empty state when the window has no activity', () => {
    h.txns = []
    render(<SavingsTrendsBody />)
    expect(screen.getByText('Not enough data yet.')).toBeTruthy()
  })

  it('shows "—" when there is spend but no income in the window', () => {
    h.txns = [{ id: 'e', kind: 'expense', amount_cents: 50000, date: '2026-07-15T12:00:00.000Z' }]
    render(<SavingsTrendsBody />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<SavingsTrendsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })

  it('does NOT show a last-month comparison in a multi-month range view', () => {
    render(<SavingsTrendsBody />) // beforeEach scope has no isSpecificMonth
    expect(screen.queryByTestId('savings-comparison')).toBeNull()
  })

  describe('single-month last-month comparison (spec 043 US3)', () => {
    beforeEach(() => {
      h.scope = {
        interval: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) }, // June only
        isSpecificMonth: true,
        selectedMonth: '2026-06',
        availableMonths: ['2026-06', '2026-05'],
      }
      h.txns = [
        // June: (100000−60000)/100000 = 40%
        { id: 'jn-i', kind: 'income', amount_cents: 100000, date: '2026-06-15T12:00:00.000Z' },
        { id: 'jn-e', kind: 'expense', amount_cents: 60000, date: '2026-06-15T12:00:00.000Z' },
        // May: (100000−50000)/100000 = 50%
        { id: 'my-i', kind: 'income', amount_cents: 100000, date: '2026-05-15T12:00:00.000Z' },
        { id: 'my-e', kind: 'expense', amount_cents: 50000, date: '2026-05-15T12:00:00.000Z' },
      ]
    })

    it('shows the selected month rate AND last month as a comparison', () => {
      render(<SavingsTrendsBody />)
      expect(screen.getByText('40%')).toBeTruthy() // June headline
      const cmp = screen.getByTestId('savings-comparison')
      expect(cmp).toHaveTextContent('Last month')
      expect(cmp).toHaveTextContent('50%') // May
    })

    it('shows a calm no-comparison indication at the earliest month', () => {
      h.scope.availableMonths = ['2026-06'] // no prior month with data
      render(<SavingsTrendsBody />)
      expect(screen.getByTestId('savings-comparison')).toHaveTextContent('No comparison yet')
    })
  })
})

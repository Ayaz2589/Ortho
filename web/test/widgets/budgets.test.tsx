// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BudgetsBody } from '@/components/widgets/bodies/BudgetsBody'

// Widget 3 (budgets): rollover-aware spend vs effective limit per budget, via
// budgetStatusForMonth(budget, txns, referenceDate). Rows sort by fraction desc;
// remaining reads "{0} left" / "{0} over"; the bar fills to the spent fraction and
// turns to the sand accent (never red) near/over the limit.

const h = vi.hoisted(() => ({
  budgets: [] as unknown[],
  txns: [] as unknown[],
  scope: {} as { referenceDate: Date },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    budgets: h.budgets,
    transactions: h.txns,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

beforeEach(() => {
  h.scope = { referenceDate: new Date(2026, 7, 15, 12) }
  h.budgets = [
    { id: 'b1', category: 'groceries', monthly_limit_cents: 50000, budget_type: 'fixed', rollover_cap_cents: null, created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'b2', category: 'dining', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, created_at: '2026-08-01T00:00:00.000Z' },
    // A zero-limit budget is skipped entirely.
    { id: 'b3', category: 'fuel', monthly_limit_cents: 0, budget_type: 'fixed', rollover_cap_cents: null, created_at: '2026-08-01T00:00:00.000Z' },
  ]
  h.txns = [
    { id: 't1', kind: 'expense', category: 'groceries', amount_cents: 30000, date: '2026-08-10T12:00:00.000Z' },
    { id: 't2', kind: 'expense', category: 'dining', amount_cents: 15000, date: '2026-08-12T12:00:00.000Z' },
  ]
})
afterEach(cleanup)

describe('BudgetsBody', () => {
  it('renders one row per positive-limit budget, sorted by fraction descending', () => {
    render(<BudgetsBody />)
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('Dining')).toBeTruthy()
    // Zero-limit budget is excluded.
    expect(screen.queryByText('Fuel')).toBeNull()
    // Dining (1.5) sorts before Groceries (0.6).
    const bars = screen.getAllByTestId('budget-bar-fill')
    expect(bars[0].style.width).toBe('100%') // dining, clamped
    expect(bars[1].style.width).toBe('60%') // groceries 30000/50000
  })

  it('labels remaining left vs over', () => {
    render(<BudgetsBody />)
    expect(screen.getByText('$20000 left')).toBeTruthy() // groceries 50000 − 30000
    expect(screen.getByText('$5000 over')).toBeTruthy() // dining 15000 − 10000
  })

  it('renders a calm empty state when there are no budgets', () => {
    h.budgets = []
    render(<BudgetsBody />)
    expect(screen.getByText('No budgets yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<BudgetsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })

  // spec 054 FR-006 — the widget board is deliberately household-wide (spec 034/043:
  // "a widget never silently changes meaning under a control it doesn't show"), so a
  // personal envelope must not appear here or be summed into a household figure.
  it('ignores personal budgets', () => {
    h.budgets = [
      { id: 'b1', category: 'groceries', monthly_limit_cents: 50000, budget_type: 'fixed', rollover_cap_cents: null, person_id: null, created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'b2', category: 'dining', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: 'p-a', created_at: '2026-08-01T00:00:00.000Z' },
    ]
    render(<BudgetsBody />)
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.queryByText('Dining')).toBeNull()
  })

  it('shows the empty state when every budget is personal', () => {
    h.budgets = [
      { id: 'b2', category: 'dining', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: 'p-a', created_at: '2026-08-01T00:00:00.000Z' },
    ]
    render(<BudgetsBody />)
    expect(screen.getByText('No budgets yet.')).toBeTruthy()
  })
})

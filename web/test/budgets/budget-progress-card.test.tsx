// @vitest-environment jsdom
// Spec 027 US2: the dashboard budget card is rollover-aware — per bucket it shows
// remaining against the EFFECTIVE (carry-inclusive) limit and a "rolled over"
// caption. Overspend shows an "over" figure (never red). No budgets ⇒ hidden.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Budget, Transaction } from '@/lib/types'
import type { Interval } from '@/components/dashboard/range'

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`
const tr = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k

let mockBudgets: Budget[] = []
let mockTxns: Transaction[] = []

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    budgets: mockBudgets,
    transactions: mockTxns,
    formatMoney: fmt,
    t: tr,
  }),
}))

import { BudgetProgressCard } from '@/components/dashboard/BudgetProgressCard'

function expense(category: string, ym: string, cents: number): Transaction {
  return {
    id: `${category}-${ym}-${cents}`,
    household_id: 'hh',
    merchant: 'M',
    category: category as Transaction['category'],
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date: `${ym}-15T12:00:00.000Z`,
    created_by: 'u',
    created_at: `${ym}-15T12:00:00.000Z`,
    updated_at: `${ym}-15T12:00:00.000Z`,
    owner_ids: [],
    shares: {},
  }
}
const flex = (over: Partial<Budget>): Budget => ({
  id: 'b-groceries',
  household_id: 'hh',
  category: 'groceries',
  monthly_limit_cents: 60000,
  budget_type: 'flex',
  rollover_cap_cents: null,
  created_at: '2026-01-15T12:00:00.000Z',
  ...over,
})
// Local-calendar month interval (matches how the dashboard builds ranges).
const monthInterval = (y: number, m: number): Interval => ({
  start: new Date(y, m - 1, 1),
  end: new Date(y, m, 1),
})

afterEach(() => {
  cleanup()
  mockBudgets = []
  mockTxns = []
})

describe('BudgetProgressCard — rollover-aware', () => {
  it('shows remaining against the effective limit and a rolled-over caption', () => {
    mockBudgets = [flex({})]
    mockTxns = [expense('groceries', '2026-01', 50000)] // $100 surplus carried into Feb
    render(<BudgetProgressCard interval={monthInterval(2026, 2)} label="February" />)

    // effective limit = $700, spent $0 → $700 remaining
    expect(screen.getByText(/\$700\.00 left/)).toBeTruthy()
    // carried surplus surfaced
    expect(screen.getByText(/\$100\.00 rolled over/)).toBeTruthy()
  })

  it('shows an over figure (not red) and a full bar when overspent', () => {
    mockBudgets = [flex({ created_at: '2026-06-15T12:00:00.000Z' })]
    mockTxns = [expense('groceries', '2026-06', 75000)] // base $600, spent $750
    const { container } = render(<BudgetProgressCard interval={monthInterval(2026, 6)} />)

    expect(screen.getByText(/\$150\.00 over/)).toBeTruthy()
    // the fill bar is clamped to 100% width and uses the sand accent, never red
    const fill = container.querySelector('[data-testid="budget-bar-fill"]') as HTMLElement
    expect(fill).toBeTruthy()
    expect(fill.style.width).toBe('100%')
    expect(fill.style.background).toContain('--accent')
  })

  it('renders nothing when no budgets have a positive limit', () => {
    mockBudgets = []
    const { container } = render(<BudgetProgressCard interval={monthInterval(2026, 6)} />)
    expect(container.firstChild).toBeNull()
  })
})

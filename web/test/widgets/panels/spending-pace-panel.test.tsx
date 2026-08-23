// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SpendingPacePanel } from '@/components/widgets/panels/SpendingPacePanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Budget, Transaction } from '@/lib/types'

// Spec 057 US4 redesign: the old panel was a single unbounded scrolling column
// (a bar-cluster chart, then two lists naming largely the same categories
// twice). This replaces it with three fixed-height zones — verdict → one
// honest chart → one bounded (top-5 + drill-in) list — so panel height stays
// constant regardless of history or category count. "Period" is the active
// scope's own interval (a calendar month under the default range); "last
// period" the immediately preceding window of equal length.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  budgets: [] as unknown[],
  scopeState: {
    interval: { start: new Date(), end: new Date() },
    now: new Date(),
    periodLabel: '',
    referenceDate: new Date(),
  },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) => {
      const sign = c < 0 ? '−' : opts?.leadingPlus && c > 0 ? '+' : ''
      return `${sign}$${(Math.abs(c) / 100).toFixed(2)}`
    },
    locale: 'en-US',
    transactions: h.txns,
    budgets: h.budgets,
    resolveUser: (id: string) => ({
      id,
      name: id === 'alice' ? 'Alice' : id,
      initial: 'A',
      color_key: 'sand',
      created_at: '',
    }),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

let txSeq = 0
function expense(category: string, dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant: `Merchant ${txSeq}`,
    category: category as Transaction['category'],
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date: dateIso,
    created_by: 'u',
    created_at: dateIso,
    updated_at: dateIso,
    owner_ids: [],
    shares: {},
    ...extra,
  }
}

function budget(category: string, monthlyLimitCents: number, extra: Partial<Budget> = {}): Budget {
  return {
    id: `b-${category}`,
    household_id: 'hh',
    category: category as Budget['category'],
    monthly_limit_cents: monthlyLimitCents,
    budget_type: 'fixed',
    rollover_cap_cents: null,
    person_id: null,
    ...extra,
  }
}

function renderPanel(scope: MoneyScope = HOUSEHOLD_SCOPE) {
  return render(
    <MoneyScopeProvider scope={scope}>
      <WidgetPanel open title="Spending pace" onClose={() => {}}>
        <SpendingPacePanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

// August 2026 (31 days); "today" is day 23.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 23, 12))
  h.scopeState = {
    interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
    now: new Date(2026, 7, 23, 12),
    periodLabel: 'August 2026',
    referenceDate: new Date(2026, 7, 23, 12),
  }
  h.txns = []
  h.budgets = []
  txSeq = 0
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('SpendingPacePanel', () => {
  it('shows a calm empty state when there is no spending in the active period', () => {
    h.txns = [expense('groceries', '2026-07-05T12:00:00.000Z', 20000)] // prior period only
    renderPanel()
    expect(screen.getByText('No expenses in this period yet.')).toBeTruthy()
  })

  it('states a verdict, a projection, and last-period comparison when history exists', () => {
    h.txns = [
      expense('rent', '2026-07-15T12:00:00.000Z', 31000), // prior period: $310, 31 days
      expense('rent', '2026-08-05T12:00:00.000Z', 46000), // current: $460 over 23 elapsed days -> faster pace
    ]
    renderPanel()
    expect(screen.getByText(/Spending \$20\.00\/day/)).toBeTruthy()
    expect(screen.getByText(/faster than last period/)).toBeTruthy()
    expect(screen.getByText(/On pace for/)).toBeTruthy()
  })

  it('an increase reads no more alarmingly than a decrease — neither is ever red (FR-021)', () => {
    h.txns = [
      expense('rent', '2026-07-15T12:00:00.000Z', 31000),
      expense('rent', '2026-08-05T12:00:00.000Z', 46000), // faster
    ]
    const faster = renderPanel()
    const fasterVerdict = screen.getByText(/faster than last period/)
    expect(fasterVerdict.getAttribute('style')).toContain('--text-2')
    expect(fasterVerdict.getAttribute('style')).not.toMatch(/red/i)
    faster.unmount()

    h.txns = [
      expense('rent', '2026-07-15T12:00:00.000Z', 31000),
      expense('rent', '2026-08-05T12:00:00.000Z', 11500), // slower
    ]
    renderPanel()
    const slowerVerdict = screen.getByText(/slower than last period/)
    expect(slowerVerdict.getAttribute('style')).toContain('--positive')
    expect(slowerVerdict.getAttribute('style')).not.toMatch(/red/i)
  })

  it('drops the comparative clause and the reference line when there is no prior period', () => {
    h.txns = [expense('groceries', '2026-08-05T12:00:00.000Z', 20000)]
    renderPanel()
    expect(screen.getByText(/^Spending \$8\.70\/day\.$/)).toBeTruthy()
    expect(screen.queryByText(/· last period/)).toBeNull()
    expect(screen.queryByText('Last period')).toBeNull()
  })

  it('bounds the category list to the top 5 with a "+N more" drill-in for the rest', () => {
    h.txns = [
      expense('rent', '2026-08-01T12:00:00.000Z', 50000),
      expense('groceries', '2026-08-02T12:00:00.000Z', 40000),
      expense('dining', '2026-08-03T12:00:00.000Z', 30000),
      expense('coffee', '2026-08-04T12:00:00.000Z', 20000),
      expense('transit', '2026-08-05T12:00:00.000Z', 10000),
      expense('fuel', '2026-08-06T12:00:00.000Z', 5000),
      expense('gaming', '2026-08-07T12:00:00.000Z', 4000),
    ]
    renderPanel()
    expect(screen.getByText("Where it's going")).toBeTruthy()
    expect(screen.getByText('Transit')).toBeTruthy() // 5th largest — still shown
    expect(screen.queryByText('Fuel')).toBeNull() // 6th — excluded from the bounded list
    expect(screen.queryByText('Gaming')).toBeNull() // 7th — excluded from the bounded list
    expect(screen.getByText('+ 2 more →')).toBeTruthy()
  })

  it('never shows a "+N more" link when there are 5 or fewer categories', () => {
    h.txns = [expense('rent', '2026-08-01T12:00:00.000Z', 50000)]
    renderPanel()
    expect(screen.queryByText(/more →/)).toBeNull()
  })

  it("opens the full category list and drills into a category's transactions", () => {
    h.txns = [
      expense('rent', '2026-08-01T12:00:00.000Z', 50000),
      expense('groceries', '2026-08-02T12:00:00.000Z', 40000),
      expense('dining', '2026-08-03T12:00:00.000Z', 30000),
      expense('coffee', '2026-08-04T12:00:00.000Z', 20000),
      expense('transit', '2026-08-05T12:00:00.000Z', 10000),
      expense('fuel', '2026-08-06T12:00:00.000Z', 5000, { merchant: 'Shell' }),
    ]
    renderPanel()
    fireEvent.click(screen.getByText('+ 1 more →'))
    expect(screen.getByRole('heading', { name: 'All categories' })).toBeTruthy()
    expect(screen.getByText('Fuel')).toBeTruthy()

    fireEvent.click(screen.getByText('Fuel'))
    expect(screen.getByText('Shell')).toBeTruthy()
    expect(screen.getByText('$50.00')).toBeTruthy()
  })

  it('shows a budget-aware verdict when a scoped budget exists, instead of the last-period comparison', () => {
    h.budgets = [budget('rent', 500000)] // $5000/mo fixed budget
    h.txns = [
      expense('rent', '2026-07-15T12:00:00.000Z', 31000),
      expense('rent', '2026-08-05T12:00:00.000Z', 460000),
    ]
    renderPanel()
    expect(screen.getByText(/against a \$5000\.00 budget/)).toBeTruthy()
    expect(screen.queryByText(/· last period/)).toBeNull()
    expect(screen.queryByText('Last period')).toBeNull()
  })

  it('states the subject and period in the caption', () => {
    h.txns = [expense('groceries', '2026-08-05T12:00:00.000Z', 20000)]
    renderPanel()
    const caption = screen.getByTestId('panel-caption')
    expect(caption.textContent).toContain('Household')
    expect(caption.textContent).toContain('August 2026')
  })

  it('narrows to the selected person under person scope', () => {
    h.txns = [
      expense('groceries', '2026-08-05T12:00:00.000Z', 20000, { owner_ids: ['alice'], shares: {} }),
      expense('dining', '2026-08-10T12:00:00.000Z', 50000, { owner_ids: ['bob'], shares: {} }),
    ]
    renderPanel(personScope('alice'))
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0)
    expect(screen.queryByText('Dining')).toBeNull()
  })
})

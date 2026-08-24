// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BudgetsPanel } from '@/components/widgets/panels/BudgetsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import { monthElapsedFraction, currentMonthKey } from '@/lib/planning/planSummary'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction, Budget } from '@/lib/types'

// Spec 057 US3 (budgets — the second reference panel): composes the
// transactions behind "spent X of Y", recovers the rollover history D8
// extracted (budgetLedgerForMonth), projects the month-end pace honestly, and
// — under person scope — names a category with no personal limit instead of
// silently dropping it, borrowing nothing from the household (spec 054 FR-011).

const h = vi.hoisted(() => ({
  budgets: [] as unknown[],
  txns: [] as unknown[],
  scopeState: { referenceDate: new Date(), periodLabel: '' },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    budgets: h.budgets,
    transactions: h.txns,
    resolveUser: (id: string) => ({ id, name: id === 'alice' ? 'Alice' : id, initial: 'A', color_key: 'sand', created_at: '' }),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

const REFERENCE = new Date(2026, 2, 15, 12) // March 15, 2026 — mid-month

function budget(over: Partial<Budget> & { budget_type: Budget['budget_type'] }): Budget {
  return {
    id: 'b1',
    household_id: 'hh',
    category: 'groceries',
    monthly_limit_cents: 60000,
    rollover_cap_cents: null,
    person_id: null,
    created_at: '2026-01-15T12:00:00.000Z',
    ...over,
  }
}

let txSeq = 0
function expense(
  category: string,
  dateIso: string,
  cents: number,
  extra: Partial<Transaction> = {}
): Transaction {
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

function renderPanel(scope: MoneyScope = HOUSEHOLD_SCOPE) {
  return render(
    <MoneyScopeProvider scope={scope}>
      <WidgetPanel open title="Budgets" onClose={() => {}}>
        <BudgetsPanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(REFERENCE)
  h.scopeState = { referenceDate: REFERENCE, periodLabel: 'March 2026' }
  h.budgets = []
  h.txns = []
  txSeq = 0
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('BudgetsPanel', () => {
  it("lists the transactions composing a budget's spend", () => {
    h.budgets = [budget({ id: 'b1', budget_type: 'fixed', created_at: '2026-03-01T12:00:00.000Z' })]
    h.txns = [
      expense('groceries', '2026-03-05T12:00:00.000Z', 12000),
      expense('groceries', '2026-03-10T12:00:00.000Z', 8000),
    ]
    renderPanel()
    expect(screen.getByText('$120.00')).toBeTruthy()
    expect(screen.getByText('$80.00')).toBeTruthy()
  })

  it('shows how a carried balance accumulated over recent months, not just this month', () => {
    h.budgets = [budget({ id: 'b1', budget_type: 'flex', created_at: '2026-01-15T12:00:00.000Z' })]
    h.txns = [
      expense('groceries', '2026-01-10T12:00:00.000Z', 50000), // surplus 10000
      expense('groceries', '2026-02-10T12:00:00.000Z', 40000), // surplus 20000 → carry 30000
      expense('groceries', '2026-03-10T12:00:00.000Z', 30000),
    ]
    renderPanel()
    // February's own carry-in (10000c, from January's surplus) is visible —
    // history, not only the reference month's headline figure.
    expect(screen.getByText('$100.00 rolled over')).toBeTruthy()
  })

  it('shows a calm prompt, not an empty frame, when the household has no budgets', () => {
    h.budgets = []
    renderPanel()
    expect(screen.getByText('No budgets yet.')).toBeTruthy()
  })

  it('words the month-end projection as a projection, never as settled fact', () => {
    h.budgets = [budget({ id: 'b1', budget_type: 'fixed', created_at: '2026-03-01T12:00:00.000Z' })]
    h.txns = [expense('groceries', '2026-03-05T12:00:00.000Z', 30000)]
    renderPanel()

    const elapsed = monthElapsedFraction(currentMonthKey(REFERENCE), REFERENCE)
    const projectedCents = Math.round(30000 / elapsed)
    const projectedLabel = `$${(projectedCents / 100).toFixed(2)}`
    const projection = screen.getByText(`Projected to reach ${projectedLabel} by month end at the current pace.`)
    expect(projection.textContent).toMatch(/projected/i)
  })

  it('names a category with no personal limit under person scope, borrowing nothing from the household', () => {
    // Only a HOUSEHOLD groceries budget exists — Alice has no budget of her own.
    h.budgets = [budget({ id: 'b1', budget_type: 'fixed', person_id: null, created_at: '2026-03-01T12:00:00.000Z' })]
    h.txns = [expense('dining', '2026-03-05T12:00:00.000Z', 4000, { owner_ids: ['alice'], shares: {} })]
    renderPanel(personScope('alice'))

    expect(screen.getByText('Dining')).toBeTruthy()
    expect(screen.getByText(/no personal limit/i)).toBeTruthy()
    expect(screen.getByText('$40.00')).toBeTruthy()
    // The household's groceries limit must never be borrowed for a category
    // Alice has no budget for — no "of $600.00" (household limit) anywhere.
    expect(screen.queryByText('$600.00')).toBeNull()
  })

  // Review 2026-08-24 (D5/FR-014): every figure in this panel is a single
  // month (currentMonthKey(referenceDate)) — under a relative range the
  // caption used to claim "Last 3 months" while showing one month's numbers.
  // The caption must state only what the panel actually honours.
  it('under a relative range, the caption states the month actually computed', () => {
    h.scopeState = { referenceDate: REFERENCE, periodLabel: 'Last 3 months' }
    renderPanel()
    const caption = screen.getByTestId('panel-caption')
    expect(caption.textContent).toContain('March 2026')
    expect(caption.textContent).not.toContain('Last 3 months')
  })
})

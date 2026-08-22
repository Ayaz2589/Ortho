// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SpendingPacePanel } from '@/components/widgets/panels/SpendingPacePanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US4 (spending pace): the card shows one ±% against the prior 30
// days; that single number hides a dozen category movements. The panel
// breaks the trailing window down by category (ranked by amount), surfaces
// the biggest movers in both directions with an increase reading no more
// alarmingly than a decrease (FR-021), and shows the full 60-day series the
// card's chart already computes but only half-displays.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scopeState: { interval: { start: new Date(), end: new Date() }, now: new Date(), periodLabel: '' },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) => {
      const sign = c < 0 ? '−' : opts?.leadingPlus && c > 0 ? '+' : ''
      return `${sign}$${(Math.abs(c) / 100).toFixed(2)}`
    },
    transactions: h.txns,
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

function renderPanel(scope: MoneyScope = HOUSEHOLD_SCOPE) {
  return render(
    <MoneyScopeProvider scope={scope}>
      <WidgetPanel open title="Spending pace" onClose={() => {}}>
        <SpendingPacePanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 30, 12))
  // Anchor at Aug 30 2026 — mirrors SpendingPaceBody's own test fixture:
  // recent 30 ≈ Aug 1-30, prior 30 ≈ Jul 2-31.
  h.scopeState = {
    interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
    now: new Date(2026, 7, 30, 12),
    periodLabel: 'August 2026',
  }
  h.txns = []
  txSeq = 0
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('SpendingPacePanel', () => {
  it('breaks the trailing window down by category, ranked by amount', () => {
    h.txns = [
      expense('groceries', '2026-08-05T12:00:00.000Z', 20000),
      expense('dining', '2026-08-10T12:00:00.000Z', 50000),
      expense('coffee', '2026-08-15T12:00:00.000Z', 5000),
    ]
    renderPanel()
    expect(screen.getByText('Where it went')).toBeTruthy()
    expect(screen.getByText('$500.00')).toBeTruthy()
    expect(screen.getByText('$200.00')).toBeTruthy()
    expect(screen.getByText('$50.00')).toBeTruthy()
    // Ranked descending: Dining (largest) precedes Coffee (smallest) in the DOM.
    const rows = screen.getAllByText(/^(Dining|Groceries|Coffee)$/)
    const diningIdx = rows.findIndex((r) => r.textContent === 'Dining')
    const coffeeIdx = rows.findIndex((r) => r.textContent === 'Coffee')
    expect(diningIdx).toBeLessThan(coffeeIdx)
  })

  it('surfaces the biggest movers in both directions, an increase reading no more alarmingly than a decrease', () => {
    h.txns = [
      // groceries: prior 20000 -> recent 50000, up +30000
      expense('groceries', '2026-07-05T12:00:00.000Z', 20000),
      expense('groceries', '2026-08-05T12:00:00.000Z', 50000),
      // dining: prior 40000 -> recent 10000, down -30000
      expense('dining', '2026-07-10T12:00:00.000Z', 40000),
      expense('dining', '2026-08-10T12:00:00.000Z', 10000),
    ]
    renderPanel()
    expect(screen.getByText('Biggest movers')).toBeTruthy()

    const increaseValue = screen.getByText('+$300.00')
    const decreaseValue = screen.getByText('−$300.00')
    // Neither reads as an alarm colour — no red anywhere — and the increase
    // reads no more alarmingly than the decrease (a bigger-spend row is
    // never framed as worse than a smaller one purely by colour).
    expect(increaseValue.className).not.toMatch(/red/i)
    expect(decreaseValue.className).not.toMatch(/red/i)
    expect(increaseValue.className).toMatch(/text-text-2/)
    expect(decreaseValue.className).toMatch(/text-positive/)
  })

  it('shows the full 60-day series with the prior 30 distinguishable from the trailing 30', () => {
    h.txns = [
      expense('groceries', '2026-07-05T12:00:00.000Z', 20000),
      expense('groceries', '2026-08-05T12:00:00.000Z', 50000),
    ]
    renderPanel()
    expect(screen.getByText('60-day trend')).toBeTruthy()
    const prior = screen.getByTestId('trend-prior')
    const recent = screen.getByTestId('trend-recent')
    expect(prior.children.length).toBe(30)
    expect(recent.children.length).toBe(30)
    // Visually distinguishable without colour — e.g. a different opacity,
    // never a different hue.
    expect(prior.getAttribute('style')).not.toEqual(recent.getAttribute('style'))
  })

  it('shows a calm empty state consistent with the card when there is no spending in the trailing window', () => {
    h.txns = [expense('groceries', '2026-07-05T12:00:00.000Z', 20000)] // prior only
    renderPanel()
    expect(screen.getByText('No expenses in the last 30 days.')).toBeTruthy()
    expect(screen.queryByText('Biggest movers')).toBeNull()
  })

  it('narrows to the selected person under person scope', () => {
    h.txns = [
      expense('groceries', '2026-08-05T12:00:00.000Z', 20000, { owner_ids: ['alice'], shares: {} }),
      expense('dining', '2026-08-10T12:00:00.000Z', 50000, { owner_ids: ['bob'], shares: {} }),
    ]
    renderPanel(personScope('alice'))
    // Groceries (Alice's) shows in both the movers section (a new category
    // is itself a mover) and the breakdown; Dining (Bob's) is filtered out
    // of both by the people axis.
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0)
    expect(screen.queryByText('Dining')).toBeNull()
  })

  it('states the subject and period in the caption', () => {
    h.txns = [expense('groceries', '2026-08-05T12:00:00.000Z', 20000)]
    renderPanel()
    const caption = screen.getByTestId('panel-caption')
    expect(caption.textContent).toContain('Household')
    expect(caption.textContent).toContain('August 2026')
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TopMerchantsPanel } from '@/components/widgets/panels/TopMerchantsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import { mediumDate } from '@/lib/format'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US6 (top merchants): the card's fixed five rows can't show rows 6+
// or say which merchants are subscriptions. The panel shows the whole ranked
// list, flags a recurring cadence via the existing detection engine
// (`detectRoutines`, lib/finance/routines.ts — reused as-is, FR-016), and lets
// a member drill into one merchant's history (first/last seen, typical
// amount, this-period-vs-the-one-before) with a way back (D6). Honours BOTH
// scope axes exactly as `TopMerchantsBody` does.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scopeState: { interval: { start: new Date(), end: new Date() }, periodLabel: '' },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    transactions: h.txns,
    resolveUser: (id: string) => ({ id, name: id === 'alice' ? 'Alice' : id, initial: 'A', color_key: 'sand', created_at: '' }),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

const MARCH = { start: new Date(2026, 2, 1), end: new Date(2026, 3, 1) }

let txSeq = 0
function expense(merchant: string, dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant,
    category: 'other' as Transaction['category'],
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
      <WidgetPanel open title="Top merchants" onClose={() => {}}>
        <TopMerchantsPanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

beforeEach(() => {
  h.scopeState = { interval: MARCH, periodLabel: 'March 2026' }
  h.txns = []
  txSeq = 0
})
afterEach(() => {
  cleanup()
})

describe('TopMerchantsPanel', () => {
  it("shows the full ranked list, not just the card's top five", () => {
    h.txns = [
      expense('Merchant A', '2026-03-05T12:00:00.000Z', 5000),
      expense('Merchant B', '2026-03-06T12:00:00.000Z', 4000),
      expense('Merchant C', '2026-03-07T12:00:00.000Z', 3000),
      expense('Merchant D', '2026-03-08T12:00:00.000Z', 2000),
      expense('Merchant E', '2026-03-09T12:00:00.000Z', 1900),
      expense('Merchant F', '2026-03-10T12:00:00.000Z', 1000),
      expense('Merchant G', '2026-03-11T12:00:00.000Z', 800),
    ]
    renderPanel()

    // Ranks 6 and 7 — beyond the card's top 5 — are present.
    expect(screen.getByText('Merchant F')).toBeTruthy()
    expect(screen.getByText('Merchant G')).toBeTruthy()
  })

  it('flags a merchant with a monthly cadence as recurring, and leaves a one-off merchant unflagged', () => {
    h.txns = [
      expense('Netflix', '2025-12-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-01-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-02-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-03-15T12:00:00.000Z', 1500),
      expense('Local Diner', '2026-03-05T12:00:00.000Z', 800),
    ]
    renderPanel()

    // Netflix is flagged even though it only visited once THIS period — the
    // cadence comes from its history, not the window's visit count.
    expect(screen.getAllByText('Monthly charge').length).toBe(1)
    expect(screen.getAllByText('1 visit').length).toBe(2) // Netflix (this period) and Local Diner
  })

  it("selecting a merchant shows its history — first/last seen, typical amount, and the period-before comparison — with a way back", () => {
    h.txns = [
      expense('Netflix', '2025-12-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-01-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-02-15T12:00:00.000Z', 1500),
      expense('Netflix', '2026-03-15T12:00:00.000Z', 1500),
      expense('Local Diner', '2026-03-05T12:00:00.000Z', 800),
    ]
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /Netflix/ }))

    expect(screen.getByText(mediumDate(new Date('2025-12-15T12:00:00.000Z'), 'en-US'))).toBeTruthy()
    expect(screen.getByText(mediumDate(new Date('2026-03-15T12:00:00.000Z'), 'en-US'))).toBeTruthy()
    expect(screen.getByText('$15.00')).toBeTruthy() // typical amount
    expect(screen.getByText('$15.00 this period, compared with $15.00 the period before.')).toBeTruthy()
    expect(screen.queryByText('Local Diner')).toBeNull() // the list unmounted beneath the detail

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Local Diner')).toBeTruthy()
  })

  it("shows a calm empty state, consistent with the card's, when there are no expenses in the period", () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('No expenses in this period yet.')).toBeTruthy()
  })

  it('honours the people axis, narrowing the ranking to the selected person', () => {
    h.txns = [
      expense("Alice's Gym", '2026-03-05T12:00:00.000Z', 3000, { owner_ids: ['alice'], shares: {} }),
      expense("Bob's Bar", '2026-03-06T12:00:00.000Z', 2000, { owner_ids: ['bob'], shares: {} }),
    ]
    renderPanel(personScope('alice'))

    expect(screen.getByText("Alice's Gym")).toBeTruthy()
    expect(screen.queryByText("Bob's Bar")).toBeNull()
  })

  it('declares both scope axes in the caption, and offers a route out to the full ledger', () => {
    h.txns = [expense('Merchant A', '2026-03-05T12:00:00.000Z', 1000)]
    renderPanel()

    expect(screen.getByTestId('panel-caption').textContent).toBe('Household · March 2026')
    const routeOut = screen.getByRole('link', { name: 'See all transactions' })
    expect(routeOut.getAttribute('href')).toBe('/transactions')
  })
})

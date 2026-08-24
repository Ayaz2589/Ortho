// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { HousingCostsPanel } from '@/components/widgets/panels/HousingCostsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { housingSummary } from '@/lib/finance/housing-summary'
import type { Property, Transaction } from '@/lib/types'

// Spec 057 US8 (housing costs): the card gives one monthly total across every
// property; the panel says which property each part came from, and what
// share of a recorded income it represents. Ignores both scope axes on the
// housing figures themselves (a property is a household asset, point-in-time,
// like HomeEquityPanel/HousingCostsBody) — but the income-share figure is
// inherently tied to a month, so the caption states the period only, never a
// subject (D5, C-1). The income share must be OMITTED, never 0% or Infinity%,
// when the household has no recorded income for the period.

const h = vi.hoisted(() => ({
  properties: [] as unknown[],
  transactions: [] as unknown[],
  scopeState: { referenceDate: new Date(), periodLabel: '' },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) =>
      `${opts?.leadingPlus && c >= 0 ? '+' : ''}$${(c / 100).toFixed(2)}`,
    properties: h.properties,
    transactions: h.transactions,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

const REFERENCE = new Date(2026, 5, 15, 12) // June 15, 2026 — mid-month

const MORTGAGE_A = {
  property_id: 'p1',
  purchase_price_cents: 50_000_000,
  original_loan_cents: 40_000_000,
  annual_interest_rate_percent: 6,
  loan_term_years: 30,
  closing_date: '2024-03-01',
  auto_pay_source: null,
}

const MORTGAGE_B = {
  property_id: 'p2',
  purchase_price_cents: 30_000_000,
  original_loan_cents: 24_000_000,
  annual_interest_rate_percent: 5.5,
  loan_term_years: 15,
  closing_date: '2023-01-01',
  auto_pay_source: null,
}

function property(over: Partial<Property> & { id: string }): Property {
  return {
    household_id: 'hh',
    kind: 'primary_home',
    address: '1 Nowhere Ln',
    nickname: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function income(cents: number, dateIso: string): Transaction {
  return {
    id: `inc-${dateIso}`,
    household_id: 'hh',
    merchant: 'Payroll',
    category: 'income',
    kind: 'income',
    amount_cents: cents,
    source: 'manual',
    date: dateIso,
    created_by: 'u',
    created_at: dateIso,
    updated_at: dateIso,
    owner_ids: [],
    shares: {},
  }
}

function renderPanel() {
  return render(
    <WidgetPanel open title="Housing costs" onClose={() => {}}>
      <HousingCostsPanel />
    </WidgetPanel>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(REFERENCE)
  h.properties = []
  h.transactions = []
  h.scopeState = { referenceDate: REFERENCE, periodLabel: 'June 2026' }
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('HousingCostsPanel', () => {
  it('shows a calm empty state, not a blank frame, when there are no properties', () => {
    renderPanel()
    expect(screen.getByText('No properties yet.')).toBeTruthy()
  })

  it('lists each property with its own cost, summing to the card total', () => {
    h.properties = [
      property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A }),
      property({ id: 'p2', address: '456 Elm St', lease: { property_id: 'p2', monthly_rent_cents: 200000, lease_start: '', lease_end: '', security_deposit_cents: null, paid_with_source: null } }),
    ]
    renderPanel()

    const summary = housingSummary(h.properties as Property[])
    expect(screen.getByText('Home base')).toBeTruthy()
    expect(screen.getByText('456 Elm St')).toBeTruthy()
    expect(screen.getByText('$2000.00')).toBeTruthy() // the lease row

    // The per-property costs sum to the card's total (Independent Test).
    const mortgagePayment = summary.cost - 200000
    expect(screen.getByText(`$${(mortgagePayment / 100).toFixed(2)}`)).toBeTruthy()
  })

  it('declares only the period in its caption, never a subject — housing figures ignore the people axis entirely', () => {
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    renderPanel()
    expect(screen.getByTestId('panel-caption').textContent).toBe('June 2026')
  })

  it('shows unit occupancy and net rental flow for a multifamily property', () => {
    h.properties = [
      property({
        id: 'p1',
        kind: 'multifamily',
        nickname: 'Duplex',
        mortgage: MORTGAGE_B,
        units: [
          { id: 'u1', property_id: 'p1', name: 'Unit A', monthly_rent_cents: 150000, tenant_name: 'Sam', tenant_email: null, sort_order: 0, occupied: true },
          { id: 'u2', property_id: 'p1', name: 'Unit B', monthly_rent_cents: 150000, tenant_name: null, tenant_email: null, sort_order: 1, occupied: false },
        ],
      }),
    ]
    renderPanel()

    expect(screen.getByText('1 of 2 units occupied')).toBeTruthy()
    expect(screen.getByText('Net rental')).toBeTruthy()
  })

  it('states the income share plainly, with no pass/fail judgement, when income is recorded for the period', () => {
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    h.transactions = [income(1_000_000, '2026-06-05')]
    renderPanel()

    const summary = housingSummary(h.properties as Property[])
    const expectedPct = Math.round((summary.cost / 1_000_000) * 100)
    expect(screen.getByText(`Housing is ${expectedPct}% of June 2026 income.`)).toBeTruthy()
    // No pass/fail language.
    expect(screen.queryByText(/over|under|too (much|high)|warning/i)).toBeNull()
  })

  it('omits the income share entirely when there is no recorded income — never 0% or Infinity%', () => {
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    h.transactions = []
    renderPanel()

    expect(screen.queryByText('Share of income')).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.queryByText(/Infinity/)).toBeNull()
  })

  it('omits the income share when the only transactions are outside the period', () => {
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    h.transactions = [income(1_000_000, '2026-05-05')]
    renderPanel()

    expect(screen.queryByText('Share of income')).toBeNull()
  })

  it('routes out to the full properties list', () => {
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    renderPanel()
    const link = screen.getByRole('link', { name: /See all properties/ })
    expect(link.getAttribute('href')).toBe('/housing')
  })

  // Review 2026-08-24, B6: incomeSharePercent is always monthly cost ÷ ONE
  // month's income (the month of referenceDate), but the sentence used to
  // interpolate the range label — "Housing is 24% of Last 6 months income."
  // is a false money statement a user with a persisted range read on every
  // open. The sentence (and the caption) must name the month actually measured.
  it('under a relative range, the income sentence names the measured month, never the range', () => {
    h.scopeState = { referenceDate: REFERENCE, periodLabel: 'Last 6 months' }
    h.properties = [property({ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A })]
    h.transactions = [income(1_000_000, '2026-06-05')]
    renderPanel()

    const summary = housingSummary(h.properties as Property[])
    const expectedPct = Math.round((summary.cost / 1_000_000) * 100)
    expect(screen.getByText(`Housing is ${expectedPct}% of June 2026 income.`)).toBeTruthy()
    expect(screen.queryByText(/Last 6 months income/)).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { HomeEquityPanel } from '@/components/widgets/panels/HomeEquityPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { maturityDate, yearsRemaining, upcomingAmortization } from '@/lib/finance/mortgage'
import { monthYearLong } from '@/lib/format'

// Spec 057 US2 (home equity — the first reference panel): recovers
// upcomingAmortization / maturityDate / yearsRemaining, all exported today
// with no UI consumer at all (SC-008), and stops silently summing several
// mortgages the way the card does (FR-016; data-model §2). Ignores both scope
// axes — a property is a household asset and a schedule is not windowed (D5) —
// so it is rendered inside a bare WidgetPanel with no scope providers.

const h = vi.hoisted(() => ({ properties: [] as unknown[] }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    properties: h.properties,
  }),
}))

const NOW = new Date('2026-06-15T12:00:00.000Z')

const MORTGAGE_A = {
  purchase_price_cents: 50_000_000,
  original_loan_cents: 40_000_000,
  annual_interest_rate_percent: 6,
  loan_term_years: 30,
  closing_date: '2024-03-01',
  auto_pay_source: null,
}

const MORTGAGE_B = {
  purchase_price_cents: 30_000_000,
  original_loan_cents: 24_000_000,
  annual_interest_rate_percent: 5.5,
  loan_term_years: 15,
  closing_date: '2023-01-01',
  auto_pay_source: null,
}

function renderPanel() {
  return render(
    <WidgetPanel open title="Home equity" onClose={() => {}}>
      <HomeEquityPanel />
    </WidgetPanel>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  h.properties = []
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('HomeEquityPanel', () => {
  it('shows the payoff date and years remaining beside the equity headline, for a single mortgage', () => {
    h.properties = [{ id: 'p1', nickname: 'Home base', address: '124 Oak Lane', mortgage: MORTGAGE_A }]
    renderPanel()

    const expectedPayoff = monthYearLong(maturityDate(MORTGAGE_A.closing_date, MORTGAGE_A.loan_term_years), 'en-US')
    const expectedYears = yearsRemaining(MORTGAGE_A.closing_date, MORTGAGE_A.loan_term_years, NOW)

    expect(screen.getByText(expectedPayoff)).toBeTruthy()
    expect(screen.getByText(`${expectedYears} years remaining`)).toBeTruthy()
  })

  it('lists upcoming payments split into principal and interest', () => {
    h.properties = [{ id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A }]
    renderPanel()

    const schedule = upcomingAmortization(
      12,
      MORTGAGE_A.original_loan_cents,
      MORTGAGE_A.annual_interest_rate_percent,
      MORTGAGE_A.loan_term_years,
      MORTGAGE_A.closing_date,
      NOW
    )
    const first = schedule[0]
    expect(screen.getByText(`$${(first.principalCents / 100).toFixed(2)} principal`)).toBeTruthy()
    expect(screen.getByText(`$${(first.interestCents / 100).toFixed(2)} interest`)).toBeTruthy()
  })

  it('shows a calm explanation, not an empty table, when there is no mortgage', () => {
    h.properties = [{ id: 'p1', nickname: 'Rental', address: '1 Rental Way' }]
    renderPanel()
    expect(screen.getByText('No mortgages yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lists several mortgages separately rather than summing them, and selecting one shows its own schedule with a way back', () => {
    h.properties = [
      { id: 'p1', nickname: 'Home base', mortgage: MORTGAGE_A },
      { id: 'p2', address: '456 Elm St', mortgage: MORTGAGE_B },
    ]
    renderPanel()

    // Both mortgages are listed as their own rows — not summed as the card does.
    expect(screen.getByText('Home base')).toBeTruthy()
    expect(screen.getByText('456 Elm St')).toBeTruthy()

    // Selecting one pushes its own schedule.
    fireEvent.click(screen.getByRole('button', { name: /Home base/ }))
    const expectedPayoffA = monthYearLong(maturityDate(MORTGAGE_A.closing_date, MORTGAGE_A.loan_term_years), 'en-US')
    expect(screen.getByText(expectedPayoffA)).toBeTruthy()
    expect(screen.queryByText('456 Elm St')).toBeNull()

    // A working back affordance returns to the list.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Home base')).toBeTruthy()
    expect(screen.getByText('456 Elm St')).toBeTruthy()
  })
})

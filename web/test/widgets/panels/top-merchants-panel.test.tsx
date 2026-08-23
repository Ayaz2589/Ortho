// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TopMerchantsPanel } from '@/components/widgets/panels/TopMerchantsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US6 redesign: the panel was a single unbounded ranked list,
// restating the card louder, with the one thing the card can't show —
// what's recurring, and what it adds up to — demoted to grey text mid-row.
// This inverts the priority into three fixed-height zones: a verdict + meter
// for the standing recurring commitment (zone 1), a day-of-month cycle strip
// (zone 2 — detection is monthly by construction, so day-of-month is the
// only period-independent axis), and a bounded top-5 ranked list with a
// drill-in (zone 3). An increase never reads more alarmingly than a
// decrease; never red, anywhere.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scopeState: {
    interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
    periodLabel: 'August 2026',
    now: new Date(2026, 7, 15, 12),
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
    resolveUser: (id: string) => ({ id, name: id === 'alice' ? 'Alice' : id, initial: 'A', color_key: 'sand', created_at: '' }),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

let txSeq = 0
function expense(merchant: string, dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant,
    category: 'groceries',
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
  } as Transaction
}

/** Monthly occurrences on the same day-of-month, spaced ~30 days apart. */
function monthlyCharge(merchant: string, day: number, cents: number, months: string[]): Transaction[] {
  return months.map((ym) => expense(merchant, `${ym}-${String(day).padStart(2, '0')}T12:00:00.000Z`, cents))
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

afterEach(() => {
  cleanup()
  h.txns = []
  txSeq = 0
  h.scopeState = {
    interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
    periodLabel: 'August 2026',
    now: new Date(2026, 7, 15, 12),
  }
})

describe('TopMerchantsPanel — full state', () => {
  it('hedges the standing commitment as a sentence, and measures this period\'s landed share separately', () => {
    h.txns = [
      ...monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07', '2026-08']),
      ...monthlyCharge('Con Edison', 6, 21430, ['2026-05', '2026-06', '2026-07']),
      expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401),
    ]
    renderPanel()

    expect(screen.getByText('About $230.29 a month goes to 2 recurring charges.')).toBeTruthy()
    // Period (August only): Netflix $15.99 landed + Trader Joes $84.01 = $100.00 total.
    expect(screen.getByText('$15.99 of $100.00 · 16%')).toBeTruthy()
  })

  it('bounds the ranked list to five, with a drill-in to the rest', () => {
    h.txns = [
      expense('A', '2026-08-01T12:00:00.000Z', 700),
      expense('B', '2026-08-02T12:00:00.000Z', 600),
      expense('C', '2026-08-03T12:00:00.000Z', 500),
      expense('D', '2026-08-04T12:00:00.000Z', 400),
      expense('E', '2026-08-05T12:00:00.000Z', 300),
      expense('F', '2026-08-06T12:00:00.000Z', 200),
      expense('G', '2026-08-07T12:00:00.000Z', 100),
    ]
    renderPanel()

    expect(screen.getByText('E')).toBeTruthy()
    expect(screen.queryByText('F')).toBeNull()
    expect(screen.getByText('+ 2 more →')).toBeTruthy()
  })

  it("reads a merchant's period-over-period change by sign, an increase never coloured like a decrease", () => {
    h.txns = [
      expense('Uber Eats', '2026-07-06T12:00:00.000Z', 700),
      expense('Uber Eats', '2026-08-06T12:00:00.000Z', 900), // +$2.00
      expense('Instacart', '2026-07-06T12:00:00.000Z', 900),
      expense('Instacart', '2026-08-06T12:00:00.000Z', 700), // -$2.00
    ]
    renderPanel()

    const up = screen.getByText('+$2.00')
    const down = screen.getByText('−$2.00')
    expect(up.className).toContain('text-text-2')
    expect(down.className).toContain('text-positive')
    expect(up.className).not.toContain('text-positive')
  })
})

describe('TopMerchantsPanel — cycle strip (zone 2)', () => {
  it('reports the tally and names the next charge', () => {
    h.txns = [
      ...monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07', '2026-08']), // landed today
      ...monthlyCharge('Hyundai Insurance', 24, 8900, ['2026-05', '2026-06', '2026-07']), // ahead, day 24
    ]
    renderPanel()

    expect(screen.getByText('1 landed · $15.99')).toBeTruthy()
    expect(screen.getByText('1 still ahead · ≈ $89.00')).toBeTruthy()
    expect(screen.getByText('Next: Hyundai Insurance on day 24 · ≈ $89.00')).toBeTruthy()
  })
})

describe('TopMerchantsPanel — second level', () => {
  it("opens a recurring merchant's history — typical amount, cadence, and confidence chip", () => {
    h.txns = [
      ...monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07', '2026-08']),
      expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401),
    ]
    renderPanel()

    fireEvent.click(screen.getByText('Netflix'))

    expect(screen.getByText('Typical charge')).toBeTruthy()
    expect(screen.getAllByText('$15.99').length).toBeGreaterThan(0)
    expect(screen.getByText(/↻ Recurring · confidence \d+/)).toBeTruthy()
  })

  it('opens a non-recurring merchant without a cadence line or chip', () => {
    h.txns = [expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401)]
    renderPanel()

    fireEvent.click(screen.getByText('Trader Joes'))

    expect(screen.getByText('Total this period')).toBeTruthy()
    expect(screen.queryByText(/↻/)).toBeNull()
  })

  it('opens the full ranked list from "+ N more", and drills into a merchant from there, with a way back to the list', () => {
    h.txns = [
      expense('A', '2026-08-01T12:00:00.000Z', 700),
      expense('B', '2026-08-02T12:00:00.000Z', 600),
      expense('C', '2026-08-03T12:00:00.000Z', 500),
      expense('D', '2026-08-04T12:00:00.000Z', 400),
      expense('E', '2026-08-05T12:00:00.000Z', 300),
      expense('F', '2026-08-06T12:00:00.000Z', 200),
    ]
    renderPanel()

    fireEvent.click(screen.getByText('+ 1 more →'))
    expect(screen.getByText('All merchants')).toBeTruthy()
    expect(screen.getByText('F')).toBeTruthy()

    fireEvent.click(screen.getByText('F'))
    expect(screen.getByText('Total this period')).toBeTruthy()

    fireEvent.click(screen.getByText('‹ Back'))
    expect(screen.getByText('F')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })
})

describe('TopMerchantsPanel — states', () => {
  it('reads a calm explanation, not a chart, when there are no recurring charges recognised yet', () => {
    h.txns = [expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401)]
    renderPanel()

    expect(
      screen.getByText(
        'No recurring charges recognised yet — it takes three months of consistent history for a charge to be recognised as recurring.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Trader Joes')).toBeTruthy()
  })

  it('collapses the cycle strip into one line when exactly one recurring charge exists', () => {
    h.txns = monthlyCharge('Claude Max', 8, 21700, ['2026-05', '2026-06', '2026-07', '2026-08'])
    renderPanel()

    expect(screen.getByText('One recurring charge, about $217.00 a month.')).toBeTruthy()
    expect(screen.queryByText('Recurring, by day of month')).toBeNull()
    expect(screen.getByText('Claude Max, on day 8 · landed Aug 8')).toBeTruthy()
  })

  it('shows a calm empty state, with a hint of what would appear, when there are no expenses in the period', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('No expenses in this period yet.')).toBeTruthy()
    expect(screen.getByText("Recurring charges will appear here once there's spending to recognise.")).toBeTruthy()
  })

  it('drops the delta column entirely when there is no prior period to compare against', () => {
    h.txns = [expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401)]
    renderPanel()

    expect(screen.queryByText('Δ vs last period')).toBeNull()
  })

  it('hides the drill-in affordance when five or fewer merchants exist', () => {
    h.txns = [expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401)]
    renderPanel()
    expect(screen.queryByText(/\+ \d+ more/)).toBeNull()
  })
})

describe('TopMerchantsPanel — scope', () => {
  it("honours the people axis, narrowing the ranking to the selected person", () => {
    h.txns = [
      expense("Alice's Gym", '2026-08-05T12:00:00.000Z', 3000, { owner_ids: ['alice'], shares: {} }),
      expense("Bob's Bar", '2026-08-06T12:00:00.000Z', 2000, { owner_ids: ['bob'], shares: {} }),
    ]
    renderPanel(personScope('alice'))

    expect(screen.getByText("Alice's Gym")).toBeTruthy()
    expect(screen.queryByText("Bob's Bar")).toBeNull()
  })

  it('declares both scope axes in the caption, and offers a route out to the full ledger', () => {
    h.txns = [expense('Merchant A', '2026-08-05T12:00:00.000Z', 1000)]
    renderPanel()

    expect(screen.getByTestId('panel-caption').textContent).toBe('Household · August 2026')
    const routeOut = screen.getByRole('link', { name: 'See all transactions' })
    expect(routeOut.getAttribute('href')).toBe('/transactions')
  })
})

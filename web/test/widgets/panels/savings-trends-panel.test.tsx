// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SavingsTrendsPanel } from '@/components/widgets/panels/SavingsTrendsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US5 redesign: the old panel was a plain, unbounded stack of one
// four-line block per month — a 12-month window was 12 blocks, and the
// card's own bar chart was dropped entirely. This replaces it with
// verdict → chart → three bounded reconciled cards → drill-in, so the panel's
// height stays constant regardless of window length. A shortfall reads
// through sign and position, never colour (FR-021); a negative rate uses
// `--text`, never a warning colour — the one variation from the positive case.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scopeState: {
    interval: { start: new Date(2026, 0, 1), end: new Date(2026, 6, 1) },
    periodLabel: 'Jan–Jun 2026',
    isSpecificMonth: false as boolean,
    selectedMonth: null as string | null,
    availableMonths: [] as string[],
  },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => (c < 0 ? `−$${(Math.abs(c) / 100).toFixed(2)}` : `$${(c / 100).toFixed(2)}`),
    locale: 'en-US',
    transactions: h.txns,
    resolveUser: (id: string) => ({ id, name: id === 'alice' ? 'Alice' : id, initial: 'A', color_key: 'sand', created_at: '' }),
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scopeState,
}))

let txSeq = 0
function tx(kind: Transaction['kind'], dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant: `Merchant ${txSeq}`,
    category: 'groceries',
    kind,
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
      <WidgetPanel open title="Savings trends" onClose={() => {}}>
        <SavingsTrendsPanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

afterEach(() => {
  cleanup()
  h.txns = []
  txSeq = 0
  h.scopeState = {
    interval: { start: new Date(2026, 0, 1), end: new Date(2026, 6, 1) },
    periodLabel: 'Jan–Jun 2026',
    isSpecificMonth: false,
    selectedMonth: null,
    availableMonths: [],
  }
})

describe('SavingsTrendsPanel — multi-month window', () => {
  it('reconciles the whole window into a kept/spent verdict', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 40000),
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000),
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 2, 1) } }
    renderPanel()

    // Window income $2000, expense $1300, saved $700 → 35%.
    expect(
      screen.getByText('You kept $700.00 of the $2000.00 that came in — 35% across 2 months.')
    ).toBeTruthy()
    expect(screen.getByText(/Kept \$700\.00/)).toBeTruthy()
    expect(screen.getByText(/Spent \$1300\.00/)).toBeTruthy()
  })

  it('names the best and leanest months and shows exactly three reconciled cards', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 50000), // 50%
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000), // 10% — leanest
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000), // 80% — best
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) } }
    renderPanel()

    expect(screen.getAllByText(/Best month/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Leanest month/).length).toBeGreaterThan(0)
    // March is both best AND most recent — collapses to one tagged card, not two.
    expect(screen.getAllByText(/Best month · Most recent/).length).toBe(1)
    expect(screen.getAllByText('March').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('February').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a most-recent card distinct from best/leanest when a fourth month exists', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 50000), // 50%
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000), // 10% — leanest
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000), // 80% — best
      tx('income', '2026-04-05T12:00:00.000Z', 100000),
      tx('expense', '2026-04-10T12:00:00.000Z', 60000), // 40% — most recent, neither best nor leanest
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 4, 1) } }
    renderPanel()

    expect(screen.getByText('Best month')).toBeTruthy()
    expect(screen.getByText('Leanest month')).toBeTruthy()
    expect(screen.getByText('Most recent')).toBeTruthy()
  })

  it('opens every month, newest first, with a pinned window total, from "All N months"', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 40000),
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000),
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000),
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) } }
    renderPanel()

    fireEvent.click(screen.getByText(/All 3 months/))

    expect(screen.getByText('Every month')).toBeTruthy()
    const months = screen.getAllByText(/^January$|^February$|^March$/)
    // Newest first: March should be the first of the three in document order.
    expect(months[0].textContent).toBe('March')
    expect(screen.getByText('Window total')).toBeTruthy()
    // Window total: income $3000, expense $1500, saved $1500.
    expect(screen.getByText(/\$1500\.00/)).toBeTruthy()
  })

  it('reads a shortfall month in the every-month list through sign, never colour', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 50000),
      tx('income', '2026-02-05T12:00:00.000Z', 30000),
      tx('expense', '2026-02-10T12:00:00.000Z', 50000), // shortfall
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 2, 1) } }
    renderPanel()

    fireEvent.click(screen.getByText(/All 2 months/))

    const savedCell = screen.getByText(/−\$200\.00/)
    expect(savedCell).toBeTruthy()
    expect(savedCell.getAttribute('style')).toBeNull()
  })

  it('shows a calm prompt, not an empty frame, when the window has no activity', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('Not enough data yet.')).toBeTruthy()
  })

  it('reads plainly when the window has expenses but no income', () => {
    h.txns = [tx('expense', '2026-01-10T12:00:00.000Z', 40000)]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) } }
    renderPanel()

    expect(screen.getByText('No income recorded — $400.00 went out this window.')).toBeTruthy()
    expect(screen.queryByText(/-Infinity|NaN|∞/)).toBeNull()
  })

  it("narrows to a person's own share under person scope, never the household total", () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000, { owner_ids: ['alice'], shares: { alice: 100000 } }),
      tx('expense', '2026-01-10T12:00:00.000Z', 60000, { owner_ids: ['alice', 'bob'], shares: { alice: 20000, bob: 40000 } }),
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) } }
    renderPanel(personScope('alice'))

    // Alice's income $1000, her expense share $200, saved $800 — not the household's $400.
    expect(screen.getByText('You kept $800.00 of the $1000.00 that came in — 80% this month.')).toBeTruthy()
    expect(screen.queryByText(/\$400\.00/)).toBeNull()
  })
})

describe('SavingsTrendsPanel — single-month window', () => {
  it('reads plainly, without a best/leanest tag, and offers no drill-in', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 30000),
    ]
    h.scopeState = {
      interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) },
      periodLabel: 'January 2026',
      isSpecificMonth: true,
      selectedMonth: '2026-01',
      availableMonths: ['2026-01'],
    }
    renderPanel()

    expect(screen.getByText('You kept $700.00 of the $1000.00 that came in — 70% this month.')).toBeTruthy()
    expect(screen.queryByText('Best month')).toBeNull()
    expect(screen.queryByText('Leanest month')).toBeNull()
    expect(screen.queryByText(/All \d+ months/)).toBeNull()
  })

  it('compares against the previous month when one is on record', () => {
    h.txns = [
      tx('income', '2025-12-05T12:00:00.000Z', 100000),
      tx('expense', '2025-12-10T12:00:00.000Z', 76000), // Dec: 24%
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 83000), // Jan: 17%
    ]
    h.scopeState = {
      interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) },
      periodLabel: 'January 2026',
      isSpecificMonth: true,
      selectedMonth: '2026-01',
      availableMonths: ['2026-01', '2025-12'],
    }
    renderPanel()

    expect(screen.getByText('Down from 24% in December · 21% average over 2 months')).toBeTruthy()
    expect(screen.getByText('Selected month')).toBeTruthy()
    expect(screen.getByText('Previous month')).toBeTruthy()
  })

  it('omits the comparison line entirely when no previous month is on record', () => {
    h.txns = [tx('income', '2026-01-05T12:00:00.000Z', 100000), tx('expense', '2026-01-10T12:00:00.000Z', 30000)]
    h.scopeState = {
      interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) },
      periodLabel: 'January 2026',
      isSpecificMonth: true,
      selectedMonth: '2026-01',
      availableMonths: ['2026-01'],
    }
    renderPanel()

    expect(screen.queryByText('Previous month')).toBeNull()
    expect(screen.queryByText(/Down from|Up from/)).toBeNull()
  })

  // Review 2026-08-24 (minor): the default 'This month' scope spans one month,
  // and the drill-in used to render an ungrammatical 'All 1 months →' button
  // opening a one-row list that duplicated the reconciled card.
  it("a one-month window never renders an 'All 1 months' drill-in", () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 40000),
    ]
    h.scopeState = { ...h.scopeState, interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }, periodLabel: 'This month' }
    renderPanel()
    expect(screen.queryByText(/All 1 months/)).toBeNull()
  })

  // Review 2026-08-24 (scope-engine minor): under person scope a month can be
  // in the HOUSEHOLD's availableMonths while the selected person has nothing
  // in it — the panel used to show a zeroed 'Previous month' card where the
  // widget deliberately says no comparison exists.
  it('person scope: an empty previous month yields no comparison card', () => {
    h.txns = [
      // January belongs to Bob only; February is Alice's.
      tx('income', '2026-01-05T12:00:00.000Z', 100000, { owner_ids: ['bob'], shares: { bob: 100000 } }),
      tx('income', '2026-02-05T12:00:00.000Z', 80000, { owner_ids: ['alice'], shares: { alice: 80000 } }),
      tx('expense', '2026-02-10T12:00:00.000Z', 20000, { owner_ids: ['alice'], shares: { alice: 20000 } }),
    ]
    h.scopeState = {
      ...h.scopeState,
      interval: { start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) },
      periodLabel: 'February 2026',
      isSpecificMonth: true,
      selectedMonth: '2026-02',
      availableMonths: ['2026-02', '2026-01'],
    }
    renderPanel(personScope('alice'))
    expect(screen.queryByText('Previous month')).toBeNull()
    expect(screen.queryByText(/Down from|Up from|Same as/)).toBeNull()
  })
})

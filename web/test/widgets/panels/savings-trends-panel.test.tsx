// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SavingsTrendsPanel } from '@/components/widgets/panels/SavingsTrendsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US5 (savings trends): a savings rate is a ratio, and the card keeps
// only the ratio. The panel restores both terms — income and expense — per
// month, plus the amount saved, and names which months in the window were
// strongest/weakest by sign and position, never by colour.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scopeState: { interval: { start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }, periodLabel: 'Jan–Mar 2026' },
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
})

describe('SavingsTrendsPanel', () => {
  it('reconciles each month to the income, expense and saved amount behind its rate', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 40000),
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000),
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000),
    ]
    renderPanel()

    // January: income $1000, expense $400, saved $600.
    expect(screen.getAllByText('$1000.00').length).toBe(3)
    expect(screen.getByText('$400.00')).toBeTruthy()
    expect(screen.getByText('$600.00')).toBeTruthy()
    // February: expense $900, saved $100.
    expect(screen.getByText('$900.00')).toBeTruthy()
    expect(screen.getByText('$100.00')).toBeTruthy()
    // March: expense $200, saved $800.
    expect(screen.getByText('$200.00')).toBeTruthy()
    expect(screen.getByText('$800.00')).toBeTruthy()
  })

  it('identifies the best and worst months in a multi-month window', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 50000), // 50% — middle
      tx('income', '2026-02-05T12:00:00.000Z', 100000),
      tx('expense', '2026-02-10T12:00:00.000Z', 90000), // 10% — worst
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000), // 80% — best
    ]
    renderPanel()

    expect(screen.getByText('Best month')).toBeTruthy()
    expect(screen.getByText('Lowest month')).toBeTruthy()
  })

  it('reads a shortfall through sign and position, never colour', () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 50000),
      tx('income', '2026-02-05T12:00:00.000Z', 30000),
      tx('expense', '2026-02-10T12:00:00.000Z', 50000), // shortfall: saved is negative
      tx('income', '2026-03-05T12:00:00.000Z', 100000),
      tx('expense', '2026-03-10T12:00:00.000Z', 20000),
    ]
    renderPanel()

    const saved = screen.getByText('$-200.00')
    expect(saved).toBeTruthy()
    expect(saved.getAttribute('style')).toBeNull()
  })

  it('renders a single month plainly, without implying a trend', () => {
    h.scopeState = { interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }, periodLabel: 'January 2026' }
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000),
      tx('expense', '2026-01-10T12:00:00.000Z', 30000),
    ]
    renderPanel()

    expect(screen.getByText('$700.00')).toBeTruthy()
    expect(screen.queryByText('Best month')).toBeNull()
    expect(screen.queryByText('Lowest month')).toBeNull()
  })

  it('shows a calm prompt, not an empty frame, when the window has no activity', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('Not enough data yet.')).toBeTruthy()
  })

  it("narrows to a person's own share under person scope, never the household total", () => {
    h.txns = [
      tx('income', '2026-01-05T12:00:00.000Z', 100000, { owner_ids: ['alice'], shares: { alice: 100000 } }),
      tx('expense', '2026-01-10T12:00:00.000Z', 60000, { owner_ids: ['alice', 'bob'], shares: { alice: 20000, bob: 40000 } }),
    ]
    h.scopeState = { interval: { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }, periodLabel: 'January 2026' }
    renderPanel(personScope('alice'))

    expect(screen.getByText('$1000.00')).toBeTruthy() // Alice's income share
    expect(screen.getByText('$200.00')).toBeTruthy() // Alice's expense share, not the household's $600
    expect(screen.queryByText('$600.00')).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ActivityPanel } from '@/components/widgets/panels/ActivityPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import type { MoneyScope } from '@/lib/scope/moneyScope'
import type { Transaction } from '@/lib/types'

// Spec 057 US10 (recent activity — built ON the extracted kit, the cheapest
// test of whether it generalises before six sandboxes depend on it): a
// longer, date-grouped feed beyond the card's five rows, each row reaching
// its own transaction, with a route-out to the full ledger rather than the
// panel reproducing it. Honours the people axis; ignores the time window by
// design (spec 041 O-2) — the caption must say so, never claim a month it
// doesn't apply (D5, FR-014).

const h = vi.hoisted(() => ({ txns: [] as unknown[] }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    transactions: h.txns,
    resolveUser: (id: string) => ({ id, name: id === 'alice' ? 'Alice' : id, initial: 'A', color_key: 'sand', created_at: '' }),
    ownersDisplay: () => ({ avatarUser: {}, label: 'Household', count: 1 }),
  }),
}))

const NOW = new Date('2026-06-15T12:00:00.000Z')

let txSeq = 0
function tx(dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  txSeq++
  return {
    id: `tx-${txSeq}`,
    household_id: 'hh',
    merchant: `Merchant ${txSeq}`,
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
  }
}

function renderPanel(scope: MoneyScope = HOUSEHOLD_SCOPE) {
  return render(
    <MoneyScopeProvider scope={scope}>
      <WidgetPanel open title="Recent activity" onClose={() => {}}>
        <ActivityPanel />
      </WidgetPanel>
    </MoneyScopeProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  h.txns = []
  txSeq = 0
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('ActivityPanel', () => {
  it('shows a longer feed beyond the card, newest first, grouped by date, with a route out', () => {
    h.txns = Array.from({ length: 7 }, (_, i) => tx(`2026-06-${10 + i}T12:00:00.000Z`, (i + 1) * 1000))
    renderPanel()

    // All 7 rows are present — more than the card's 5.
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(`Merchant ${i}`)).toBeTruthy()
    }
    const links = screen.getAllByRole('link', { name: /Merchant/ })
    expect(links.length).toBe(7)
    // Newest first: Merchant 7 (June 16) precedes Merchant 1 (June 10) in the DOM.
    const idx7 = links.findIndex((l) => l.textContent?.includes('Merchant 7'))
    const idx1 = links.findIndex((l) => l.textContent?.includes('Merchant 1'))
    expect(idx7).toBeLessThan(idx1)
  })

  it('each row reaches its own transaction, and a route to the full ledger is offered', () => {
    h.txns = [tx('2026-06-10T12:00:00.000Z', 1500)]
    renderPanel()
    const row = screen.getByRole('link', { name: /Merchant 1/ })
    expect(row.getAttribute('href')).toBe('/transactions/edit?id=tx-1')

    const routeOut = screen.getByRole('link', { name: 'See all transactions' })
    expect(routeOut.getAttribute('href')).toBe('/transactions')
  })

  it('narrows to the selected person under person scope, and ignores the time window entirely', () => {
    h.txns = [
      tx('2026-01-05T12:00:00.000Z', 2000, { owner_ids: ['alice'], shares: {} }), // far outside "this month"
      tx('2026-06-10T12:00:00.000Z', 3000, { owner_ids: ['bob'], shares: {} }),
    ]
    renderPanel(personScope('alice'))

    // Alice's January transaction shows even though the dashboard's window is
    // nowhere near it — the panel never windows by time (spec 041 O-2).
    expect(screen.getByText('Merchant 1')).toBeTruthy()
    // Bob's transaction is not Alice's.
    expect(screen.queryByText('Merchant 2')).toBeNull()
    // The caption states the subject only — never a period it doesn't honour.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByTestId('panel-caption')?.textContent).not.toMatch(/·/)
  })

  it('shows a calm empty state when there are no transactions', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('No transactions yet.')).toBeTruthy()
  })
})

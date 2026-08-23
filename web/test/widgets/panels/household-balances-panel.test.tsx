// @vitest-environment jsdom
//
// The "Who owes whom" detail panel (spec 057, US7). Answers what the card
// cannot: the fewest transfers that clear every balance at once, every
// person's overall net position (not only the pairs they are in), and — per
// pair — the transactions that created the debt.
//
// ⚠️ contract §5 / FR-015 — this is the one panel with a trap in it. It MUST
// read the WHOLE household ledger and narrow only its OUTPUT; it must NEVER
// call `useScopedTransactions`, because `projectForPerson` rewrites every row
// to a single owner and deletes the payer-to-co-owner relationship a debt is
// derived from — which would make `outstandingBalances` calmly report "All
// settled up." for a household that owes money. The guard test below renders
// the panel under an ambient person scope and asserts the full household
// picture still comes through unfiltered.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Transaction } from '@/lib/types'
import { personScope } from '@/lib/scope/moneyScope'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'
import { HouseholdBalancesPanel } from '@/components/widgets/panels/HouseholdBalancesPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'

const ALICE = 'p1'
const BOB = 'p2'
const CARA = 'p3'
const NAMES: Record<string, string> = { [ALICE]: 'Alice', [BOB]: 'Bob', [CARA]: 'Cara' }

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  members: [] as unknown[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    transactions: h.txns,
    householdMembers: h.members,
    resolveUser: (id: string) => ({ id, name: NAMES[id] ?? id }),
  }),
}))

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'x', household_id: 'hh', merchant: 'Dinner', category: 'dining', kind: 'expense',
    amount_cents: 0, source: '', date: '2026-08-10T12:00:00.000Z', created_by: 'u',
    created_at: '2026-08-10T12:00:00.000Z', updated_at: '2026-08-10T12:00:00.000Z',
    owner_ids: [], shares: {}, notes: null,
    ...over,
  } as Transaction
}

const person = (id: string) => ({ id, name: NAMES[id], initial: NAMES[id][0], color_key: 'sage', created_at: '' })

// A three-person cycle in the same shape as household-balances.test.tsx's
// fixture, but with deliberately distinct amounts so no raw-pair figure
// coincides with a settlement figure (both render as plain "$N" text):
// Alice fronts Dinner, Bob owes Alice $4700; Bob fronts Outing, Cara owes
// Bob $3100; Cara fronts Errand, Alice owes Cara $900. Netting the cycle —
// Alice +3800, Bob -1600, Cara -2200 — the fewest-transfers settlement is
// TWO transfers (Cara pays Alice $2200, Bob pays Alice $1600) where the raw
// pairs are three.
const THREE_WAY: Transaction[] = [
  tx({ id: 'ab', merchant: 'Dinner', amount_cents: 10000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 5300, [BOB]: 4700 } }),
  tx({ id: 'bc', merchant: 'Outing', amount_cents: 9000, paid_by: BOB, owner_ids: [BOB, CARA], shares: { [BOB]: 5900, [CARA]: 3100 } }),
  tx({ id: 'ca', merchant: 'Errand', amount_cents: 2000, paid_by: CARA, owner_ids: [CARA, ALICE], shares: { [CARA]: 1100, [ALICE]: 900 } }),
]

function renderPanel() {
  return render(
    <WidgetPanel open title="Who owes whom" onClose={() => {}}>
      <HouseholdBalancesPanel />
    </WidgetPanel>
  )
}

beforeEach(() => {
  h.txns = THREE_WAY
  h.members = [person(ALICE), person(BOB), person(CARA)]
})
afterEach(cleanup)

describe('HouseholdBalancesPanel', () => {
  it('prompts instead of computing for a solo household', () => {
    h.members = [person(ALICE)]
    renderPanel()
    expect(screen.getByText('Add someone to your household to track who owes whom.')).toBeTruthy()
  })

  it('reads as settled when nobody owes anybody, consistent with the card (C-2)', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('All settled up.')).toBeTruthy()
  })

  it('shows the smallest set of transfers that settles every balance, alongside the raw pairs (scenario 1)', () => {
    renderPanel()

    // The raw pairs — the same three the card itself would show.
    expect(screen.getByText('Bob owes Alice')).toBeTruthy()
    expect(screen.getByText('Cara owes Bob')).toBeTruthy()
    expect(screen.getByText('Alice owes Cara')).toBeTruthy()
    expect(screen.getByText('$4700')).toBeTruthy()
    expect(screen.getByText('$3100')).toBeTruthy()
    expect(screen.getByText('$900')).toBeTruthy()

    // The reduced settlement: two transfers instead of three raw pairs —
    // simplifyDebts had no UI consumer before this panel.
    expect(screen.getByText('Bob pays Alice')).toBeTruthy()
    expect(screen.getByText('$1600')).toBeTruthy()
    expect(screen.getByText('Cara pays Alice')).toBeTruthy()
    expect(screen.getByText('$2200')).toBeTruthy()
  })

  it("shows every person's overall net position, not only the pairs they are in (scenario 3)", () => {
    // Cara here has no co-owned transaction with anyone — she is square with
    // everyone — while Alice and Bob still owe each other. Cara is not a
    // party to any outstanding pair, but her net position must still appear.
    h.txns = [
      tx({ id: 'ab', amount_cents: 10000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 5000, [BOB]: 5000 } }),
      tx({ id: 'solo', amount_cents: 4000, paid_by: CARA, owner_ids: [CARA], shares: { [CARA]: 4000 } }),
    ]
    renderPanel()

    expect(screen.getByText('owed $5000')).toBeTruthy() // Alice
    expect(screen.getByText('owes $5000')).toBeTruthy() // Bob
    expect(screen.getByText('Cara')).toBeTruthy()
    expect(screen.getByText('Settled')).toBeTruthy() // Cara, though in no pair
  })

  it('reads as settled when a household is fully settled, and does not present an empty settlement list (scenario 4)', () => {
    h.txns = []
    renderPanel()
    expect(screen.getByText('All settled up.')).toBeTruthy()
    expect(screen.queryByText('Suggested settle-up')).toBeNull()
  })

  it('selecting a pair shows the transactions that created the debt, with a way back (scenario 2)', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /Bob owes Alice/ }))

    // Who paid, who shares it, and each contribution — from the single
    // transaction that created this pair's debt. The row's own amount and
    // the pair headline coincide here (one contributing transaction), so
    // scope the amount check to the contribution row itself.
    const dinnerRow = screen.getByText('Dinner').closest('div')
    expect(dinnerRow?.textContent).toContain('$4700')
    expect(screen.getByText('Paid by Alice')).toBeTruthy()

    // The other two pairs' transactions are not mixed into this detail.
    expect(screen.queryByText('Outing')).toBeNull()
    expect(screen.queryByText('Errand')).toBeNull()

    // A working back affordance returns to the top-level list.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Bob owes Alice')).toBeTruthy()
    expect(screen.getByText('Cara owes Bob')).toBeTruthy()
  })

  it('still reports real debt when rendered under an ambient person scope — the trap guard (contract §5, FR-015)', () => {
    // Were this panel to call useScopedTransactions, every row would arrive
    // rewritten to a single owner, outstandingBalances would net every pair
    // to zero, and a household that genuinely owes money would read "All
    // settled up." This panel deliberately never reads the ambient scope at
    // all, so wrapping it in a person scope must change nothing.
    render(
      <MoneyScopeProvider scope={personScope(ALICE)}>
        <WidgetPanel open title="Who owes whom" onClose={() => {}}>
          <HouseholdBalancesPanel />
        </WidgetPanel>
      </MoneyScopeProvider>
    )

    expect(screen.queryByText('All settled up.')).toBeNull()
    expect(screen.getByText('Bob owes Alice')).toBeTruthy()
    expect(screen.getByText('Cara owes Bob')).toBeTruthy()
    expect(screen.getByText('Alice owes Cara')).toBeTruthy()
  })

  it('declares no scope caption — a debt is a standing position honouring neither axis (D5, FR-014)', () => {
    renderPanel()
    expect(screen.queryByTestId('panel-caption')).toBeNull()
  })
})

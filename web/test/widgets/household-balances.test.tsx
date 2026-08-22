// @vitest-environment jsdom
//
// The "Who owes whom" widget (spec 053), and its people axis (spec 056 US3).
//
// No suite covered this body before, so the household cases below come first and
// stand as a regression lock for behavior that already shipped; the person-scope
// cases follow.
//
// This is the one widget in spec 056 where the obvious one-line change is WRONG.
// The other five swap `transactions` for `useScopedTransactions(transactions)`.
// This one must not: `projectForPerson` rewrites a row to
// `{ amount_cents: <their share>, owner_ids: [personId] }`, and a debt exists
// precisely BECAUSE one person paid for something others co-own. Projection
// deletes the co-owners, so `outstandingBalances` over projected rows would find a
// ledger of single-owner expenses, conclude nobody owes anybody, and render
// "All settled up." for a household that owes money — a plausible wrong number
// rather than a crash. So the ledger stays whole and the ROWS are filtered.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Transaction } from '@/lib/types'
import { HOUSEHOLD_SCOPE, personScope, type MoneyScope } from '@/lib/scope/moneyScope'
import { MoneyScopeProvider } from '@/lib/widgets/MoneyScopeContext'

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

import { HouseholdBalancesBody } from '@/components/widgets/bodies/HouseholdBalancesBody'

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

// A three-person household with a debt in every pair. Each row is one person
// fronting a two-way split, so the other owes them their half.
//   Alice pays $100 shared with Bob   → Bob  owes Alice $50
//   Bob   pays  $60 shared with Cara  → Cara owes Bob   $30
//   Cara  pays  $40 shared with Alice → Alice owes Cara $20
const THREE_WAY: Transaction[] = [
  tx({ id: 'ab', amount_cents: 10000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 5000, [BOB]: 5000 } }),
  tx({ id: 'bc', amount_cents: 6000, paid_by: BOB, owner_ids: [BOB, CARA], shares: { [BOB]: 3000, [CARA]: 3000 } }),
  tx({ id: 'ca', amount_cents: 4000, paid_by: CARA, owner_ids: [CARA, ALICE], shares: { [CARA]: 2000, [ALICE]: 2000 } }),
]

const at = (scope: MoneyScope) =>
  render(
    <MoneyScopeProvider scope={scope}>
      <HouseholdBalancesBody />
    </MoneyScopeProvider>
  )

const rowTexts = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '')

beforeEach(() => {
  h.txns = THREE_WAY
  h.members = [person(ALICE), person(BOB), person(CARA)]
})
afterEach(cleanup)

// ─────────────────────────────────────────────────────────────────────────────
// Household scope — pre-existing behavior, pinned
// ─────────────────────────────────────────────────────────────────────────────

describe('household scope', () => {
  it('shows every non-zero pair, including ones the viewer is not part of', () => {
    // The reason spec 053 rebuilt this: the deleted predecessor was viewer-anchored,
    // so in a three-adult household what one roommate owed another was invisible
    // to the third.
    at(HOUSEHOLD_SCOPE)
    const rows = rowTexts()
    expect(rows).toHaveLength(3)
    expect(rows.join('|')).toContain('Bob owes Alice')
    expect(rows.join('|')).toContain('Cara owes Bob')
    expect(rows.join('|')).toContain('Alice owes Cara')
  })

  it('prompts instead of computing for a solo household', () => {
    h.members = [person(ALICE)]
    at(HOUSEHOLD_SCOPE)
    expect(screen.getByText('Add someone to your household to track who owes whom.')).toBeTruthy()
  })

  it('reads as settled when nobody owes anybody', () => {
    h.txns = []
    at(HOUSEHOLD_SCOPE)
    expect(screen.getByText('All settled up.')).toBeTruthy()
  })

  it('renders identically with no provider at all (C-1 / C-2)', () => {
    const bare = render(<HouseholdBalancesBody />).container.innerHTML
    cleanup()
    expect(at(HOUSEHOLD_SCOPE).container.innerHTML).toBe(bare)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Person scope — US3
// ─────────────────────────────────────────────────────────────────────────────

describe('person scope', () => {
  it('keeps only the pairs the selected person is part of', () => {
    at(personScope(ALICE))
    const rows = rowTexts()
    expect(rows).toHaveLength(2)
    expect(rows.join('|')).toContain('Bob owes Alice')
    expect(rows.join('|')).toContain('Alice owes Cara')
    expect(rows.join('|')).not.toContain('Cara owes Bob')
  })

  it('keeps the person as debtor as well as creditor', () => {
    // Directionality must not be a filter: Alice is owed by Bob AND owes Cara.
    at(personScope(ALICE))
    expect(screen.getByText('Bob owes Alice')).toBeTruthy()
    expect(screen.getByText('Alice owes Cara')).toBeTruthy()
  })

  it('narrowing NEVER restates an amount (C-6)', () => {
    const householdRows = (at(HOUSEHOLD_SCOPE), rowTexts())
    cleanup()
    at(personScope(BOB))
    for (const row of rowTexts()) {
      expect(householdRows).toContain(row)
    }
  })

  it('still reports real debt — it must not be fed projected transactions (D5)', () => {
    // The guard case. Were this body to call useScopedTransactions, every row
    // would arrive single-owner, balanceBetween would net to zero for every pair,
    // and a household that genuinely owes money would read "All settled up."
    at(personScope(ALICE))
    expect(screen.queryByText('All settled up.')).toBeNull()
    expect(screen.getByText('$5000')).toBeTruthy()
  })

  it('reads as settled for a person who is square with everyone', () => {
    // Cara pays $40 that only she owns — no co-owner, so no debt of hers exists,
    // while Alice and Bob still owe each other.
    h.txns = [
      tx({ id: 'ab', amount_cents: 10000, paid_by: ALICE, owner_ids: [ALICE, BOB], shares: { [ALICE]: 5000, [BOB]: 5000 } }),
      tx({ id: 'solo', amount_cents: 4000, paid_by: CARA, owner_ids: [CARA], shares: { [CARA]: 4000 } }),
    ]
    at(personScope(CARA))
    expect(screen.getByText('All settled up.')).toBeTruthy()
  })

  it('still prompts for a solo household under person scope', () => {
    h.members = [person(ALICE)]
    at(personScope(ALICE))
    expect(screen.getByText('Add someone to your household to track who owes whom.')).toBeTruthy()
  })
})

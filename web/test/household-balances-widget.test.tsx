// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction, Person } from '@/lib/types'
import type { TransferPrefill } from '@/components/web/TxForm'

const A = 'p-alice'
const B = 'p-bob'
const C = 'p-carol'

function makePerson(id: string, name: string): Person {
  return { id, household_id: 'h1', name, initial: name[0], color_key: 'sage', linked_user_id: null, sort_order: 0, removed_at: null, created_at: '' }
}

const ALICE = makePerson(A, 'Alice')
const BOB = makePerson(B, 'Bob')
const CAROL = makePerson(C, 'Carol')

function makeExpense(payer: string, owners: string[], shares: Record<string, number>, amount: number): Transaction {
  return { id: `tx-${payer}`, household_id: 'h1', merchant: 'Shop', category: 'groceries', kind: 'expense', amount_cents: amount, source: '', date: '2026-06-15T12:00:00.000Z', created_by: 'u', created_at: '', updated_at: '', paid_by: payer, owner_ids: owners, shares }
}

const twoMemberTxns: Transaction[] = [makeExpense(A, [A, B], { [A]: 5000, [B]: 5000 }, 10000)]
const threeMemberTxns: Transaction[] = [makeExpense(A, [A, B, C], { [A]: 3334, [B]: 3333, [C]: 3333 }, 10000)]

// Mutable store state — updated per test
let _people: Person[] = [ALICE, BOB]
let _txns: Transaction[] = twoMemberTxns
let _currentPersonId = A

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    people: _people,
    householdMembers: _people.map((p) => ({
      id: p.id, name: p.name, initial: p.initial, color_key: p.color_key, created_at: '',
    })),
    transactions: _txns,
    currentPersonId: _currentPersonId,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    resolveUser: (id: string) => {
      const p = _people.find((x) => x.id === id)
      return { id, name: p?.name ?? '—', initial: p?.initial ?? '·', color_key: 'sage', created_at: '' }
    },
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m: string, i: string) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { HouseholdBalancesWidget } from '@/components/web/HouseholdBalancesWidget'

describe('HouseholdBalancesWidget', () => {
  it('renders balance rows when outstanding balances exist', () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    expect(screen.getByText(/Bob owes you/i)).toBeInTheDocument()
    // $50.00 appears in both the net summary and the row label
    expect(screen.getAllByText(/\$50\.00/).length).toBeGreaterThan(0)
  })

  it('calls onSettle with exact cents when Settle up is clicked', async () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    const onSettle = vi.fn()
    render(<HouseholdBalancesWidget onSettle={onSettle} />)
    await userEvent.click(screen.getAllByRole('button', { name: /settle up/i })[0])
    expect(onSettle).toHaveBeenCalledWith<[TransferPrefill]>({ from: B, to: A, amountCents: 5000 })
  })

  it('returns null for solo household', () => {
    _people = [ALICE]; _txns = []; _currentPersonId = A
    const { container } = render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when all balances are zero', () => {
    _people = [ALICE, BOB]; _txns = []; _currentPersonId = A
    const { container } = render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not show Simplified toggle for 2-person household', () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /simplified/i })).toBeNull()
  })

  it('shows Simplified toggle for 3-person household', () => {
    _people = [ALICE, BOB, CAROL]; _txns = threeMemberTxns; _currentPersonId = A
    render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /simplified/i })).toBeInTheDocument()
  })
})

describe('HouseholdBalancesWidget — threshold nudge', () => {
  it('shows nudge when balance exceeds threshold', () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    // Bob owes Alice $50 (5000 cents); set threshold to $20 (2000 cents) → nudge
    render(<HouseholdBalancesWidget onSettle={vi.fn()} settleThresholdCents={2000} />)
    expect(screen.getByText(/settle up\?/i)).toBeInTheDocument()
  })

  it('no nudge when balance is below threshold', () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    // Bob owes Alice $50; threshold $200 → no nudge
    render(<HouseholdBalancesWidget onSettle={vi.fn()} settleThresholdCents={20000} />)
    expect(screen.queryByText(/settle up\?/i)).toBeNull()
  })
})

describe('HouseholdBalancesWidget — settlement history', () => {
  // Partial settlement: Bob pays Alice $25, but Bob still owes $25 → widget stays visible
  const partialSettle: Transaction = {
    id: 'tx-settle', household_id: 'h1', merchant: '', category: 'transfer', kind: 'transfer',
    amount_cents: 2500, source: '', date: '2026-06-20T12:00:00.000Z', created_by: 'u',
    created_at: '', updated_at: '', paid_by: B, owner_ids: [A], shares: { [A]: 2500 },
  }
  // Large expense so partial settle leaves balance > 0 (Bob still owes Alice $50)
  const bigExpense: Transaction = makeExpense(A, [A, B], { [A]: 5000, [B]: 7500 }, 12500)

  it('shows history panel when History button is clicked', async () => {
    // Bob owes Alice 7500 - 2500 = 5000 cents (still positive) → widget renders
    _people = [ALICE, BOB]; _txns = [bigExpense, partialSettle]; _currentPersonId = A
    render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /history/i }))
    // History panel shows the partial settlement amount $25.00
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument()
  })

  it('shows empty state when no prior settlements', async () => {
    _people = [ALICE, BOB]; _txns = twoMemberTxns; _currentPersonId = A
    render(<HouseholdBalancesWidget onSettle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /history/i }))
    expect(screen.getByText(/no settlements yet/i)).toBeInTheDocument()
  })
})

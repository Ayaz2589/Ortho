// @vitest-environment jsdom
//
// spec 056 — MoneyScopeContext, the widget board's PEOPLE axis (sibling to the
// time axis in DashboardScopeContext).
//
// The load-bearing property under test is the missing-provider default. Unlike
// `useDashboardScopeContext`, which throws when unwrapped, `useMoneyScope` returns
// HOUSEHOLD_SCOPE. That is not leniency: `scopeTransactions(txs, HOUSEHOLD_SCOPE)`
// returns the SAME ARRAY REFERENCE, so household scope is the identity projection
// and "no provider" is therefore the same computation, not an approximation of it.
//
// The payoff is that every pre-existing suite under test/widgets/ — none of which
// knows a money scope exists — keeps passing UNMODIFIED, and that untouched green
// is what proves household output did not move (FR-005 / SC-002).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import type { Transaction } from '@/lib/types'
import { HOUSEHOLD_SCOPE, personScope } from '@/lib/scope/moneyScope'
import {
  MoneyScopeProvider,
  useMoneyScope,
  useScopedTransactions,
} from '@/lib/widgets/MoneyScopeContext'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const C = 'cccccccc-0000-0000-0000-000000000003'

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    household_id: 'hh',
    merchant: 'Grocer',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 6000,
    source: '',
    date: '2026-08-10T12:00:00.000Z',
    created_by: 'user-1',
    created_at: '2026-08-10T12:00:00.000Z',
    updated_at: '2026-08-10T12:00:00.000Z',
    paid_by: A,
    owner_ids: [A, B],
    shares: { [A]: 3000, [B]: 3000 },
    notes: null,
    ...over,
  } as Transaction
}

afterEach(cleanup)

/** Renders the scope kind + person id so assertions read off the DOM, not internals. */
function ScopeProbe() {
  const scope = useMoneyScope()
  return (
    <span data-testid="scope">
      {scope.kind}
      {scope.kind === 'person' ? `:${scope.personId}` : ''}
    </span>
  )
}

describe('useMoneyScope', () => {
  it('is the household when there is no provider — it must not throw', () => {
    render(<ScopeProbe />)
    expect(screen.getByTestId('scope').textContent).toBe('household')
  })

  it('returns exactly the scope the provider was given', () => {
    render(
      <MoneyScopeProvider scope={personScope(B)}>
        <ScopeProbe />
      </MoneyScopeProvider>
    )
    expect(screen.getByTestId('scope').textContent).toBe(`person:${B}`)
  })
})

/** Reports the projected ledger, plus whether the array reference survived a re-render. */
function LedgerProbe({ transactions }: { transactions: Transaction[] }) {
  const scoped = useScopedTransactions(transactions)
  const first = useRef(scoped)
  const stable = first.current === scoped
  return (
    <div>
      <span data-testid="ids">{scoped.map((t) => t.id).join(',')}</span>
      <span data-testid="amounts">{scoped.map((t) => t.amount_cents).join(',')}</span>
      <span data-testid="same-input">{String(scoped === transactions)}</span>
      <span data-testid="stable">{String(stable)}</span>
    </div>
  )
}

function wrap(scope: Parameters<typeof MoneyScopeProvider>[0]['scope'], node: ReactNode) {
  return <MoneyScopeProvider scope={scope}>{node}</MoneyScopeProvider>
}

describe('useScopedTransactions', () => {
  it('returns the very same array under household scope — the identity, not a copy', () => {
    const txs = [tx(), tx({ id: 'tx-2' })]
    render(wrap(HOUSEHOLD_SCOPE, <LedgerProbe transactions={txs} />))
    expect(screen.getByTestId('same-input').textContent).toBe('true')
  })

  it('returns the same array with no provider at all', () => {
    const txs = [tx()]
    render(<LedgerProbe transactions={txs} />)
    expect(screen.getByTestId('same-input').textContent).toBe('true')
  })

  it('narrows a shared expense to the stored share and drops rows the person does not own', () => {
    const txs = [
      tx({ id: 'shared' }),
      tx({ id: 'theirs-alone', owner_ids: [C], shares: { [C]: 6000 } }),
    ]
    render(wrap(personScope(B), <LedgerProbe transactions={txs} />))
    expect(screen.getByTestId('ids').textContent).toBe('shared')
    expect(screen.getByTestId('amounts').textContent).toBe('3000')
  })

  it('keeps a transfer the person is party to at its FULL amount', () => {
    const transfer = tx({
      id: 'settle',
      kind: 'transfer',
      category: 'transfer',
      amount_cents: 5000,
      paid_by: A,
      owner_ids: [B],
      shares: { [B]: 5000 },
    })
    render(wrap(personScope(A), <LedgerProbe transactions={[transfer]} />))
    // A is the sender: full amount, never halved.
    expect(screen.getByTestId('amounts').textContent).toBe('5000')
  })

  it('drops a transfer between two other people entirely', () => {
    const transfer = tx({
      id: 'settle',
      kind: 'transfer',
      category: 'transfer',
      amount_cents: 5000,
      paid_by: A,
      owner_ids: [B],
      shares: { [B]: 5000 },
    })
    render(wrap(personScope(C), <LedgerProbe transactions={[transfer]} />))
    expect(screen.getByTestId('ids').textContent).toBe('')
  })

  it('is referentially stable across a re-render when nothing changed', () => {
    // Every downstream widget memo depends on this. Note the scope object is
    // hoisted, not rebuilt per render — `personScope()` allocates, so the page
    // must hold the scope in state rather than derive it from a personId string
    // during render. That requirement is what this assertion encodes.
    const txs = [tx()]
    const scope = personScope(B)
    const { rerender } = render(wrap(scope, <LedgerProbe transactions={txs} />))
    rerender(wrap(scope, <LedgerProbe transactions={txs} />))
    expect(screen.getByTestId('stable').textContent).toBe('true')
  })
})

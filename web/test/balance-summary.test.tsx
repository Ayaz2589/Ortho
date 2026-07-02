// @vitest-environment jsdom
//
// BalanceSummary — the who-owes-whom line + Settle-up prefill (US2/US3).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'

const tx = (o: Partial<Transaction>): Transaction =>
  ({ id: '', household_id: 'h', merchant: '', category: 'groceries', kind: 'expense', amount_cents: 0, source: '', date: '2026-06-15T12:00:00.000Z', created_by: 'u', created_at: '', updated_at: '', owner_ids: [], shares: {}, paid_by: null, ...o }) as Transaction

const state = vi.hoisted(() => ({ app: null as unknown }))
vi.mock('@/lib/store', () => ({ useApp: () => state.app }))

function mockApp(transactions: Transaction[]) {
  return {
    currentPersonId: 'p1',
    householdMembers: [
      { id: 'p1', name: 'Ayaz' },
      { id: 'p2', name: 'Tasnuva' },
    ],
    transactions,
    resolveUser: (id: string) => ({ name: id === 'p1' ? 'Ayaz' : id === 'p2' ? 'Tasnuva' : id }),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }
}

import { BalanceSummary } from '@/components/transactions/BalanceSummary'

describe('BalanceSummary', () => {
  it('shows "X owes you $Y" and settles with the right prefill', async () => {
    state.app = mockApp([tx({ kind: 'expense', paid_by: 'p1', owner_ids: ['p1', 'p2'], shares: { p1: 10000, p2: 5000 }, amount_cents: 15000 })])
    const onSettle = vi.fn()
    render(<BalanceSummary onSettle={onSettle} />)
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(document.body.textContent).toContain('Tasnuva owes you')
    await userEvent.click(screen.getByRole('button', { name: 'Settle up' }))
    expect(onSettle).toHaveBeenCalledWith({ from: 'p2', to: 'p1', amountCents: 5000 })
  })

  it('shows "You owe X $Y" when the other member paid', () => {
    state.app = mockApp([tx({ kind: 'expense', paid_by: 'p2', owner_ids: ['p1', 'p2'], shares: { p1: 10000, p2: 5000 }, amount_cents: 15000 })])
    render(<BalanceSummary onSettle={vi.fn()} />)
    expect(document.body.textContent).toContain('You owe Tasnuva')
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('hides entirely when everyone is settled', () => {
    state.app = mockApp([
      tx({ kind: 'expense', paid_by: 'p1', owner_ids: ['p1', 'p2'], shares: { p1: 10000, p2: 5000 }, amount_cents: 15000 }),
      tx({ kind: 'transfer', category: 'transfer', paid_by: 'p2', owner_ids: ['p1'], shares: { p1: 5000 }, amount_cents: 5000 }),
    ])
    const { container } = render(<BalanceSummary onSettle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

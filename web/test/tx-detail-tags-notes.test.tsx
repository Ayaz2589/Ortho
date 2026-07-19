// @vitest-environment jsdom
// Spec 027 — the read-only detail shows tag chips + notes when present, nothing when absent.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Transaction } from '@/lib/types'

const ROSTER = [
  { id: 'tag-work', household_id: 'h1', name: 'work', created_at: '' },
  { id: 'tag-vacay', household_id: 'h1', name: 'vacation', created_at: '' },
]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    tags: ROSTER,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    resolveUser: (id: string) => ({ id, name: 'Alex', initial: 'A', color_key: 'sage', created_at: '' }),
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { TransactionDetailBody } from '@/components/transactions/TransactionDetailBody'

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1', household_id: 'h1', merchant: 'Whole Foods', category: 'groceries', kind: 'expense',
    amount_cents: 1250, source: 'Visa', date: '2026-06-15T12:00:00.000Z', created_by: 'u1',
    created_at: '2026-06-15T12:00:00.000Z', updated_at: '2026-06-15T12:00:00.000Z', paid_by: 'u1',
    owner_ids: ['u1'], shares: { u1: 1250 }, ...over,
  }
}

describe('TransactionDetailBody — tags & notes (spec 027)', () => {
  it('renders tag names and the note when present', () => {
    render(<TransactionDetailBody tx={tx({ tags: ['tag-work', 'tag-vacay'], notes: 'split with Sam' })} />)
    expect(screen.getByText('work')).toBeInTheDocument()
    expect(screen.getByText('vacation')).toBeInTheDocument()
    expect(screen.getByText('split with Sam')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('shows neither a Tags nor a Notes section when absent', () => {
    render(<TransactionDetailBody tx={tx({ tags: [], notes: null })} />)
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(screen.queryByText('work')).not.toBeInTheDocument()
  })
})

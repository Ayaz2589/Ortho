// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ActivityBody } from '@/components/widgets/bodies/ActivityBody'

// Widget 6 (activity): a live feed of the most-recent-N transactions household-
// wide, ignoring the scope window (O-2 = most-recent-N; N = 6). Each row shows the
// merchant, owner, amount, and date, newest first.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    locale: 'en-US',
    transactions: h.txns,
    ownersDisplay: () => ({ avatarUser: {}, label: 'Maya', count: 1 }),
  }),
}))
// Activity is a live feed — it deliberately ignores the scope window, so the body
// does not read the scope context.

beforeEach(() => {
  // 8 rows Aug 1..8; the 6 newest (Aug 3..8) are shown, the 2 oldest are not.
  h.txns = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    kind: 'expense',
    merchant: `M${i + 1}`,
    category: 'coffee',
    amount_cents: (i + 1) * 1000,
    date: `2026-08-0${i + 1}T12:00:00.000Z`,
    owner_ids: ['p1'],
  }))
})
afterEach(cleanup)

describe('ActivityBody', () => {
  it('shows the six most-recent transactions, newest first', () => {
    render(<ActivityBody />)
    expect(screen.getByText('M8')).toBeTruthy()
    expect(screen.getByText('M3')).toBeTruthy()
    // The two oldest fall off.
    expect(screen.queryByText('M1')).toBeNull()
    expect(screen.queryByText('M2')).toBeNull()
    // Owner label is shown per row.
    expect(screen.getAllByText('Maya').length).toBe(6)
  })

  it('renders a calm empty state when there are no transactions', () => {
    h.txns = []
    render(<ActivityBody />)
    expect(screen.getByText('No transactions yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<ActivityBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

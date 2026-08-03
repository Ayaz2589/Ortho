// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TopMerchantsBody } from '@/components/widgets/bodies/TopMerchantsBody'

// Widget 5 (top-merchants): expenses in the scope window grouped by merchant, top
// 5 by total spend, with a visit count. Income and out-of-window rows excluded.

const h = vi.hoisted(() => ({
  txns: [] as unknown[],
  scope: {} as { interval: { start: Date; end: Date } },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    transactions: h.txns,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

beforeEach(() => {
  h.scope = { interval: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) } }
  h.txns = [
    { id: 'c1', kind: 'expense', merchant: 'Costco', amount_cents: 100000, date: '2026-08-05T12:00:00.000Z' },
    { id: 'c2', kind: 'expense', merchant: 'Costco', amount_cents: 50000, date: '2026-08-15T12:00:00.000Z' },
    { id: 'c3', kind: 'expense', merchant: 'Costco', amount_cents: 20000, date: '2026-08-25T12:00:00.000Z' },
    { id: 'a1', kind: 'expense', merchant: 'Amazon', amount_cents: 90000, date: '2026-08-10T12:00:00.000Z' },
    // Excluded: income, and an out-of-window expense.
    { id: 'i1', kind: 'income', merchant: 'Employer', amount_cents: 500000, date: '2026-08-01T12:00:00.000Z' },
    { id: 'o1', kind: 'expense', merchant: 'JulyStore', amount_cents: 700000, date: '2026-07-15T12:00:00.000Z' },
  ]
})
afterEach(cleanup)

describe('TopMerchantsBody', () => {
  it('lists merchants by total spend with visit counts (highest first)', () => {
    render(<TopMerchantsBody />)
    expect(screen.getByText('Costco')).toBeTruthy()
    expect(screen.getByText('$170000')).toBeTruthy() // 100000 + 50000 + 20000
    expect(screen.getByText('3 visits')).toBeTruthy()
    expect(screen.getByText('Amazon')).toBeTruthy()
    expect(screen.getByText('$90000')).toBeTruthy()
    expect(screen.getByText('1 visit')).toBeTruthy()
    // Excluded rows never appear.
    expect(screen.queryByText('Employer')).toBeNull()
    expect(screen.queryByText('JulyStore')).toBeNull()
  })

  it('renders a calm empty state when there are no expenses in the window', () => {
    h.txns = []
    render(<TopMerchantsBody />)
    expect(screen.getByText('No expenses in this period yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<TopMerchantsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

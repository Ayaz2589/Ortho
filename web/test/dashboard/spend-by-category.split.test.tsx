// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Transaction } from '@/lib/types'
import { makeTx } from '../helpers/fixtures'

// Spec 022, US1 / T006: the chart canvas is deferred via next/dynamic, but the card's
// money figures (the legend rows) MUST still render synchronously on first paint,
// independent of the chart-code load state (FR-002, SC-003). This test renders the card
// and asserts the per-category amounts are present WITHOUT awaiting the dynamic chart.

const txns: Transaction[] = [
  makeTx({ id: 'a', category: 'groceries', kind: 'expense', amount_cents: 5000, date: '2026-06-10T12:00:00.000Z' }),
  makeTx({ id: 'b', category: 'dining', kind: 'expense', amount_cents: 3000, date: '2026-06-11T12:00:00.000Z' }),
]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: txns,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    ownersDisplay: () => ({ label: 'Maya' }),
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k,
  }),
}))

import { SpendByCategoryCard } from '@/components/dashboard/SpendByCategoryCard'
import type { DashboardRange, Interval } from '@/components/dashboard/range'

const interval: Interval = {
  start: new Date('2026-06-01T00:00:00.000Z'),
  end: new Date('2026-07-01T00:00:00.000Z'),
}

afterEach(cleanup)

describe('SpendByCategoryCard — money figures render without the deferred chart', () => {
  it('shows category legend rows and amounts synchronously on first render', () => {
    render(<SpendByCategoryCard range={'month' as DashboardRange} interval={interval} />)
    // Legend labels + amounts are present immediately (no await for the chart chunk).
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('Dining')).toBeTruthy()
    expect(screen.getByText('$50.00')).toBeTruthy()
    expect(screen.getByText('$30.00')).toBeTruthy()
  })
})

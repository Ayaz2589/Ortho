// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/lib/types'
import { makeTx } from '../helpers/fixtures'

// A household whose data spans > 1 year, so all four ranges are offered.
const txns: Transaction[] = [
  makeTx({ id: 'old', category: 'groceries', kind: 'expense', amount_cents: 5000, date: '2020-01-05T12:00:00.000Z' }),
  makeTx({ id: 'new', category: 'dining', kind: 'expense', amount_cents: 3000, date: '2026-06-10T12:00:00.000Z' }),
]

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: txns,
    currentHousehold: { id: 'hh-1', name: 'Home' },
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) =>
      `${opts?.leadingPlus && c >= 0 ? '+' : ''}$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k,
  }),
}))

const useReportsData = vi.fn()
vi.mock('@/lib/useReportsData', () => ({
  useReportsData: (...a: unknown[]) => useReportsData(...a),
}))

import { ReportsView } from '@/components/dashboard/ReportsView'

beforeEach(() => {
  useReportsData.mockReset()
  useReportsData.mockReturnValue({
    status: 'ready',
    savings: [{ yyyymm: '2026-06', incomeCents: 420000, expenseCents: 310000, rate: 1100 / 4200 }],
    categories: [
      { category: 'groceries', cents: 6000, share: 0.6 },
      { category: 'dining', cents: 3000, share: 0.4 },
    ],
    retry: vi.fn(),
  })
})
afterEach(cleanup)

describe('ReportsView', () => {
  it('renders the range picker and drives useReportsData with the household id + interval', () => {
    render(<ReportsView />)
    // range picker present with the four range labels
    expect(screen.getByText('Month')).toBeTruthy()
    expect(screen.getByText('6M')).toBeTruthy()
    // hook called with household id and an Interval
    const [hh, interval] = useReportsData.mock.calls[0]
    expect(hh).toBe('hh-1')
    expect(interval.start instanceof Date).toBe(true)
    expect(interval.end instanceof Date).toBe(true)
    // savings figures render (via the real SavingsRateView)
    expect(screen.getByText('26%')).toBeTruthy()
    // both views render — category deep-dive too (via the real CategoryDeepDiveView)
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('Dining')).toBeTruthy()
  })

  it('re-scopes the interval when the range changes', async () => {
    render(<ReportsView />)
    const firstInterval = useReportsData.mock.calls[0][1]
    await userEvent.click(screen.getByText('6M'))
    const lastInterval = useReportsData.mock.calls[useReportsData.mock.calls.length - 1][1]
    // 6 months is a wider window → earlier start than "this month"
    expect(lastInterval.start.getTime()).toBeLessThan(firstInterval.start.getTime())
  })
})

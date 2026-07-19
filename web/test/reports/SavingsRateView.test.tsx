// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SavingsRateRow } from '@/lib/reports/savings'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) =>
      `${opts?.leadingPlus && c >= 0 ? '+' : ''}$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k,
  }),
}))

// Stub the recharts leaf so the view is deterministic without loading recharts.
vi.mock('@/components/dashboard/charts/SavingsRateChart', () => ({
  SavingsRateChart: () => <div data-testid="savings-chart" />,
}))

import { SavingsRateView } from '@/components/dashboard/SavingsRateView'

const rows: SavingsRateRow[] = [
  { yyyymm: '2026-05', incomeCents: 420000, expenseCents: 480000, rate: -600 / 4200 }, // shortfall
  { yyyymm: '2026-06', incomeCents: 420000, expenseCents: 310000, rate: 1100 / 4200 },
  { yyyymm: '2026-07', incomeCents: 0, expenseCents: 0, rate: null }, // empty month
]

afterEach(cleanup)

describe('SavingsRateView', () => {
  it('renders one entry per month with income, expense and the savings rate', () => {
    render(<SavingsRateView status="ready" rows={rows} onRetry={() => {}} />)
    // income figures (leadingPlus) — May + June both have 420000 income
    expect(screen.getAllByText('+$4200.00')).toHaveLength(2)
    expect(screen.getByText('$3100.00')).toBeTruthy() // June's expense figure
    // savings rate percentages, tabular
    expect(screen.getByText('26%')).toBeTruthy() // 1100/4200 ≈ 26%
  })

  it('shows a zero-income month rate as an em dash, not 0% / NaN', () => {
    render(<SavingsRateView status="ready" rows={rows} onRetry={() => {}} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('conveys a shortfall via the Unicode minus, never a red color', () => {
    const { container } = render(<SavingsRateView status="ready" rows={rows} onRetry={() => {}} />)
    // −14% for the shortfall month (Unicode minus U+2212)
    expect(screen.getByText('−14%')).toBeTruthy()
    // calm: no red / destructive token anywhere in the view
    expect(container.innerHTML).not.toMatch(/destructive/i)
    expect(container.innerHTML).not.toMatch(/text-red|#f|rgb\(2/i)
  })

  it('renders a plainspoken empty line when the window has no activity', () => {
    const empty: SavingsRateRow[] = [
      { yyyymm: '2026-06', incomeCents: 0, expenseCents: 0, rate: null },
    ]
    render(<SavingsRateView status="ready" rows={empty} onRetry={() => {}} />)
    expect(screen.getByText(/no income or spending/i)).toBeTruthy()
  })

  it('renders a quiet loading line', () => {
    render(<SavingsRateView status="loading" rows={[]} onRetry={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeTruthy()
  })

  it('renders a plainspoken error line with a Retry button', async () => {
    const onRetry = vi.fn()
    render(<SavingsRateView status="error" rows={[]} onRetry={onRetry} />)
    expect(screen.getByText(/couldn.t load/i)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})

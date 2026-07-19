// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RankedCategory } from '@/lib/reports/categories'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)] ?? _m)) : k,
  }),
}))

// Stub the existing donut leaf so recharts isn't loaded in the test.
vi.mock('@/components/dashboard/charts/CategoryPie', () => ({
  CategoryPie: () => <div data-testid="category-pie" />,
}))

import { CategoryDeepDiveView } from '@/components/dashboard/CategoryDeepDiveView'

const ranked: RankedCategory[] = [
  { category: 'groceries', cents: 6000, share: 0.6 },
  { category: 'dining', cents: 3000, share: 0.3 },
  { category: 'coffee', cents: 1000, share: 0.1 },
]

afterEach(cleanup)

describe('CategoryDeepDiveView', () => {
  it('renders a legend entry per category with amount and share, highest first', () => {
    render(<CategoryDeepDiveView status="ready" categories={ranked} onRetry={() => {}} />)
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('Dining')).toBeTruthy()
    expect(screen.getByText('Coffee')).toBeTruthy()
    expect(screen.getByText('$60.00')).toBeTruthy()
    expect(screen.getByText('60%')).toBeTruthy()
    expect(screen.getByText('10%')).toBeTruthy()
  })

  it('shows a plainspoken empty line (not a chart) when there is no spend', () => {
    render(<CategoryDeepDiveView status="ready" categories={[]} onRetry={() => {}} />)
    expect(screen.getByText(/no expenses in this period/i)).toBeTruthy()
    expect(screen.queryByTestId('category-pie')).toBeNull()
  })

  it('renders quiet loading and calm error (with Retry) states, no red', () => {
    const { container, rerender } = render(
      <CategoryDeepDiveView status="loading" categories={[]} onRetry={() => {}} />
    )
    expect(screen.getByText(/loading/i)).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/destructive|text-red/i)

    const onRetry = vi.fn()
    rerender(<CategoryDeepDiveView status="error" categories={[]} onRetry={onRetry} />)
    expect(screen.getByText(/couldn.t load/i)).toBeTruthy()
  })

  it('calls onRetry from the error state', async () => {
    const onRetry = vi.fn()
    render(<CategoryDeepDiveView status="error" categories={[]} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})

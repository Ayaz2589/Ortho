// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// The Reports views call useApp() for `t`/`formatMoney`; stub it to identity so
// they render without the full provider.
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (s: string, ...a: unknown[]) =>
      a.length ? s.replace(/\{(\d+)\}/g, (_m, i) => String(a[Number(i)])) : s,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
  }),
}))

import { SavingsRateView } from '@/components/dashboard/SavingsRateView'
import { CategoryDeepDiveView } from '@/components/dashboard/CategoryDeepDiveView'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('SavingsRateView loading state (spec 032)', () => {
  it('renders a skeleton, not the "Loading…" text', () => {
    render(<SavingsRateView status="loading" rows={[]} onRetry={() => {}} />)
    expect(screen.getByTestId('skeleton-reports-savings')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('still shows the existing error state (with Try again), not a skeleton', () => {
    render(<SavingsRateView status="error" rows={[]} onRetry={() => {}} />)
    expect(screen.queryByTestId('skeleton-reports-savings')).toBeNull()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.getByText('Couldn’t load reports.')).toBeTruthy()
  })

  it('still shows the existing empty state when ready with no activity', () => {
    render(<SavingsRateView status="ready" rows={[]} onRetry={() => {}} />)
    expect(screen.queryByTestId('skeleton-reports-savings')).toBeNull()
    expect(screen.getByText('No income or spending in this period yet.')).toBeTruthy()
  })
})

describe('CategoryDeepDiveView loading state (spec 032)', () => {
  it('renders a skeleton, not the "Loading…" text', () => {
    render(<CategoryDeepDiveView status="loading" categories={[]} onRetry={() => {}} />)
    expect(screen.getByTestId('skeleton-reports-categories')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('still shows the existing error state (with Try again), not a skeleton', () => {
    render(<CategoryDeepDiveView status="error" categories={[]} onRetry={() => {}} />)
    expect(screen.queryByTestId('skeleton-reports-categories')).toBeNull()
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('still shows the existing empty state when ready with no categories', () => {
    render(<CategoryDeepDiveView status="ready" categories={[]} onRetry={() => {}} />)
    expect(screen.queryByTestId('skeleton-reports-categories')).toBeNull()
    expect(screen.getByText('No expenses in this period yet.')).toBeTruthy()
  })
})

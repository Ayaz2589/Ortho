// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { HomeEquityBody } from '@/components/widgets/bodies/HomeEquityBody'

// Spec 036 US2 (home-equity): total principal paid down + progress toward the total
// original loan. `equity` comes from the (mocked) `housingSummary()` roll-up; the
// progress denominator is summed locally from `properties[].mortgage.original_loan_cents`,
// so the percentage is deterministic regardless of today's date.

const h = vi.hoisted(() => ({
  properties: [] as unknown[],
  summary: { cost: 0, equity: 0, netRental: 0, multi: false, count: 0 },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    properties: h.properties,
  }),
}))
vi.mock('@/lib/finance/housing-summary', () => ({
  housingSummary: () => h.summary,
}))

beforeEach(() => {
  // Original loan 1,000,000c; 250,000c principal paid down → 25% paid off.
  h.properties = [{ id: 'p1', mortgage: { original_loan_cents: 1_000_000 } }]
  h.summary = { cost: 0, equity: 250_000, netRental: 0, multi: false, count: 1 }
})
afterEach(cleanup)

describe('HomeEquityBody', () => {
  it('shows principal paid down and the percent paid off', () => {
    render(<HomeEquityBody />)
    expect(screen.getByText('$250000')).toBeTruthy()
    expect(screen.getByText('principal paid down')).toBeTruthy()
    expect(screen.getByText('25% paid off')).toBeTruthy()
    expect(screen.getByText('of $1000000')).toBeTruthy()
  })

  it('reads 100% for a paid-off mortgage', () => {
    h.properties = [{ id: 'p1', mortgage: { original_loan_cents: 1_000_000 } }]
    h.summary = { cost: 0, equity: 1_000_000, netRental: 0, multi: false, count: 1 }
    render(<HomeEquityBody />)
    expect(screen.getByText('100% paid off')).toBeTruthy()
  })

  it('never rounds up to 100% until the loan is truly paid off', () => {
    // 996,000 / 1,000,000 = 99.6% — must NOT read "100% paid off".
    h.properties = [{ id: 'p1', mortgage: { original_loan_cents: 1_000_000 } }]
    h.summary = { cost: 0, equity: 996_000, netRental: 0, multi: false, count: 1 }
    render(<HomeEquityBody />)
    expect(screen.getByText('99% paid off')).toBeTruthy()
    expect(screen.queryByText('100% paid off')).toBeNull()
  })

  it('sums the original loan across multiple mortgages', () => {
    h.properties = [
      { id: 'p1', mortgage: { original_loan_cents: 1_000_000 } },
      { id: 'p2', mortgage: { original_loan_cents: 1_000_000 } },
      { id: 'p3' }, // no mortgage — contributes nothing to the denominator
    ]
    h.summary = { cost: 0, equity: 500_000, netRental: 0, multi: false, count: 3 }
    render(<HomeEquityBody />)
    // 500,000 / 2,000,000 = 25%
    expect(screen.getByText('25% paid off')).toBeTruthy()
    expect(screen.getByText('of $2000000')).toBeTruthy()
  })

  it('renders a calm empty state when no property has a mortgage', () => {
    h.properties = [{ id: 'p1' }]
    h.summary = { cost: 0, equity: 0, netRental: 0, multi: false, count: 1 }
    render(<HomeEquityBody />)
    expect(screen.getByText('No mortgages yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<HomeEquityBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { HousingCostsBody } from '@/components/widgets/bodies/HousingCostsBody'

// Spec 036 US1 (housing-costs): total monthly housing cost + property count, and —
// only for a multifamily household — the net monthly rental cashflow. Derives from
// the pure `housingSummary()` roll-up, which is mocked here so the body's PRESENTATION
// is asserted deterministically (the math itself is pinned by store.integrity.test).

const h = vi.hoisted(() => ({
  properties: [] as unknown[],
  summary: { cost: 0, equity: 0, netRental: 0, multi: false, count: 0 },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number, opts?: { leadingPlus?: boolean }) =>
      `${opts?.leadingPlus && c >= 0 ? '+' : ''}$${c}`,
    properties: h.properties,
  }),
}))
vi.mock('@/lib/finance/housing-summary', () => ({
  housingSummary: () => h.summary,
}))

beforeEach(() => {
  h.properties = [{ id: 'p1' }]
  h.summary = { cost: 250000, equity: 0, netRental: 0, multi: false, count: 1 }
})
afterEach(cleanup)

describe('HousingCostsBody', () => {
  it('shows the total monthly cost and a singular property count', () => {
    render(<HousingCostsBody />)
    expect(screen.getByText('$250000')).toBeTruthy()
    expect(screen.getByText('per month')).toBeTruthy()
    expect(screen.getByText('1 property')).toBeTruthy()
    // No multifamily → no net-rental row.
    expect(screen.queryByText('Net rental')).toBeNull()
  })

  it('pluralizes the property count', () => {
    h.properties = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
    h.summary = { cost: 900000, equity: 0, netRental: 0, multi: false, count: 3 }
    render(<HousingCostsBody />)
    expect(screen.getByText('3 properties')).toBeTruthy()
  })

  it('shows a signed net-rental row for a multifamily household', () => {
    h.summary = { cost: 500000, equity: 0, netRental: 120000, multi: true, count: 2 }
    render(<HousingCostsBody />)
    expect(screen.getByText('Net rental')).toBeTruthy()
    expect(screen.getByText('+$120000')).toBeTruthy()
  })

  it('shows a negative net rental for a cash-flow-negative building', () => {
    h.summary = { cost: 500000, equity: 0, netRental: -30000, multi: true, count: 1 }
    render(<HousingCostsBody />)
    expect(screen.getByText('Net rental')).toBeTruthy()
    expect(screen.getByText('$-30000')).toBeTruthy()
  })

  it('renders a calm empty state when there are no properties', () => {
    h.properties = []
    h.summary = { cost: 0, equity: 0, netRental: 0, multi: false, count: 0 }
    render(<HousingCostsBody />)
    expect(screen.getByText('No properties yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<HousingCostsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

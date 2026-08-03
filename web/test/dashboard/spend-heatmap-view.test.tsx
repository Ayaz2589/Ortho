// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SpendHeatmap } from '@/components/dashboard/SpendHeatmap'

// Spec 037: the net-summary spend heatmap renders one titled cell per day in the
// window, labelled as an image for assistive tech.

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string) => k,
    formatMoney: (c: number) => `$${c}`,
    locale: 'en-US',
    transactions: [
      { id: 'a', kind: 'expense', amount_cents: 10000, date: '2026-08-05T12:00:00.000Z' },
    ],
  }),
}))

afterEach(cleanup)

const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }

describe('SpendHeatmap', () => {
  it('renders a labelled grid with one cell per calendar day', () => {
    const { container } = render(<SpendHeatmap interval={AUG} />)
    expect(screen.getByRole('img', { name: 'Daily spending' })).toBeTruthy()
    // 31 titled day cells (leading weekday spacers carry no title).
    expect(container.querySelectorAll('[title]')).toHaveLength(31)
  })
})

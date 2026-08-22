// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SpendHeatmap } from '@/components/dashboard/SpendHeatmap'

// Dashboard polish: the spend heatmap is a calendar-style grid whose days are
// CLICKABLE — each is a button, and clicking one reveals a tooltip with that day's
// date + amount. It stays labelled as a group for assistive tech.

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

// August 2026 — Aug 1 is a Saturday, so the grid leads with 6 weekday spacers.
const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }

describe('SpendHeatmap', () => {
  it('renders a labelled calendar with one clickable button per calendar day', () => {
    render(<SpendHeatmap interval={AUG} />)
    expect(screen.getByRole('group', { name: 'Daily spending' })).toBeTruthy()
    // 31 day buttons (weekday labels are not buttons; spacers are inert).
    expect(screen.getAllByRole('button')).toHaveLength(31)
  })

  it('reveals a tooltip with the day amount when a day is clicked', () => {
    render(<SpendHeatmap interval={AUG} />)
    // Aug 5 is the 5th day button; it carries the $100.00 (10000¢) expense.
    fireEvent.click(screen.getAllByRole('button')[4])
    const tip = screen.getByTestId('heatmap-tooltip')
    expect(tip.textContent).toContain('$10000')
  })

  it('does not show a tooltip until a day is chosen', () => {
    render(<SpendHeatmap interval={AUG} />)
    expect(screen.queryByTestId('heatmap-tooltip')).toBeNull()
  })
})

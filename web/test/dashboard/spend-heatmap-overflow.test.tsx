// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SpendHeatmap } from '@/components/dashboard/SpendHeatmap'

// Spec 058 — the dashboard's own contribution to the sideways pan.
//
// The heatmap already puts its day grid in an `overflow-x-auto` scroller, on
// the assumption that a long range scrolls INSIDE the widget. But the wrapper
// around it is `inline-flex`, which is shrink-to-fit: it sizes to its content's
// max-content width, so the scroller is never actually constrained — the
// wrapper grows to fit the whole grid and the PAGE scrolls instead of the
// scroller. An `overflow-x-auto` box only contains anything when an ancestor
// gives it a bounded width and it is allowed to shrink to it.

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: [],
    formatMoney: (c: number) => `$${(Math.abs(c) / 100).toFixed(2)}`,
    t: (k: string) => k,
    locale: 'en-US',
  }),
}))

afterEach(cleanup)

// A 3-month window — long enough that the grid is far wider than a phone.
const interval = { start: new Date(2026, 5, 1), end: new Date(2026, 8, 1) }

describe('SpendHeatmap horizontal containment', () => {
  it('bounds its wrapper to the available width instead of sizing to content', () => {
    const { container } = render(<SpendHeatmap interval={interval} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper, 'heatmap rendered nothing').not.toBeNull()
    expect(wrapper.className).not.toMatch(/\binline-flex\b/)
    expect(wrapper.className).toMatch(/\bmax-w-full\b/)
  })

  it('lets the day-grid scroller shrink, so the grid scrolls and the page does not', () => {
    const { container } = render(<SpendHeatmap interval={interval} />)
    const scroller = container.querySelector('.overflow-x-auto') as HTMLElement
    expect(scroller, 'the day grid should sit in a horizontal scroller').not.toBeNull()
    expect(scroller.className).toMatch(/\bmin-w-0\b/)
  })
})

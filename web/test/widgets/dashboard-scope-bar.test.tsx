// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import DashboardPage from '@/app/(app)/dashboard/page'

// Spec 035 (Section 0): the OVERVIEW gains a shared time-scope bar — the revived
// MonthPicker plus the relative-range segmented control (decision O-1 = include
// both) plus the active period caption. Reports mode is untouched: it shows no
// scope bar. The board itself is stubbed here; this suite is about the chrome the
// foundation wires in.

// ~13 months of data so every relative range is available and the month picker
// has months to list.
const MONTHS = [
  '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  '2026-06', '2026-07', '2026-08',
]
const TXNS = MONTHS.map((m, i) => ({ id: `t${i}`, date: `${m}-15T12:00:00.000Z` }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k, locale: 'en-US', transactions: TXNS }),
}))
// Keep the suite focused on the scope chrome — stub the heavy children.
vi.mock('@/components/widgets/WidgetBoard', () => ({
  WidgetBoard: () => <div data-testid="widget-board" />,
}))
vi.mock('@/components/dashboard/ReportsView', () => ({
  ReportsView: () => <div data-testid="reports-view" />,
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('dashboard overview scope bar', () => {
  it('renders the MonthPicker on the overview', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Pick a month')).toBeTruthy()
  })

  it('renders the relative-range control on the overview (O-1)', () => {
    render(<DashboardPage />)
    // The segmented range control shows its compact labels; several distinct
    // options prove it is the range control, not incidental text.
    expect(screen.getByText('3M')).toBeTruthy()
    expect(screen.getByText('6M')).toBeTruthy()
    expect(screen.getByText('1Y')).toBeTruthy()
  })

  it('shows the active period caption', () => {
    render(<DashboardPage />)
    // Default relative range → the long label; the caption, not the segmented
    // control (which shows the compact "Month").
    expect(screen.getByText('This month')).toBeTruthy()
  })

  it('does NOT render the scope bar in Reports mode', () => {
    render(<DashboardPage />)
    // Sanity: overview shows it first.
    expect(screen.getByText('Pick a month')).toBeTruthy()
    fireEvent.click(screen.getByText('Reports'))
    // Reports mode: the board and its scope bar are gone.
    expect(screen.getByTestId('reports-view')).toBeTruthy()
    expect(screen.queryByText('Pick a month')).toBeNull()
    expect(screen.queryByText('3M')).toBeNull()
    expect(screen.queryByText('This month')).toBeNull()
  })
})

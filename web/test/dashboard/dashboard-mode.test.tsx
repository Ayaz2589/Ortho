// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mode toggle at the top of Dashboard (spec 027): switching Overview↔Reports swaps
// content IN PLACE (no navigation). Spec 034: the Overview is now a single
// <WidgetBoard/> (one composition — no mobile/desktop branch). This test isolates
// the page's mode-branching wiring; the board and reports surface are stubbed.

// Spec 035: the overview now wraps the board in a DashboardScopeProvider, which
// reads `transactions`/`locale` from the store — supply them (the real store
// always does). This test still isolates the mode-branching wiring.
vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k, locale: 'en-US', transactions: [] }),
}))
vi.mock('@/components/widgets/WidgetBoard', () => ({
  WidgetBoard: () => <div data-testid="widget-board">board</div>,
}))
vi.mock('@/components/dashboard/ReportsView', () => ({
  ReportsView: () => <div data-testid="reports-surface">reports</div>,
}))

import DashboardPage from '@/app/(app)/dashboard/page'

afterEach(cleanup)

describe('Dashboard mode toggle', () => {
  it('shows the widget board by default and swaps to the Reports surface in place', async () => {
    render(<DashboardPage />)
    // Overview default: the widget board is present, no reports surface.
    expect(screen.getByTestId('widget-board')).toBeTruthy()
    expect(screen.queryByTestId('reports-surface')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    // Reports mode: reports surface present, board gone (swapped in place).
    expect(screen.getByTestId('reports-surface')).toBeTruthy()
    expect(screen.queryByTestId('widget-board')).toBeNull()

    // Back to Overview: board returns, reports surface gone.
    await userEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByTestId('widget-board')).toBeTruthy()
    expect(screen.queryByTestId('reports-surface')).toBeNull()
  })
})

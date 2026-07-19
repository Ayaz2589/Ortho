// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mode toggle at the top of Dashboard (spec 027): switching Overview↔Reports swaps
// content IN PLACE (no navigation), and returning to Overview leaves it unchanged.
// The overview cards + heavy hooks are stubbed so this test isolates the page's
// mode-branching wiring (FR-001, FR-002, FR-013).

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false }))
vi.mock('@/lib/useDashboardRange', () => ({
  useDashboardScope: () => ({
    now: new Date(),
    range: 'thisMonth',
    rangeOptions: ['thisMonth'],
    setRange: () => {},
    selectedMonth: null,
    availableMonths: [],
    setMonth: () => {},
    clearMonth: () => {},
    interval: { start: new Date(), end: new Date() },
    referenceDate: new Date(),
    periodLabel: 'This month',
    isSpecificMonth: false,
  }),
}))
vi.mock('@/components/web/DashboardDesktop', () => ({ DashboardDesktop: () => null }))
vi.mock('@/components/dashboard/ReportsView', () => ({
  ReportsView: () => <div data-testid="reports-surface">reports</div>,
}))

// Stub every overview card so no store data is needed. vi.mock factories are
// hoisted above module scope, so each inlines its own stub (no shared reference).
vi.mock('@/components/dashboard/MonthSummaryCard', () => ({ MonthSummaryCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/InsightsCardStack', () => ({ InsightsCardStack: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/BudgetProgressCard', () => ({ BudgetProgressCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/SpendByCategoryCard', () => ({ SpendByCategoryCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/PerOwnerBreakdownCard', () => ({ PerOwnerBreakdownCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/TopMerchantsCard', () => ({ TopMerchantsCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/HousingSnapshotCard', () => ({ HousingSnapshotCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/DailySpendTrendCard', () => ({ DailySpendTrendCard: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/MonthPicker', () => ({ MonthPicker: () => <div data-testid="overview-card" /> }))
vi.mock('@/components/dashboard/RangePicker', () => ({ RangePicker: () => <div data-testid="overview-card" /> }))

import DashboardPage from '@/app/(app)/dashboard/page'

afterEach(cleanup)

describe('Dashboard mode toggle', () => {
  it('shows Overview by default and swaps to the Reports surface in place', async () => {
    render(<DashboardPage />)
    // Overview default: cards present, no reports surface
    expect(screen.getAllByTestId('overview-card').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('reports-surface')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    // Reports mode: reports surface present, overview cards gone (swapped in place)
    expect(screen.getByTestId('reports-surface')).toBeTruthy()
    expect(screen.queryByTestId('overview-card')).toBeNull()

    // Back to Overview: unchanged (cards return, reports surface gone)
    await userEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getAllByTestId('overview-card').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('reports-surface')).toBeNull()
  })
})

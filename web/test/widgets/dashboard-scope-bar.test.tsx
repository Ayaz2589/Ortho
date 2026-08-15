// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DashboardPage from '@/app/(app)/dashboard/page'

// Spec 035 + 036: the dashboard is a single view (the Overview/Reports mode toggle
// was removed when Reports became the savings-trends widget). It always shows the
// shared time-scope bar — the revived MonthPicker + relative-range control + the
// active period caption. The heavy children (hero + board) are stubbed; this suite
// is about the scope chrome the overview wires in.

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
vi.mock('@/components/dashboard/NetSummaryHero', () => ({
  NetSummaryHero: () => <div data-testid="net-hero" />,
}))
vi.mock('@/components/dashboard/MemberScopePicker', () => ({
  MemberScopePicker: () => <div data-testid="member-scope-picker" />,
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('dashboard scope bar', () => {
  it('renders the MonthPicker', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Pick a month')).toBeTruthy()
  })

  it('renders the relative-range control (O-1)', () => {
    render(<DashboardPage />)
    // The segmented range control shows its compact labels; several distinct
    // options prove it is the range control, not incidental text.
    expect(screen.getByText('3M')).toBeTruthy()
    expect(screen.getByText('6M')).toBeTruthy()
    expect(screen.getByText('1Y')).toBeTruthy()
  })

  it('does NOT duplicate the period caption in the bar (the hero shows it)', () => {
    render(<DashboardPage />)
    // Spec 037: the period label lives on the net-summary hero only, so the bar
    // carries controls without a redundant "This month" caption.
    expect(screen.queryByText('This month')).toBeNull()
  })

  it('renders the net-summary hero above the board', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('net-hero')).toBeTruthy()
    expect(screen.getByTestId('widget-board')).toBeTruthy()
  })

  it('places the scope controls inline with the title (right on desktop, own line on mobile)', () => {
    render(<DashboardPage />)
    // The header row stacks on phones (flex-col) and puts the controls to the
    // right of the title on desktop (sm:flex-row + sm:justify-between).
    const title = screen.getByRole('heading', { name: 'Dashboard' })
    const header = title.parentElement!
    expect(header.className).toContain('flex-col')
    expect(header.className).toContain('sm:flex-row')
    expect(header.className).toContain('sm:justify-between')
    // Range + month controls: one right-aligned line on desktop (sm:flex-nowrap +
    // sm:shrink-0), but they WRAP on a narrow phone so they never overflow the
    // viewport (flex-wrap) — the month picker drops below the range control.
    const controls = screen.getByText('Pick a month').closest('.sm\\:shrink-0')
    expect(controls).not.toBeNull()
    expect(controls!.className).toContain('items-center')
    expect(controls!.className).toContain('flex-wrap')
    expect(controls!.className).toContain('sm:flex-nowrap')
  })
})

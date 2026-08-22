// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { GoalsPanel } from '@/components/widgets/panels/GoalsPanel'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { goalPacing, goalProgress } from '@/lib/finance/goals'

// Spec 057 US9 (goals): the trajectory and the projected arrival date, neither
// of which the card shows. Honours time only (`now`, for pacing) — goals span
// their whole lifetime, not the dashboard's scope window — so, like home
// equity (D5), no caption is declared and the panel is rendered inside a bare
// WidgetPanel with no scope providers. Goals' person-scoping is a separate
// open question this panel deliberately does not settle (contracts/follow-up
// -brief.md), so it reads the full household goal list, unscoped by person.

const h = vi.hoisted(() => ({
  goals: [] as unknown[],
  contributions: [] as unknown[],
  scope: {} as { now: Date },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    goals: h.goals,
    goalContributions: h.contributions,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

const NOW = new Date('2026-06-15T12:00:00.000Z')

function renderPanel() {
  return render(
    <WidgetPanel open title="Goals" onClose={() => {}}>
      <GoalsPanel />
    </WidgetPanel>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  h.scope = { now: NOW }
  h.goals = []
  h.contributions = []
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('GoalsPanel', () => {
  it('shows a calm empty state, consistent with the card, when there are no goals', () => {
    renderPanel()
    expect(screen.getByText('No goals yet.')).toBeTruthy()
  })

  it('shows the trajectory (a monthly breakdown), not just the current total, for a goal with history', () => {
    h.goals = [
      { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 200000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]
    h.contributions = [
      { id: 'c1', goal_id: 'g1', amount_cents: 50000, date: '2026-01-10' },
      { id: 'c2', goal_id: 'g1', amount_cents: 50000, date: '2026-03-10' },
    ]
    renderPanel()

    // Both contributing months appear as distinct rows — the trajectory, not
    // only the $1000.00-of-$2000.00 headline the card already shows.
    expect(screen.getByText('Jan 2026')).toBeTruthy()
    expect(screen.getByText('Mar 2026')).toBeTruthy()
    expect(screen.getByText('$1000.00 of $2000.00')).toBeTruthy()
  })

  it('phrases the arrival date as a projection at the current pace, never as a stated fact, and shows it on-pace with no alarm color', () => {
    h.goals = [
      {
        id: 'g1',
        name: 'New car',
        kind: 'savings',
        target_cents: 120000,
        target_date: '2026-12-01',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    // $20,000/mo · at that pace target is reached comfortably ahead of the target date.
    h.contributions = [
      { id: 'c1', goal_id: 'g1', amount_cents: 20000, date: '2026-01-10' },
      { id: 'c2', goal_id: 'g1', amount_cents: 20000, date: '2026-02-10' },
      { id: 'c3', goal_id: 'g1', amount_cents: 20000, date: '2026-03-10' },
    ]
    renderPanel()

    // Projection language, not a bare/asserted date.
    const projection = screen.getByText(/Projected to reach \$1200\.00 around .+ at the current pace\./)
    expect(projection).toBeTruthy()
    expect(projection.style.color).not.toBe('var(--accent)')

    // On pace toward the stated target date — reused from the card's own vocabulary.
    expect(screen.getByText('On pace · due December 2026')).toBeTruthy()
  })

  it('shows being behind pace calmly (a sand accent), never as a red alarm', () => {
    h.goals = [
      {
        id: 'g1',
        name: 'Vacation',
        kind: 'savings',
        target_cents: 500000,
        target_date: '2026-07-01',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    // Far short of the pace a July target needs.
    h.contributions = [{ id: 'c1', goal_id: 'g1', amount_cents: 1000, date: '2026-01-10' }]
    renderPanel()

    const pace = screen.getByText(/Behind pace — set aside/)
    expect(pace.style.color).toBe('var(--accent)')
    // Never a literal red anywhere in this panel's markup.
    expect(document.querySelector('[style*="red"]')).toBeNull()
  })

  it('sums what every dated, unreached goal needs monthly to stay on time', () => {
    h.goals = [
      {
        id: 'g1',
        name: 'Vacation',
        kind: 'savings',
        target_cents: 500000,
        target_date: '2026-07-01',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'g2',
        name: 'New car',
        kind: 'savings',
        target_cents: 120000,
        target_date: '2026-12-01',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    h.contributions = [
      { id: 'c1', goal_id: 'g1', amount_cents: 1000, date: '2026-01-10' },
      { id: 'c2', goal_id: 'g2', amount_cents: 20000, date: '2026-01-10' },
    ]
    renderPanel()

    const g1 = h.goals[0] as { target_cents: number; target_date: string; created_at: string }
    const g2 = h.goals[1] as { target_cents: number; target_date: string; created_at: string }
    const c1 = h.contributions[0] as { amount_cents: number }
    const c2 = h.contributions[1] as { amount_cents: number }
    const p1 = goalPacing(g1.target_cents, g1.target_date, g1.created_at, goalProgress(g1.target_cents, [c1]).saved_cents, NOW)
    const p2 = goalPacing(g2.target_cents, g2.target_date, g2.created_at, goalProgress(g2.target_cents, [c2]).saved_cents, NOW)
    const expectedTotal = (p1.suggested_monthly_cents + p2.suggested_monthly_cents) / 100

    expect(screen.getByText(`$${expectedTotal.toFixed(2)}`)).toBeTruthy()
    expect(screen.getByText('a month, in total, to keep every goal on time')).toBeTruthy()
  })

  it('routes each goal to its own existing detail page rather than duplicating it', () => {
    h.goals = [
      { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 200000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'g2', name: 'New laptop', kind: 'savings', target_cents: 50000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]
    h.contributions = []
    renderPanel()

    const link1 = screen.getByRole('link', { name: /Emergency fund/ })
    expect(link1.getAttribute('href')).toBe('/planning/goals?id=g1')
    const link2 = screen.getByRole('link', { name: /New laptop/ })
    expect(link2.getAttribute('href')).toBe('/planning/goals?id=g2')
  })

  it('honours only time (now, for pacing) — no scope caption is declared', () => {
    h.goals = [
      { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 200000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]
    renderPanel()
    expect(screen.queryByTestId('panel-caption')).toBeNull()
  })
})

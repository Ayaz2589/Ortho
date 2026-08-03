// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'

// Widget 4 (goals): saved-of-target progress per goal via goalProgress /
// goalPacing / contributionsByGoal. Rows borrow the GoalCard vocabulary — sage
// progress bar, "{0} to go" / "Reached", a calm pace line (never red).

const h = vi.hoisted(() => ({
  goals: [] as unknown[],
  contributions: [] as unknown[],
  scope: {} as { now: Date },
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    locale: 'en-US',
    goals: h.goals,
    goalContributions: h.contributions,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

beforeEach(() => {
  h.scope = { now: new Date(2026, 7, 15, 12) }
  h.goals = [
    { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 100000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'g2', name: 'New laptop', kind: 'savings', target_cents: 50000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
  ]
  h.contributions = [
    { id: 'c1', goal_id: 'g1', amount_cents: 60000, date: '2026-02-01' },
    { id: 'c2', goal_id: 'g2', amount_cents: 50000, date: '2026-02-01' },
  ]
})
afterEach(cleanup)

describe('GoalsBody', () => {
  it('renders each goal with saved-of-target and a progress bar', () => {
    render(<GoalsBody />)
    expect(screen.getByText('Emergency fund')).toBeTruthy()
    expect(screen.getByText('New laptop')).toBeTruthy()
    expect(screen.getByText('$40000 to go')).toBeTruthy() // 100000 − 60000
    expect(screen.getByText('Reached')).toBeTruthy() // laptop 50000/50000
    const bars = screen.getAllByRole('progressbar')
    expect(bars[0].getAttribute('aria-valuenow')).toBe('60')
    expect(bars[1].getAttribute('aria-valuenow')).toBe('100')
  })

  it('renders a calm empty state when there are no goals', () => {
    h.goals = []
    render(<GoalsBody />)
    expect(screen.getByText('No goals yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<GoalsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

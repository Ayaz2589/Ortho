// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'

// Widget 4 (savings & debts): spec 059 US5 brings this cell onto the same
// vocabulary as the Planning section — a headline chosen by kind, and a bar
// whose DIRECTION carries the type. Deliberately nothing more: this is a fixed,
// uniform grid cell, so no aggregate header, no ETA line, no disclosure and no
// chart (spec 059 research R6). The depth lives in the panel behind it.

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
  it('leads a savings row with what has accumulated', () => {
    render(<GoalsBody />)
    expect(screen.getByText('Emergency fund')).toBeTruthy()
    expect(screen.getByText('$60000 saved')).toBeTruthy()
  })

  it('leads a debt row with what remains', () => {
    h.goals = [
      { id: 'g3', name: 'Credit card', kind: 'debt_payoff', target_cents: 100000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]
    h.contributions = [{ id: 'c3', goal_id: 'g3', amount_cents: 40000, date: '2026-02-01' }]
    render(<GoalsBody />)
    expect(screen.getByText('$60000 left')).toBeTruthy()
  })

  it('gives each kind its own direction of travel', () => {
    h.goals = [
      { id: 'g1', name: 'Emergency fund', kind: 'savings', target_cents: 100000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'g3', name: 'Credit card', kind: 'debt_payoff', target_cents: 100000, target_date: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]
    h.contributions = [
      { id: 'c1', goal_id: 'g1', amount_cents: 60000, date: '2026-02-01' },
      { id: 'c3', goal_id: 'g3', amount_cents: 40000, date: '2026-02-01' },
    ]
    render(<GoalsBody />)
    expect(screen.getByTestId('widget-fill-saved').style.left).toBe('0px')
    expect(screen.getByTestId('widget-fill-remaining').style.right).toBe('0px')
  })

  it('keeps the progress bars accessible', () => {
    render(<GoalsBody />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars[0].getAttribute('aria-valuenow')).toBe('60')
    expect(bars[1].getAttribute('aria-valuenow')).toBe('100')
  })

  it('stays a glance — no ETA, no disclosure, no chart in the cell', () => {
    render(<GoalsBody />)
    expect(screen.queryByTestId('sd-disclosure')).toBeNull()
    expect(screen.queryByText(/more payments|more deposits|Clear by|Funded by/)).toBeNull()
  })

  it('renders a calm empty state when there is nothing yet', () => {
    h.goals = []
    render(<GoalsBody />)
    expect(screen.getByText('Nothing here yet.')).toBeTruthy()
  })

  it('fills its cell (h-full)', () => {
    const { container } = render(<GoalsBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })
})

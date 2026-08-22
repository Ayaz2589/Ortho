// @vitest-environment jsdom
// spec 041 — Financial Health widget body: scored state (score + band + action),
// profile-null CTA, baseline-vs-now movement line, and the never-red guarantee.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FinancialHealthBody } from '@/components/widgets/bodies/FinancialHealthBody'

type App = Record<string, unknown>
const h = vi.hoisted(() => ({ app: {} as App, scope: {} as { now: Date } }))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${c}`,
    locale: 'en-US',
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    userFixedCosts: [],
    userDimensionWeights: [],
    healthSnapshots: [],
    userFinancialProfile: null,
    ...h.app,
  }),
}))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({
  useDashboardScopeContext: () => h.scope,
}))

const profile = {
  id: 'p', user_id: 'u', monthly_income_cents: 400000, income_is_variable: false,
  income_low_estimate_cents: null, housing_type: 'rent', housing_cost_cents: 200000,
  housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: '1_3m',
  created_at: 'x', updated_at: 'x',
}

beforeEach(() => {
  h.scope = { now: new Date(2026, 7, 15, 12) }
  h.app = {}
})
afterEach(cleanup)

describe('FinancialHealthBody', () => {
  it('shows the score, band label and one next step when a profile exists', () => {
    h.app = { userFinancialProfile: profile }
    render(<FinancialHealthBody />)
    // committed 200000/400000 → cash 100, commit 100; safety 60; savings 70; plan 50 → mean 76
    expect(screen.getByText('76')).toBeTruthy()
    expect(screen.getByText('Steady')).toBeTruthy()
    // lowest weighted contribution is plan_engagement → its action line
    expect(screen.getByText(/Set a budget for one category/)).toBeTruthy()
  })

  it('shows a set-up prompt (no leaning on a number) when there is no profile', () => {
    h.app = { userFinancialProfile: null }
    render(<FinancialHealthBody />)
    expect(screen.getByText('Set up your financial profile')).toBeTruthy()
  })

  it('shows the baseline-to-now movement when the band has changed', () => {
    h.app = {
      userFinancialProfile: profile,
      healthSnapshots: [{ id: 's', user_id: 'u', score: 45, band: 'building', created_at: '2026-03-01T00:00:00Z' }],
    }
    render(<FinancialHealthBody />)
    expect(screen.getByText(/Building → Steady since/)).toBeTruthy()
  })

  it('never renders the score/band in a red/destructive color', () => {
    h.app = { userFinancialProfile: profile }
    const { container } = render(<FinancialHealthBody />)
    const html = container.innerHTML
    expect(html).not.toContain('--destructive')
    expect(html).not.toContain('text-red')
    expect(html).not.toContain('bg-red')
    // the score uses the sand accent ramp
    expect(html).toContain('var(--accent)')
  })

  it('fills its cell (h-full)', () => {
    h.app = { userFinancialProfile: profile }
    const { container } = render(<FinancialHealthBody />)
    expect((container.firstChild as HTMLElement).className).toContain('h-full')
  })

  // spec 044 US3 — routine awareness citation
  it('cites contributing routine labels when the dimension has real coverage', () => {
    h.app = {
      userFinancialProfile: profile,
      transactions: [
        { id: 't1', household_id: 'h', merchant: 'm', category: 'groceries', kind: 'expense', amount_cents: 100000, source: 's', date: '2026-07-01', created_by: 'u', created_at: 'x', updated_at: 'x', owner_ids: ['u'], shares: { u: 100000 } },
      ],
      routines: [
        {
          routineKey: 'rc:netflix', kind: 'recurring_charge', merchantKey: 'netflix', merchantLabel: 'Netflix',
          category: 'streaming', weekday: null, hourBucket: null, personId: null,
          typicalAmountCents: 60000, amountVarianceCents: 0, occurrenceCount: 1,
          firstSeenAt: '2026-06-01', lastSeenAt: '2026-07-01', confidence: 90,
          derivedStatus: 'recognized', evidenceTransactionIds: [], status: 'confirmed', label: null,
        },
      ],
    }
    render(<FinancialHealthBody />)
    expect(screen.getByText(/Routine awareness reflects: Netflix/)).toBeTruthy()
  })

  it('shows a calm "not enough routines" line when there is no routine data', () => {
    h.app = { userFinancialProfile: profile, routines: [] }
    render(<FinancialHealthBody />)
    expect(screen.getByText(/Not enough recognized routines yet/)).toBeTruthy()
  })
})

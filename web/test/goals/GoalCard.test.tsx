// @vitest-environment jsdom
// Spec 027 (US1/US2) — the calm progress view: money-first, an accessible
// progress bar, and (for dated goals) a pace line that is NEVER red.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from '../helpers/supabase-mock'
import type { Goal, GoalContribution } from '@/lib/types'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import { GoalCard } from '@/components/goals/GoalCard'

function minimalDataset(): SupabaseMockDataset {
  return {
    authUser: { id: 'u', email: 'a@b.com' },
    tables: {
      users: [{ id: 'u', name: 'A', initial: 'A', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh', user_id: 'u', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [{ id: 'p', household_id: 'hh', name: 'A', initial: 'A', color_key: 'sage', linked_user_id: 'u', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' }],
      households: [{ id: 'hh', owner_id: 'u', name: 'H', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      entitlements: [makeEntitlement()], linked_institutions: [], linked_accounts: [],
      goals: [], goal_contributions: [],
    },
    rpc: { ensure_entitlement: makeEntitlement() },
  }
}

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1', household_id: 'hh', name: 'Trip', kind: 'savings',
  target_cents: 200000, target_date: null, linked_account_id: null, linked_category: null,
  created_by: 'u', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})
const contrib = (amount: number): GoalContribution => ({
  id: `c${amount}`, goal_id: 'g1', amount_cents: amount, date: '2026-02-01', note: null, created_by: 'u', created_at: '2026-02-01T00:00:00Z',
})

async function renderCard(ui: React.ReactElement) {
  h.mock = makeSupabaseMock(minimalDataset())
  const r = render(<AppStateProvider>{ui}</AppStateProvider>)
  // Wait until the provider has booted (formatMoney available → money renders).
  await waitFor(() => expect(r.container.textContent).toMatch(/\$/))
  return r
}

beforeEach(() => { primeFxCache(); stubNoNetwork() })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('GoalCard progress view', () => {
  it('shows saved of target and an accessible progress bar', async () => {
    const { container, getByRole } = await renderCard(
      <GoalCard goal={goal()} contributions={[contrib(50000), contrib(25000)]} />
    )
    expect(container.textContent).toContain('$750.00')
    expect(container.textContent).toContain('$2,000.00')
    const bar = getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('38') // 37.5% → 38
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('shows reached state at/above target', async () => {
    const { container, getByRole } = await renderCard(
      <GoalCard goal={goal()} contributions={[contrib(200000)]} />
    )
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    expect(container.textContent?.toLowerCase()).toContain('reached')
  })

  it('a dated, behind goal shows a calm pace line that is never red', async () => {
    const now = new Date('2026-07-01T12:00:00Z')
    const { container } = await renderCard(
      <GoalCard
        goal={goal({ target_cents: 1200000, target_date: '2027-01-01' })}
        contributions={[contrib(100000)]}
        now={now}
      />
    )
    // Behind on pace, but rendered in the calm accent — never the destructive/red token.
    expect(container.innerHTML).not.toContain('--destructive')
  })
})

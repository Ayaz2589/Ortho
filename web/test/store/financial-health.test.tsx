// @vitest-environment jsdom
// spec 041 — store-level Financial Health behavior: user-scoped bootstrap of the
// profile/fixed-costs/weights/snapshots, fail-open when the tables are missing
// (deploy-before-migrate), and the saveFinancialHealth submit sequence + snapshot.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

const { impact, notification } = vi.hoisted(() => ({
  impact: vi.fn(() => Promise.resolve()),
  notification: vi.fn(() => Promise.resolve()),
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, notification },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Warning: 'WARNING' },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

import { AppStateProvider, useApp } from '@/lib/store'

function dataset(overrides: Record<string, unknown[]> = {}) {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [],
      transaction_shares: [],
      tags: [], transaction_tags: [], cards: [], deposit_accounts: [],
      properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      user_financial_profile: overrides.user_financial_profile ?? [],
      user_fixed_costs: overrides.user_fixed_costs ?? [],
      user_dimension_weights: overrides.user_dimension_weights ?? [],
      financial_health_snapshots: overrides.financial_health_snapshots ?? [],
    },
  }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}
async function renderStore() {
  render(
    <AppStateProvider>
      <Capture />
    </AppStateProvider>
  )
  await waitFor(() => expect(api.loading).toBe(false))
}

describe('store — Financial Health (spec 041)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('bootstraps the user-scoped profile, fixed costs, weights and snapshots from the DB', async () => {
    h.mock = makeSupabaseMock(dataset({
      user_financial_profile: [{
        id: 'p-1', user_id: 'u-me', monthly_income_cents: 400000, income_is_variable: false,
        income_low_estimate_cents: null, housing_type: 'rent', housing_cost_cents: 200000,
        housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: '1_3m',
        created_at: 'x', updated_at: 'x',
      }],
      user_fixed_costs: [{ id: 'c-1', user_id: 'u-me', label: 'Remittance', amount_cents: 50000, kind: 'remittance', created_at: 'x' }],
      user_dimension_weights: [{ id: 'w-1', user_id: 'u-me', dimension: 'safety_net', weight: 5, created_at: 'x' }],
      financial_health_snapshots: [{ id: 's-1', user_id: 'u-me', score: 62, band: 'steady', created_at: 'x' }],
    }))
    await renderStore()
    expect(api.userFinancialProfile?.monthly_income_cents).toBe(400000)
    expect(api.userFixedCosts.map((c) => c.kind)).toEqual(['remittance'])
    expect(api.userDimensionWeights[0].weight).toBe(5)
    expect(api.healthSnapshots[0].band).toBe('steady')
  })

  it('fails open when the tables are missing (profile → null, lists → [])', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: {
        user_financial_profile: { message: 'relation does not exist', code: 'PGRST205' },
        user_fixed_costs: { message: 'relation does not exist', code: 'PGRST205' },
        user_dimension_weights: { message: 'relation does not exist', code: '42P01' },
        financial_health_snapshots: { message: 'relation does not exist', code: 'PGRST205' },
      },
    })
    await renderStore()
    expect(api.userFinancialProfile).toBeNull()
    expect(api.userFixedCosts).toEqual([])
    expect(api.userDimensionWeights).toEqual([])
    expect(api.healthSnapshots).toEqual([])
    expect(api.error).toBeNull()
  })

  it('saveFinancialHealth persists profile + costs + weights + a snapshot in sequence', async () => {
    await renderStore()
    await act(async () => {
      await api.saveFinancialHealth({
        profile: {
          monthly_income_cents: 300000, income_is_variable: true, income_low_estimate_cents: 250000,
          housing_type: 'rent', housing_cost_cents: 150000, housing_share_fraction: 0.5,
          savings_target_fraction: 0.1, emergency_fund_level: 'none',
        },
        costs: [{ label: 'Remittance', amount_cents: 40000, kind: 'remittance' }],
        weights: [{ dimension: 'cash_flow', weight: 5 }],
        score: 55,
        band: 'building',
      })
    })
    expect(api.userFinancialProfile?.income_low_estimate_cents).toBe(250000)
    expect(api.userFixedCosts[0].kind).toBe('remittance')
    expect(api.userDimensionWeights[0].weight).toBe(5)
    expect(api.healthSnapshots.at(-1)).toMatchObject({ score: 55, band: 'building' })
    expect(h.mock!.callsFor('user_financial_profile').some((c) => c.op === 'upsert')).toBe(true)
    expect(h.mock!.callsFor('user_fixed_costs').some((c) => c.op === 'insert')).toBe(true)
    expect(h.mock!.callsFor('user_dimension_weights').some((c) => c.op === 'insert')).toBe(true)
    expect(h.mock!.callsFor('financial_health_snapshots').some((c) => c.op === 'insert')).toBe(true)
    expect(api.error).toBeNull()
  })

  it('writeHealthSnapshot appends a snapshot', async () => {
    await renderStore()
    await act(async () => { await api.writeHealthSnapshot(80, 'strong') })
    expect(api.healthSnapshots.at(-1)).toMatchObject({ score: 80, band: 'strong' })
  })
})

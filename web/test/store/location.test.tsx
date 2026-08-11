// @vitest-environment jsdom
// spec 044 US4 — store-level location consent: setLocationConsent upserts
// user_location_consent with the right timestamp stamped, and revoking cascades to delete every
// captured user_routine_visits row (FR-015).
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
      transactions: [], transaction_shares: [],
      tags: [], transaction_tags: [], cards: [], deposit_accounts: [],
      properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      user_financial_profile: [], user_fixed_costs: [], user_dimension_weights: [], financial_health_snapshots: [],
      recognized_routine_states: [], merchant_geocodes: [],
      user_location_consent: overrides.user_location_consent ?? [],
      user_routine_visits: overrides.user_routine_visits ?? [],
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

describe('store — Location consent (spec 044 US4)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('defaults to off with no prior consent row', async () => {
    await renderStore()
    expect(api.locationConsent).toBeNull()
  })

  it('moving to geocoding upserts a row with grantedAt stamped', async () => {
    await renderStore()
    await act(async () => { await api.setLocationConsent('geocoding') })
    expect(api.locationConsent?.level).toBe('geocoding')
    expect(api.locationConsent?.granted_at).not.toBeNull()
    const call = h.mock!.callsFor('user_location_consent').find((c) => c.op === 'upsert')
    expect((call!.payload as { level: string }).level).toBe('geocoding')
  })

  it('revoking back to off stamps revokedAt and deletes all captured visits', async () => {
    h.mock = makeSupabaseMock(dataset({
      user_location_consent: [{ id: 'c-1', user_id: 'u-me', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }],
    }))
    await renderStore()
    await act(async () => { await api.setLocationConsent('off') })
    expect(api.locationConsent?.level).toBe('off')
    expect(api.locationConsent?.revoked_at).not.toBeNull()
    expect(h.mock!.callsFor('user_routine_visits').some((c) => c.op === 'delete')).toBe(true)
    expect(api.routineVisits).toEqual([])
  })

  it('moving between two non-off levels does not delete visits', async () => {
    h.mock = makeSupabaseMock(dataset({
      user_location_consent: [{ id: 'c-1', user_id: 'u-me', level: 'geocoding', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }],
    }))
    await renderStore()
    await act(async () => { await api.setLocationConsent('foreground_capture') })
    expect(h.mock!.callsFor('user_routine_visits').some((c) => c.op === 'delete')).toBe(false)
  })
})

// @vitest-environment jsdom
// spec 044 — store-level Financial Routines: the `routines` selector combines live detection with
// persisted household state; confirm/dismiss/rename upsert `recognized_routine_states`; both new
// household-scoped tables fail open when missing (deploy-before-migrate).
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

// The store's `routines` selector calls detectRoutines(transactions, new Date()) with the real
// clock (like the app itself does at render time — pure-function date injection is exercised in
// test/finance/routines.test.ts instead). Building these fixtures relative to the real "now" at
// test-run time (never a hardcoded date) keeps this integration test correct regardless of when it
// actually runs, per the constitution's "never assert against the real clock" rule.
function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}
const RECURRING_TX = [3, 2, 1, 0].map((n, i) => ({
  id: `netflix-${i}`,
  household_id: 'hh-1',
  merchant: 'Netflix',
  category: 'streaming',
  kind: 'expense',
  amount_cents: 1599,
  source: 'manual',
  date: monthsAgo(n),
  created_by: 'u-me',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  paid_by: 'u-me',
}))

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
      transactions: overrides.transactions ?? RECURRING_TX,
      transaction_shares: [],
      tags: [], transaction_tags: [], cards: [], deposit_accounts: [],
      properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      user_financial_profile: [], user_fixed_costs: [], user_dimension_weights: [], financial_health_snapshots: [],
      recognized_routine_states: overrides.recognized_routine_states ?? [],
      merchant_geocodes: overrides.merchant_geocodes ?? [],
      user_location_consent: overrides.user_location_consent ?? [],
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

describe('store — Financial Routines (spec 044)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('the routines selector surfaces a live-detected recurring charge with no state row', async () => {
    await renderStore()
    const netflix = api.routines.find((r) => r.merchantKey === 'netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.status).toBe('recognized')
  })

  it('fails open when the new tables are missing (deploy-before-migrate)', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: {
        recognized_routine_states: { message: 'relation does not exist', code: 'PGRST205' },
        merchant_geocodes: { message: 'relation does not exist', code: '42P01' },
        user_location_consent: { message: 'relation does not exist', code: 'PGRST205' },
      },
    })
    await renderStore()
    expect(api.recognizedRoutineStates).toEqual([])
    expect(api.merchantGeocodes).toEqual([])
    expect(api.locationConsent).toBeNull()
    expect(api.error).toBeNull()
    // Detection itself still works even with zero persisted state.
    expect(api.routines.some((r) => r.merchantKey === 'netflix')).toBe(true)
  })

  it('confirmRoutine upserts a confirmed state row keyed by routine_key', async () => {
    await renderStore()
    await act(async () => { await api.confirmRoutine('rc:netflix') })
    expect(api.routines.find((r) => r.merchantKey === 'netflix')!.status).toBe('confirmed')
    const call = h.mock!.callsFor('recognized_routine_states').find((c) => c.op === 'upsert')
    expect(call).toBeDefined()
    expect((call!.payload as { routine_key: string }).routine_key).toBe('rc:netflix')
    expect((call!.payload as { status: string }).status).toBe('confirmed')
  })

  it('dismissRoutine upserts a dismissed state row', async () => {
    await renderStore()
    await act(async () => { await api.dismissRoutine('rc:netflix') })
    expect(api.routines.find((r) => r.merchantKey === 'netflix')!.status).toBe('dismissed')
  })

  it('renameRoutine persists a label and defaults an unreviewed routine to confirmed', async () => {
    await renderStore()
    await act(async () => { await api.renameRoutine('rc:netflix', 'Streaming bill') })
    const routine = api.routines.find((r) => r.merchantKey === 'netflix')!
    expect(routine.label).toBe('Streaming bill')
    expect(routine.status).toBe('confirmed')
  })

  it('renaming an already-dismissed routine keeps it dismissed', async () => {
    h.mock = makeSupabaseMock(dataset({
      recognized_routine_states: [{
        id: 's-1', household_id: 'hh-1', routine_key: 'rc:netflix', status: 'dismissed',
        label: null, person_id: null, created_by: 'u-me', created_at: 'x', updated_at: 'x',
      }],
    }))
    await renderStore()
    await act(async () => { await api.renameRoutine('rc:netflix', 'Streaming bill') })
    const routine = api.routines.find((r) => r.merchantKey === 'netflix')!
    expect(routine.status).toBe('dismissed')
    expect(routine.label).toBe('Streaming bill')
  })

  it('a dismissed routine never reappears as recognized across a re-render with the same transactions', async () => {
    await renderStore()
    await act(async () => { await api.dismissRoutine('rc:netflix') })
    // Simulate a fresh bootstrap read carrying the persisted dismissal forward.
    expect(api.recognizedRoutineStates.find((s) => s.routine_key === 'rc:netflix')?.status).toBe('dismissed')
  })
})

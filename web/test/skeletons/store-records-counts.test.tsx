// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'
import { readSkeletonCount } from '@/lib/skeletonCounts'

// Swap the store's client for the in-memory mock (see test/store.test.tsx).
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

// Known collection sizes: 2 transactions, 3 goals, 1 property, 4 tags.
function dataset() {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [
        { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        { id: 'tx-1', household_id: 'hh-1', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: 5000, source: 'Checking', date: '2026-06-10T12:00:00Z', created_by: 'u-me', created_at: '2026-06-10T12:00:00Z', updated_at: '2026-06-10T12:00:00Z' },
        { id: 'tx-2', household_id: 'hh-1', merchant: 'Whole Foods', category: 'groceries', kind: 'expense', amount_cents: 3200, source: 'Checking', date: '2026-06-11T12:00:00Z', created_by: 'u-me', created_at: '2026-06-11T12:00:00Z', updated_at: '2026-06-11T12:00:00Z' },
      ],
      transaction_shares: [],
      cards: [],
      properties: [
        { id: 'prop-1', household_id: 'hh-1', kind: 'primary_residence', name: 'Home', created_at: '2026-01-01T00:00:00Z' },
      ],
      mortgage_info: [],
      lease_info: [],
      units: [],
      rental_payments: [],
      budgets: [],
      goals: [
        { id: 'g-1', household_id: 'hh-1', name: 'Emergency fund', kind: 'savings', target_cents: 100000, target_date: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'g-2', household_id: 'hh-1', name: 'Vacation', kind: 'savings', target_cents: 50000, target_date: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'g-3', household_id: 'hh-1', name: 'Car', kind: 'savings', target_cents: 800000, target_date: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      goal_contributions: [],
      linked_institutions: [],
      linked_accounts: [],
      tags: [
        { id: 't-1', household_id: 'hh-1', name: 'work', created_at: '2026-01-01T00:00:00Z' },
        { id: 't-2', household_id: 'hh-1', name: 'reimbursable', created_at: '2026-01-01T00:00:00Z' },
        { id: 't-3', household_id: 'hh-1', name: 'vacation', created_at: '2026-01-01T00:00:00Z' },
        { id: 't-4', household_id: 'hh-1', name: 'subscription', created_at: '2026-01-01T00:00:00Z' },
      ],
      transaction_tags: [],
    },
  }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

describe('store records skeleton counts after a successful load (spec 032)', () => {
  beforeEach(() => {
    localStorage.clear()
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('persists the item count of each dynamic collection', async () => {
    render(
      <AppStateProvider>
        <Capture />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))

    // Sanity: the store actually loaded the data.
    expect(api.transactions).toHaveLength(2)
    expect(api.goals).toHaveLength(3)

    // The remembered counts now reflect the loaded sizes (fallback -1 would only
    // appear if nothing was written).
    expect(readSkeletonCount('transactions', -1)).toBe(2)
    expect(readSkeletonCount('goals', -1)).toBe(3)
    expect(readSkeletonCount('housing', -1)).toBe(1)
    expect(readSkeletonCount('tags', -1)).toBe(4)
  })
})

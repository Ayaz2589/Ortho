// @vitest-environment jsdom
// spec 033 — store-level deposit account behavior: rehydration from
// deposit_accounts table, optimistic addDepositAccount (create), and
// deleteDepositAccount with rollback. Mirrors the cards pattern.
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
      tags: [],
      transaction_tags: [],
      cards: [],
      deposit_accounts: overrides.deposit_accounts ?? [],
      properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
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

describe('store — deposit accounts (spec 033)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('bootstraps depositAccounts from the DB in creation order', async () => {
    h.mock = makeSupabaseMock(dataset({
      deposit_accounts: [
        { id: 'da-1', household_id: 'hh-1', name: 'Chase Checking', created_at: '2026-01-01T00:00:00Z' },
        { id: 'da-2', household_id: 'hh-1', name: 'Joint Savings', created_at: '2026-01-02T00:00:00Z' },
      ],
    }))
    await renderStore()
    expect(api.depositAccounts.map((a) => a.name)).toEqual(['Chase Checking', 'Joint Savings'])
  })

  it('bootstraps as empty when deposit_accounts table is missing (fail-open, PGRST205)', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: { deposit_accounts: { message: 'relation does not exist', code: 'PGRST205' } },
    })
    await renderStore()
    expect(api.depositAccounts).toEqual([])
    expect(api.error).toBeNull()
  })

  it('addDepositAccount inserts optimistically and persists to Supabase', async () => {
    await renderStore()
    await act(async () => { api.addDepositAccount('Chase Checking') })
    expect(api.depositAccounts).toHaveLength(1)
    expect(api.depositAccounts[0].name).toBe('Chase Checking')
    await waitFor(() =>
      expect(h.mock!.callsFor('deposit_accounts').some((c) => c.op === 'insert')).toBe(true)
    )
    expect(api.error).toBeNull()
  })

  it('addDepositAccount rolls back on server error', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { deposit_accounts: 'RLS denied' } })
    await renderStore()
    await act(async () => { api.addDepositAccount('Chase Checking') })
    await waitFor(() => expect(api.error).toBeTruthy())
    expect(api.depositAccounts).toHaveLength(0)
  })

  it('deleteDepositAccount removes optimistically and persists to Supabase', async () => {
    h.mock = makeSupabaseMock(dataset({
      deposit_accounts: [
        { id: 'da-1', household_id: 'hh-1', name: 'Chase Checking', created_at: '2026-01-01T00:00:00Z' },
      ],
    }))
    await renderStore()
    expect(api.depositAccounts).toHaveLength(1)
    await act(async () => { api.deleteDepositAccount('da-1') })
    expect(api.depositAccounts).toHaveLength(0)
    await waitFor(() =>
      expect(h.mock!.callsFor('deposit_accounts').some((c) => c.op === 'delete')).toBe(true)
    )
    expect(api.error).toBeNull()
  })

  it('deleteDepositAccount rolls back on server error', async () => {
    h.mock = makeSupabaseMock({
      ...dataset({
        deposit_accounts: [
          { id: 'da-1', household_id: 'hh-1', name: 'Chase Checking', created_at: '2026-01-01T00:00:00Z' },
        ],
      }),
      deleteErrors: { deposit_accounts: 'RLS denied' },
    })
    await renderStore()
    await act(async () => { api.deleteDepositAccount('da-1') })
    await waitFor(() => expect(api.error).toBeTruthy())
    expect(api.depositAccounts).toHaveLength(1)
    expect(api.depositAccounts[0].name).toBe('Chase Checking')
  })
})

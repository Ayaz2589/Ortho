// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'
import { makeTx } from './helpers/fixtures'

// The store constructs its client via createClient(); swap it for our chainable
// mock so the provider loads from in-memory data and performs zero network I/O.
const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

// Import AFTER the mock is registered.
import { AppStateProvider, useApp } from '@/lib/store'

// A dataset with a 2-owner shared transaction (owners derived from shares).
function dataset() {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [
        { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
        { id: 'u-jordan', name: 'Jordan', initial: 'J', color_key: 'slate', created_at: '2026-01-02T00:00:00Z' },
      ],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
        { household_id: 'hh-1', user_id: 'u-jordan', role: 'member', created_at: '2026-01-02T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        {
          id: 'tx-shared',
          household_id: 'hh-1',
          merchant: 'Costco',
          category: 'groceries',
          kind: 'expense',
          scope: 'shared',
          amount_cents: 5000,
          source: 'Checking',
          date: '2026-06-10T12:00:00Z',
          created_by: 'u-me',
          created_at: '2026-06-10T12:00:00Z',
          updated_at: '2026-06-10T12:00:00Z',
        },
      ],
      transaction_shares: [
        { transaction_id: 'tx-shared', user_id: 'u-me', percent: 50 },
        { transaction_id: 'tx-shared', user_id: 'u-jordan', percent: 50 },
      ],
      cards: [],
      properties: [],
      mortgage_info: [],
      lease_info: [],
      units: [],
      rental_payments: [],
      budgets: [],
    },
  }
}

// Capture the latest context value so tests can drive actions and read state.
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

describe('store (AppStateProvider)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork() // any real fetch would throw — proves no network
    primeFxCache() // refreshRates uses cache, never fetches
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('loads household data from the mocked client with no network', async () => {
    await renderStore()
    expect(api.error).toBeNull()
    expect(api.currentUserId).toBe('u-me')
    expect(api.users.map((u) => u.id).sort()).toEqual(['u-jordan', 'u-me'])
    expect(api.transactions).toHaveLength(1)
    // shares rehydrated into owner_ids for the shared tx
    expect(api.transactions[0].owner_ids.sort()).toEqual(['u-jordan', 'u-me'])
  })

  it('ownersDisplay labels shared (multi-owner) vs personal', async () => {
    await renderStore()
    const shared = api.transactions[0]
    const od = api.ownersDisplay(shared)
    expect(od.count).toBe(2)

    const personal = makeTx({ scope: 'personal', owner_ids: ['u-me'], household_id: null })
    const pod = api.ownersDisplay(personal)
    expect(pod.count).toBe(1)
    expect(pod.label).toBe('Maya')
  })

  it('formatMoney honors the active currency', async () => {
    await renderStore()
    expect(api.formatMoney(1234)).toBe('$12.34')
    expect(api.formatMoney(1234, { leadingPlus: true })).toBe('+$12.34')
  })

  it('addTransaction → updateTransaction → deleteTransaction mutate exactly that row and persist', async () => {
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-new', merchant: 'Blue Bottle', amount_cents: 450, scope: 'shared', owner_ids: ['u-me'], household_id: 'hh-1' })
    await act(async () => { api.addTransaction(tx) })
    await waitFor(() => expect(api.transactions).toHaveLength(startLen + 1))
    expect(api.transactions[0].id).toBe('tx-new') // prepended
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'insert')).toBe(true)

    const edited = { ...tx, merchant: 'Stumptown' }
    await act(async () => { api.updateTransaction(edited) })
    await waitFor(() => expect(api.transactions.find((t) => t.id === 'tx-new')?.merchant).toBe('Stumptown'))
    expect(api.transactions).toHaveLength(startLen + 1) // no row added/removed
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'update')).toBe(true)

    await act(async () => { api.deleteTransaction('tx-new') })
    await waitFor(() => expect(api.transactions.find((t) => t.id === 'tx-new')).toBeUndefined())
    expect(api.transactions).toHaveLength(startLen) // back to original, others untouched
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'delete')).toBe(true)
  })

  it('performs no real network I/O', async () => {
    await renderStore()
    // stubNoNetwork installs a fetch that rejects; reaching loaded state without
    // an error means the store never depended on the network.
    expect(api.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })
})

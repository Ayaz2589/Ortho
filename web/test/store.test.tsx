// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'
import { makeTx } from './helpers/fixtures'

// The store constructs its client via createClient(); swap it for our chainable
// mock so the provider loads from in-memory data and performs zero network I/O.
const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

// spec 021 — FR-012: key confirmation/deletion interactions get haptic
// feedback (lib/haptics.ts, native-only; a no-op mock here just records calls).
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
      // People reuse the user ids so owner_ids in the assertions read naturally.
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'u-jordan', household_id: 'hh-1', name: 'Jordan', initial: 'J', color_key: 'slate', linked_user_id: 'u-jordan', sort_order: 1, removed_at: null, created_at: '2026-01-02T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        {
          id: 'tx-shared',
          household_id: 'hh-1',
          merchant: 'Costco',
          category: 'groceries',
          kind: 'expense',
          amount_cents: 5000,
          source: 'Checking',
          date: '2026-06-10T12:00:00Z',
          created_by: 'u-me',
          created_at: '2026-06-10T12:00:00Z',
          updated_at: '2026-06-10T12:00:00Z',
        },
      ],
      transaction_shares: [
        { transaction_id: 'tx-shared', person_id: 'u-me', amount_cents: 2500 },
        { transaction_id: 'tx-shared', person_id: 'u-jordan', amount_cents: 2500 },
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
    // All owner names listed (comma-joined), like iOS — never a synthetic
    // "Shared" / "A + B" label.
    expect(od.label.split(', ').sort()).toEqual(['Jordan', 'Maya'])

    const personal = makeTx({ owner_ids: ['u-me'], household_id: 'hh-1' })
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

    const tx = makeTx({ id: 'tx-new', merchant: 'Blue Bottle', amount_cents: 450, owner_ids: ['u-me'], household_id: 'hh-1' })
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

  it('addTransaction confirms with a light haptic; deleteTransaction with a warning haptic (FR-012)', async () => {
    await renderStore()
    impact.mockClear()
    notification.mockClear()

    const tx = makeTx({ id: 'tx-haptic', merchant: 'Blue Bottle', amount_cents: 450, owner_ids: ['u-me'], household_id: 'hh-1' })
    await act(async () => { api.addTransaction(tx) })
    await waitFor(() => expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' }))
    expect(notification).not.toHaveBeenCalled()

    await act(async () => { api.deleteTransaction('tx-haptic') })
    await waitFor(() => expect(notification).toHaveBeenCalledWith({ type: 'WARNING' }))
  })

  it('addTransaction rolls back the parent when the shares write fails (no share-less row)', async () => {
    // Force the transaction_shares insert to fail (e.g. an RLS denial). The
    // transaction+shares write must be atomic: no parent may survive without
    // its shares (it would rehydrate as a single-owner "creator owns all").
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { transaction_shares: 'shares RLS denied' } })
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-fail', merchant: 'Bistro', amount_cents: 1000, owner_ids: ['u-me', 'u-jordan'], household_id: 'hh-1' })
    await act(async () => { api.addTransaction(tx) })

    // The optimistic row is rolled back and an error is surfaced.
    await waitFor(() => expect(api.error).not.toBeNull())
    expect(api.transactions.find((t) => t.id === 'tx-fail')).toBeUndefined()
    expect(api.transactions).toHaveLength(startLen)
    // The parent was deleted so no share-less transaction remains.
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'delete')).toBe(true)
  })

  it('addTransaction keeps the row + flags an error when the shares write AND the rollback delete both fail (B7)', async () => {
    // Double failure: the transaction_shares insert fails AND the compensating
    // parent delete also fails, so the parent survives in the DB with no shares.
    // The app must NOT silently drop it from local state as if the rollback
    // succeeded (that hides an orphaned "creator owns all" row) — it keeps the
    // row visible and surfaces the error (spec 023 B7).
    h.mock = makeSupabaseMock({
      ...dataset(),
      insertErrors: { transaction_shares: 'shares RLS denied' },
      deleteErrors: { transactions: 'delete blocked' },
    })
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-orphan', merchant: 'Bistro', amount_cents: 1000, owner_ids: ['u-me', 'u-jordan'], household_id: 'hh-1' })
    await act(async () => { api.addTransaction(tx) })

    await waitFor(() => expect(api.error).not.toBeNull())
    // Not silently dropped — the failed rollback leaves the row flagged, not
    // presented as a clean revert.
    expect(api.transactions.find((t) => t.id === 'tx-orphan')).toBeDefined()
    expect(api.transactions).toHaveLength(startLen + 1)
  })

  it('spentBy returns each person\'s exact cents share, reconciling to the total', async () => {
    await renderStore()
    // The seeded shared expense ($50.00) is split 50/50 across the two people.
    const start = new Date('2026-06-01T00:00:00Z')
    const end = new Date('2026-07-01T00:00:00Z')
    expect(api.spentBy('u-me', start, end)).toBe(2500)
    expect(api.spentBy('u-jordan', start, end)).toBe(2500)
    expect(api.spentBy('u-me', start, end) + api.spentBy('u-jordan', start, end)).toBe(5000)
  })

  it('exposes active people, currentPersonId, and household members', async () => {
    await renderStore()
    expect(api.people.map((p) => p.id).sort()).toEqual(['u-jordan', 'u-me'])
    expect(api.currentPersonId).toBe('u-me') // the person linked to the auth user
    expect(api.householdMembers.map((u) => u.name).sort()).toEqual(['Jordan', 'Maya'])
  })

  it('addPerson / renamePerson / removePerson mutate the people list + persist', async () => {
    await renderStore()
    await act(async () => { api.addPerson('Sam', 'sky') })
    await waitFor(() => expect(api.people.some((p) => p.name === 'Sam')).toBe(true))
    const sam = api.people.find((p) => p.name === 'Sam')!
    expect(h.mock!.callsFor('household_people').some((c) => c.op === 'insert')).toBe(true)

    await act(async () => { api.renamePerson(sam.id, 'Samuel') })
    await waitFor(() => expect(api.people.find((p) => p.id === sam.id)?.name).toBe('Samuel'))

    await act(async () => { api.removePerson(sam.id) })
    // Soft-remove drops the person from the active list the store exposes.
    await waitFor(() => expect(api.people.some((p) => p.id === sam.id)).toBe(false))
  })

  it('defaults a share-less transaction to its creator\'s person on load', async () => {
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
        household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
        household_people: [
          { id: 'p-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        ],
        households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
        transactions: [
          {
            id: 'tx-p',
            household_id: 'hh-1',
            merchant: 'Dinner',
            category: 'dining',
            kind: 'expense',
            amount_cents: 4000,
            source: 'Checking',
            date: '2026-06-10T12:00:00Z',
            created_by: 'u-me',
            created_at: '2026-06-10T12:00:00Z',
            updated_at: '2026-06-10T12:00:00Z',
          },
        ],
        transaction_shares: [],
        cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      },
    })

    await renderStore()
    const tx = api.transactions.find((t) => t.id === 'tx-p')!
    expect(tx.owner_ids).toEqual(['p-me']) // creator's person, full amount
    expect(tx.shares).toEqual({ 'p-me': 4000 })
  })

  it('performs no real network I/O', async () => {
    await renderStore()
    // stubNoNetwork installs a fetch that rejects; reaching loaded state without
    // an error means the store never depended on the network.
    expect(api.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })
})

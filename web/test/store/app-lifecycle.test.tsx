// @vitest-environment jsdom
//
// spec 021 — closes the web-vs-iOS liveness gap for the Capacitor build:
// foregrounding re-validates the session (docs/parity-audit-2026-07-02.md).
// spec 023 B5 — the re-validation now hits the SERVER via getUser (not the
// cache-first getSession), so a session revoked server-side within the local
// token TTL is caught; a genuine auth rejection signs out, a transient network
// error does not (no kicking out an offline user).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeEntitlement, makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMockDataset } from '../helpers/supabase-mock'

type GetUserResult = { data: { user: { id: string } | null }; error: { status?: number; message: string } | null }
const { addListener, getUser, signOut } = vi.hoisted(() => ({
  addListener: vi.fn(),
  getUser: vi.fn<() => Promise<GetUserResult>>(() => Promise.resolve({ data: { user: { id: 'u-me' } }, error: null })),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}))
vi.mock('@capacitor/app', () => ({ App: { addListener } }))

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient }))

import { AppStateProvider, useApp } from '@/lib/store'

describe('appStateChange liveness listener', () => {
  let appStateCallback: ((state: { isActive: boolean }) => void) | undefined

  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    addListener.mockImplementation((_event: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })
    getUser.mockClear()
    getUser.mockResolvedValue({ data: { user: { id: 'u-me' } }, error: null })
    signOut.mockClear()
    const mock = makeSupabaseMock({ authUser: { id: 'u-me', email: 'me@example.com' } })
    Object.assign(mock.client.auth, { getUser, signOut })
    createClient.mockReturnValue(mock.client)
  })

  it('registers an appStateChange listener on mount', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function)))
  })

  it('re-validates against the server (getUser) when the app becomes active', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockClear()
    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(getUser).toHaveBeenCalled())
  })

  it('signs out when the session was revoked server-side (getUser → 401)', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid token' } })
    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('does NOT sign out on a transient network error (no auth status)', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 0, message: 'network down' } })
    signOut.mockClear()
    appStateCallback?.({ isActive: true })
    await new Promise((r) => setTimeout(r, 10))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does not re-validate when the app becomes inactive', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockClear()
    appStateCallback?.({ isActive: false })
    expect(getUser).not.toHaveBeenCalled()
  })
})

// spec 018 (merge reconciliation): the entitlement gate must re-derive on
// foreground — a resident Capacitor app otherwise keeps a bootstrap-time gate
// forever, so a trial/subscription that lapsed while the app sat suspended
// never gates (FR-006). A transient refresh failure keeps the current gate
// and stays SILENT (never a false lapse, no error banner — FR-008 spirit).
describe('appStateChange entitlement re-derivation (spec 018)', () => {
  let appStateCallback: ((state: { isActive: boolean }) => void) | undefined
  let probe: ReturnType<typeof useApp> | null = null

  function Probe() {
    probe = useApp()
    return null
  }

  function fullDataset(): SupabaseMockDataset {
    return {
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
        household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
        household_people: [
          { id: 'p-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        ],
        households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
        transactions: [], transaction_shares: [], cards: [], properties: [],
        mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
        entitlements: [makeEntitlement()],
      },
      rpc: { ensure_entitlement: makeEntitlement() },
    }
  }

  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    probe = null
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    addListener.mockImplementation((_event: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })
    getUser.mockResolvedValue({ data: { user: { id: 'u-me' } }, error: null })
  })

  async function bootWith(ds: SupabaseMockDataset) {
    const mock = makeSupabaseMock(ds)
    Object.assign(mock.client.auth, { getUser, signOut })
    createClient.mockReturnValue(mock.client)
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    )
    await waitFor(() => expect(probe?.loading).toBe(false))
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    return mock
  }

  it('foregrounding refetches the row and re-derives the gate (lapse while suspended gates)', async () => {
    const ds = fullDataset()
    await bootWith(ds)
    expect(probe!.gateState).toBe('trialing')
    // The row lapses server-side (or simply by time passing) while suspended.
    ds.tables!.entitlements = [makeEntitlement({ access_expires_at: '2026-01-01T00:00:00Z' })]
    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(probe!.gateState).toBe('lapsed'))
  })

  it('a transient refetch failure on foreground keeps the gate and surfaces NO error', async () => {
    const ds = fullDataset()
    ds.selectErrors = { entitlements: 'offline' }
    await bootWith(ds)
    expect(probe!.gateState).toBe('trialing')
    appStateCallback?.({ isActive: true })
    // Give the async refresh a beat, then assert nothing changed and no banner.
    await new Promise((r) => setTimeout(r, 50))
    expect(probe!.gateState).toBe('trialing')
    expect(probe!.error).toBe(null)
  })
})

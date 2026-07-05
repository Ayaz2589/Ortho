// @vitest-environment jsdom
// US1 (+US4 gate half): the free month starts automatically, exactly once,
// server-side; clients only read. FR-001/002/005/008/017.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from './helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'

function dataset(overrides: Partial<SupabaseMockDataset> = {}): SupabaseMockDataset {
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
    ...overrides,
  }
}

let probe: ReturnType<typeof useApp> | null = null
function Probe() {
  probe = useApp()
  return (
    <div>
      <span data-testid="gate">{probe.gateState ?? 'none'}</span>
      <span data-testid="status">{probe.entitlement?.status ?? 'none'}</span>
    </div>
  )
}

async function boot(ds: SupabaseMockDataset) {
  h.mock = makeSupabaseMock(ds)
  const view = render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
  await waitFor(() => expect(probe?.loading).toBe(false))
  return view
}

beforeEach(() => {
  primeFxCache()
  stubNoNetwork()
  probe = null
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('US1 — trial starts automatically at bootstrap', () => {
  it('bootstrap calls ensure_entitlement and derives a trialing gate', async () => {
    await boot(dataset())
    expect(h.mock!.rpcCalls.filter((n) => n === 'ensure_entitlement')).toHaveLength(1)
    expect(probe!.entitlement?.status).toBe('trialing')
    expect(probe!.gateState).toBe('trialing')
    expect(probe!.bootstrapFailed).toBe(false)
  })

  it('the client NEVER writes entitlement state (FR-017)', async () => {
    await boot(dataset())
    expect(h.mock!.callsFor('entitlements')).toHaveLength(0)
    expect(h.mock!.callsFor('billing_events')).toHaveLength(0)
  })

  it('a second bootstrap is a read, not a reset — same row comes back', async () => {
    await boot(dataset())
    act(() => probe!.retryBootstrap())
    await waitFor(() => expect(probe!.loading).toBe(false))
    expect(h.mock!.rpcCalls.filter((n) => n === 'ensure_entitlement')).toHaveLength(2)
    expect(h.mock!.callsFor('entitlements')).toHaveLength(0)
    expect(probe!.entitlement?.status).toBe('trialing')
  })

  it('entitlement load failure routes to bootstrap recovery, NEVER the paywall (FR-008)', async () => {
    await boot(dataset({ rpcErrors: { ensure_entitlement: new Error('backend down') } }))
    expect(probe!.bootstrapFailed).toBe(true)
    expect(probe!.gateState).toBeNull()
    expect(probe!.error).toMatch(/backend down/)
  })

  it('refreshEntitlement refetches the row and re-derives the gate', async () => {
    const ds = dataset()
    await boot(ds)
    expect(probe!.gateState).toBe('trialing')
    ds.tables!.entitlements = [
      makeEntitlement({ status: 'active', plan: 'monthly', source: 'stripe' }),
    ]
    await act(async () => {
      await probe!.refreshEntitlement()
    })
    expect(probe!.entitlement?.status).toBe('active')
    expect(probe!.gateState).toBe('active')
  })

  it('refreshEntitlement failure keeps the current gate (no false lapse)', async () => {
    const ds = dataset()
    await boot(ds)
    ds.selectErrors = { entitlements: 'flaky network' }
    await act(async () => {
      await probe!.refreshEntitlement()
    })
    expect(probe!.gateState).toBe('trialing')
  })
})

describe('US4 — admin bypass at the gate', () => {
  it('an admin row (null expiry) derives the admin gate', async () => {
    const admin = makeEntitlement({ status: 'admin', access_expires_at: null, source: 'operator' })
    await boot(dataset({ rpc: { ensure_entitlement: admin }, tables: { ...dataset().tables, entitlements: [admin] } }))
    expect(probe!.gateState).toBe('admin')
  })

  it('an admin row with an ANCIENT expiry still derives admin (expiry ignored)', async () => {
    const admin = makeEntitlement({ status: 'admin', access_expires_at: '2020-01-01T00:00:00Z', source: 'operator' })
    await boot(dataset({ rpc: { ensure_entitlement: admin } }))
    expect(probe!.gateState).toBe('admin')
  })
})

describe('lapsed derivation from a successfully loaded row', () => {
  it('an expired trial (beyond leeway) derives lapsed', async () => {
    const lapsed = makeEntitlement({ access_expires_at: '2026-01-01T00:00:00Z' })
    await boot(dataset({ rpc: { ensure_entitlement: lapsed } }))
    expect(probe!.gateState).toBe('lapsed')
  })

  it('a past_due row within the dunning envelope derives grace (full access)', async () => {
    const now = Date.now()
    const grace = makeEntitlement({
      status: 'past_due',
      source: 'stripe',
      plan: 'monthly',
      access_expires_at: new Date(now - 24 * 3600 * 1000).toISOString(),
    })
    await boot(dataset({ rpc: { ensure_entitlement: grace } }))
    expect(probe!.gateState).toBe('grace')
  })
})

describe('harness RLS contract (spec 018, live-PostgREST-faithful per review [29])', () => {
  it('mirrors real RLS: inserts error, updates/deletes silently no-op, policy-less reads are empty', async () => {
    const mock = makeSupabaseMock(dataset())
    // INSERT/UPSERT without a policy → 42501-style error.
    const ins = await mock.client.from('entitlements').insert({ user_id: 'u-me' })
    expect(ins.error?.message).toMatch(/permission denied/)
    const ups = await mock.client.from('billing_events').upsert({ event_id: 'evt_x' })
    expect(ups.error?.message).toMatch(/permission denied/)
    // UPDATE/DELETE without a policy → SUCCESS with zero rows affected (no error).
    const upd = await mock.client.from('entitlements').update({ status: 'active' })
    expect(upd.error).toBeNull()
    // Policy-less SELECT → empty result set, not an error.
    const evRead = await mock.client.from('billing_events').select()
    expect(evRead.error).toBeNull()
    expect(evRead.data).toEqual([])
    // Either way, the calls are recorded so behavior tests can assert none occur.
    expect(mock.callsFor('entitlements').length + mock.callsFor('billing_events').length).toBe(3)
  })
})

describe('unparseable expiry fails OPEN, matching iOS (review [18])', () => {
  it('a garbage access_expires_at derives a null gate — never the paywall', async () => {
    const junk = makeEntitlement({ access_expires_at: 'not-a-timestamp' })
    await boot(dataset({ rpc: { ensure_entitlement: junk } }))
    expect(probe!.gateState).toBeNull()
    expect(probe!.bootstrapFailed).toBe(false)
  })
})

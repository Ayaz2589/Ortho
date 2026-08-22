// @vitest-environment jsdom
//
// The spec-018 subscription system is switched OFF via lib/subscriptionGate. This suite is
// the counterpart to the four suites that pin the flag ON (paywall, subscription-settings,
// entitlement-bootstrap, app-lifecycle): those prove the machinery still works so that
// re-enabling is safe, and this one proves it is genuinely inert while disabled.
//
// It deliberately does NOT mock '@/lib/subscriptionGate' — it reads the real shipped flag,
// so if someone flips SUBSCRIPTION_ENABLED back to true without meaning to, these fail.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from './helpers/supabase-mock'
import { SUBSCRIPTION_ENABLED } from '@/lib/subscriptionGate'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}))

import { AppStateProvider, useApp } from '@/lib/store'
import SettingsPage from '@/app/(app)/settings/page'
import SubscriptionPage from '@/app/(app)/settings/subscription/page'
import { SettingsSecondaryNav } from '@/components/settings/SettingsSecondaryNav'

/** A LAPSED entitlement — the exact row that would raise the paywall if the system were on. */
const LAPSED = makeEntitlement({ status: 'unpaid', access_expires_at: '2020-01-01T00:00:00Z' })

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
      entitlements: [LAPSED],
    },
    rpc: { ensure_entitlement: LAPSED },
    ...overrides,
  }
}

let probe: ReturnType<typeof useApp> | null = null
function Probe() {
  probe = useApp()
  return <span data-testid="gate">{probe.gateState ?? 'none'}</span>
}

async function boot(ds: SupabaseMockDataset = dataset()) {
  h.mock = makeSupabaseMock(ds)
  const view = render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
  await waitFor(() => expect(probe?.loading).toBe(false))
  return view
}

function renderWithStore(ui: React.ReactNode, ds: SupabaseMockDataset = dataset()) {
  h.mock = makeSupabaseMock(ds)
  return render(<AppStateProvider>{ui}</AppStateProvider>)
}

beforeEach(() => {
  primeFxCache()
  stubNoNetwork()
  probe = null
  nav.replace.mockClear()
  nav.push.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('the subscription system is disabled', () => {
  it('ships with the flag off — the whole suite is meaningless otherwise', () => {
    expect(SUBSCRIPTION_ENABLED).toBe(false)
  })
})

describe('the gate never closes', () => {
  it('derives a null gate even from a LAPSED entitlement row', async () => {
    await boot()
    expect(probe!.gateState).toBe(null)
  })

  it('never calls ensure_entitlement, so a missing or broken RPC cannot affect bootstrap', async () => {
    await boot()
    expect(h.mock!.rpcCalls).not.toContain('ensure_entitlement')
    expect(probe!.entitlement).toBe(null)
    expect(probe!.bootstrapFailed).toBe(false)
  })

  it('bootstraps cleanly when the entitlements RPC is missing entirely (PGRST202)', async () => {
    const ds = dataset()
    ds.tables!.entitlements = []
    ds.rpcErrors = {
      ensure_entitlement: Object.assign(new Error('missing'), { code: 'PGRST202' }),
    }
    await boot(ds)
    expect(probe!.bootstrapFailed).toBe(false)
    expect(probe!.gateState).toBe(null)
  })

  it('bootstraps cleanly when reading entitlements ERRORS — the subsystem cannot take the app down', async () => {
    // With the system enabled this is an orThrow path (bootstrapFailed). Disabled, the read
    // never happens, so the failure is unreachable.
    const ds = dataset()
    ds.rpcErrors = { ensure_entitlement: new Error('backend is gone') }
    await boot(ds)
    expect(probe!.bootstrapFailed).toBe(false)
    expect(probe!.gateState).toBe(null)
  })

  it('refreshEntitlement is inert: it reports success without reading the table', async () => {
    await boot()
    const before = h.mock!.rpcCalls.length
    await expect(probe!.refreshEntitlement()).resolves.toBe(true)
    expect(h.mock!.rpcCalls.length).toBe(before)
    expect(probe!.gateState).toBe(null)
  })
})

describe('no subscription UI is reachable', () => {
  it('the Settings list has no Subscription row', async () => {
    renderWithStore(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('Cards')).toBeTruthy())
    expect(screen.queryByText('Subscription')).toBeNull()
  })

  it('the desktop settings nav has no Subscription section', async () => {
    renderWithStore(<SettingsSecondaryNav />)
    await waitFor(() => expect(screen.getByText('Cards')).toBeTruthy())
    expect(screen.queryByText('Subscription')).toBeNull()
  })

  it('deep-linking to /settings/subscription redirects to Settings instead of a blank page', async () => {
    const { container } = renderWithStore(<SubscriptionPage />)
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/settings'))
    expect(container.textContent).toBe('')
  })
})

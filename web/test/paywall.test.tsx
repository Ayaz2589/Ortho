// @vitest-environment jsdom
// US2 — trial ends → calm blocking paywall → subscribe → back in.
// FR-006/007/010/011/012 + constitution a11y (V) + never-flash (FR-009).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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

// The Shell renders Sidebar/TabBar, which read the route from next/navigation.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

import AppLayout from '@/app/(app)/layout'

const PLANS = {
  plans: {
    monthly: { amountCents: 999, currency: 'usd', interval: 'month' },
    yearly: { amountCents: 9900, currency: 'usd', interval: 'year' },
  },
}

const lapsedRow = () => makeEntitlement({ access_expires_at: '2026-01-01T00:00:00Z' })

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
      entitlements: [lapsedRow()],
    },
    rpc: { ensure_entitlement: lapsedRow() },
    functions: {
      'billing-plans': { data: PLANS },
      'billing-checkout': { data: { url: 'https://checkout.stripe.test/cs_123' } },
    },
    ...overrides,
  }
}

async function bootLayout(ds: SupabaseMockDataset) {
  h.mock = makeSupabaseMock(ds)
  const view = render(
    <AppLayout>
      <div data-testid="app-content">private things</div>
    </AppLayout>
  )
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  return view
}

let assignSpy: ReturnType<typeof vi.fn>
const originalLocation = window.location

beforeEach(() => {
  primeFxCache()
  stubNoNetwork()
  assignSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, assign: assignSpy, href: originalLocation.href },
    writable: true,
    configurable: true,
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true })
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('blocking behavior (FR-006)', () => {
  it('a lapsed user sees the paywall and ZERO app content, on any route', async () => {
    await bootLayout(dataset())
    expect(screen.getByText('Your free month has ended')).toBeInTheDocument()
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })

  it('an entitled (trialing) user sees the app, no paywall', async () => {
    const trial = makeEntitlement()
    await bootLayout(dataset({ rpc: { ensure_entitlement: trial } }))
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.queryByText('Your free month has ended')).not.toBeInTheDocument()
  })

  it('a grace (dunning) user keeps FULL access — no paywall (FR-020/US5)', async () => {
    const grace = makeEntitlement({
      status: 'past_due',
      source: 'stripe',
      plan: 'monthly',
      access_expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    })
    await bootLayout(dataset({ rpc: { ensure_entitlement: grace } }))
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('never flashes the paywall while loading (FR-009)', async () => {
    h.mock = makeSupabaseMock(dataset())
    render(
      <AppLayout>
        <div data-testid="app-content" />
      </AppLayout>
    )
    // During the pending bootstrap: loading copy, no paywall.
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Your free month has ended')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  })

  it('an entitlement LOAD failure shows recovery, never the paywall (FR-008)', async () => {
    await bootLayout(dataset({ rpcErrors: { ensure_entitlement: new Error('down') } }))
    expect(screen.queryByText('Your free month has ended')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('plans display (FR-011 — operator prices only)', () => {
  it('renders both plans with the amounts the operator configured', async () => {
    await bootLayout(dataset())
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument()
    expect(screen.getByText(/\$99\.00/)).toBeInTheDocument()
  })

  it('renders DIFFERENT operator amounts without any code change (SC-008)', async () => {
    const ds = dataset()
    ds.functions!['billing-plans'] = {
      data: {
        plans: {
          monthly: { amountCents: 1234, currency: 'usd', interval: 'month' },
          yearly: { amountCents: 11100, currency: 'usd', interval: 'year' },
        },
      },
    }
    await bootLayout(ds)
    await waitFor(() => expect(screen.getByText(/\$12\.34/)).toBeInTheDocument())
    expect(screen.getByText(/\$111\.00/)).toBeInTheDocument()
  })

  it('plans lookup failure → calm unavailable copy + retry, in a live region', async () => {
    const ds = dataset()
    ds.functions!['billing-plans'] = { errorCode: 'not_configured' }
    await bootLayout(ds)
    await waitFor(() =>
      expect(screen.getByText('Plans are unavailable right now.')).toBeInTheDocument()
    )
    // Actually IN a live region (review [22]) — the failure must be announced.
    expect(
      screen
        .getAllByRole('status')
        .some((el) => /Plans are unavailable right now/.test(el.textContent ?? ''))
    ).toBe(true)
    // Retry re-invokes billing-plans.
    ds.functions!['billing-plans'] = { data: PLANS }
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
  })
})

describe('subscribing (FR-010/012)', () => {
  it('choosing a plan mints a checkout session for that plan and navigates to it', async () => {
    await bootLayout(dataset())
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Monthly/ }))
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://checkout.stripe.test/cs_123')
    )
    const call = h.mock!.invocations.find((i) => i.name === 'billing-checkout')
    expect(call?.body).toEqual({ plan: 'monthly' })
  })

  it('checkout failure announces calm copy in the status live region', async () => {
    const ds = dataset()
    ds.functions!['billing-checkout'] = { errorCode: 'provider_error' }
    await bootLayout(ds)
    await waitFor(() => expect(screen.getByText('Yearly')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Yearly/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not open checkout. Try again.')
    )
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('"check again" refetches and unblocks once the row is active (FR-012)', async () => {
    const ds = dataset()
    await bootLayout(ds)
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    ds.tables!.entitlements = [
      makeEntitlement({ status: 'active', plan: 'monthly', source: 'stripe' }),
    ]
    fireEvent.click(screen.getByRole('button', { name: 'I subscribed — check again' }))
    await waitFor(() => expect(screen.getByTestId('app-content')).toBeInTheDocument())
    expect(screen.queryByText('Your free month has ended')).not.toBeInTheDocument()
  })

  it('"check again" while still lapsed announces the calm not-yet copy', async () => {
    await bootLayout(dataset())
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'I subscribed — check again' }))
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => /No subscription found yet/.test(el.textContent ?? ''))).toBe(true)
    )
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })

  it('"check again" whose REFETCH fails says could-not-check, not no-subscription (review [6])', async () => {
    const ds = dataset()
    await bootLayout(ds)
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    ds.selectErrors = { entitlements: 'flaky network' }
    fireEvent.click(screen.getByRole('button', { name: 'I subscribed — check again' }))
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => /Could not check just now/.test(el.textContent ?? ''))).toBe(true)
    )
    expect(screen.queryByText(/No subscription found yet/)).not.toBeInTheDocument()
  })

  it('a lapsed payer returning with ?checkout=success gets announced + auto-refreshed on the PAYWALL (review [5])', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignSpy, search: '?checkout=success', pathname: '/' },
      writable: true,
      configurable: true,
    })
    const ds = dataset()
    // The webhook already flipped the row; the paywall's auto-refresh should unblock.
    ds.tables!.entitlements = [
      makeEntitlement({ status: 'active', plan: 'monthly', source: 'stripe' }),
    ]
    await bootLayout(ds)
    await waitFor(() => expect(screen.getByTestId('app-content')).toBeInTheDocument())
  })
})

describe('quiet sign out (FR-007 escape hatch)', () => {
  it('offers a real sign-out button on the paywall itself (not just chrome)', async () => {
    await bootLayout(dataset())
    const paywall = within(screen.getByRole('region', { name: 'Your free month has ended' }))
    const btn = paywall.getByRole('button', { name: 'Sign out' })
    fireEvent.click(btn)
    await waitFor(() => expect(window.location.href).toContain('/sign-in'))
  })
})

describe('semantics (constitution V)', () => {
  it('every paywall control is a real button; status region exists', async () => {
    await bootLayout(dataset())
    await waitFor(() => expect(screen.getByText('Monthly')).toBeInTheDocument())
    const paywall = within(screen.getByRole('region', { name: 'Your free month has ended' }))
    for (const name of [/Monthly/, /Yearly/, 'I subscribed — check again', 'Sign out']) {
      expect(paywall.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(paywall.getByRole('status')).toBeInTheDocument()
  })
})

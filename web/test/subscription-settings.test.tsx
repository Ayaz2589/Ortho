// @vitest-environment jsdom
// US7 (status row per state) + US3 (manage/portal) + US5 (grace notice) +
// the checkout return path (US2/T022). FR-013/014/025/026.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { DbEntitlement, GateState } from '@/lib/entitlements'

const billing = vi.hoisted(() => ({
  openPortal: vi.fn(),
  startCheckout: vi.fn(),
  fetchPlans: vi.fn(),
}))
// Spec 018's subscription system is currently DISABLED via lib/subscriptionGate. These suites
// are its contract tests — they assert the machinery still behaves correctly, which is what
// makes flipping the flag back on a safe, one-line change. So they pin the flag ON rather
// than being deleted or skipped. The disabled-path behaviour is asserted separately in
// test/subscriptions-disabled.test.tsx.
vi.mock('@/lib/subscriptionGate', () => ({ SUBSCRIPTION_ENABLED: true }))

vi.mock('@/lib/billing', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/billing')>()
  return { ...real, ...billing }
})

const store = vi.hoisted(() => ({
  state: null as null | {
    entitlement: DbEntitlement | null
    gateState: GateState | null
    refreshEntitlement: () => Promise<void>
  },
}))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    ...store.state!,
    locale: 'en-US',
    t: (key: string, ...args: Array<string | number>) =>
      args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key,
  }),
}))

import { SubscriptionSection } from '@/components/settings/SubscriptionSection'

function row(overrides: Partial<DbEntitlement> = {}): DbEntitlement {
  return {
    user_id: 'u-me',
    status: 'trialing',
    access_expires_at: '2099-01-01T00:00:00Z',
    plan: null,
    source: 'trial',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    last_event_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function mount(entitlement: DbEntitlement | null, gateState: GateState | null) {
  store.state = { entitlement, gateState, refreshEntitlement: vi.fn(() => Promise.resolve()) }
  return render(<SubscriptionSection />)
}

let assignSpy: ReturnType<typeof vi.fn>
const originalLocation = window.location

beforeEach(() => {
  assignSpy = vi.fn()
  window.history.replaceState({}, '', '/settings')
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, assign: assignSpy, search: '' },
    writable: true,
    configurable: true,
  })
  billing.openPortal.mockReset()
  billing.startCheckout.mockReset()
  billing.fetchPlans.mockReset()
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true })
})

describe('US7 — one line per state', () => {
  it('trialing: days left + Subscribe action', () => {
    const expires = new Date(Date.now() + 12.5 * 86_400_000).toISOString()
    mount(row({ access_expires_at: expires }), 'trialing')
    expect(screen.getByText('Free month — 13 days left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument()
  })

  it('active monthly: plan + renewal date + Manage action', () => {
    mount(row({ status: 'active', plan: 'monthly', source: 'stripe', access_expires_at: '2026-08-10T00:00:00Z' }), 'active')
    expect(screen.getByText(/Monthly plan — renews /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument()
  })

  it('active yearly: yearly copy', () => {
    mount(row({ status: 'active', plan: 'yearly', source: 'stripe', access_expires_at: '2027-07-10T00:00:00Z' }), 'active')
    expect(screen.getByText(/Yearly plan — renews /)).toBeInTheDocument()
  })

  it('canceled-but-paid-through: ends-on copy, still manageable (FR-014)', () => {
    mount(row({ status: 'canceled', plan: 'monthly', source: 'stripe', access_expires_at: '2026-08-10T00:00:00Z' }), 'active')
    expect(screen.getByText(/Subscription ends /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument()
  })

  it('admin: no-subscription-needed copy, no actions (US4)', () => {
    mount(row({ status: 'admin', access_expires_at: null, source: 'operator' }), 'admin')
    expect(screen.getByText('This account doesn’t need a subscription.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Subscribe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument()
  })

  it('renders nothing until the entitlement row exists (test-data mode)', () => {
    const { container } = mount(null, null)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('US5 — grace is calm, non-blocking', () => {
  it('billing-issue copy renders in normal order (no attribute-only aria-live theater — review [23]) + Manage, never red/blocking', () => {
    mount(row({ status: 'past_due', plan: 'monthly', source: 'stripe', access_expires_at: '2026-07-01T00:00:00Z' }), 'grace')
    const line = screen.getByText('There’s a billing issue. Your access continues while it gets sorted out.')
    expect(line).not.toHaveAttribute('aria-live')
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument()
    expect(document.querySelector('.text-destructive')).toBeNull()
  })
})

describe('singular trial day (review [20])', () => {
  it('the last day reads "1 day left", not "1 days left"', () => {
    const expires = new Date(Date.now() + 0.5 * 86_400_000).toISOString()
    mount(row({ access_expires_at: expires }), 'trialing')
    expect(screen.getByText('Free month — 1 day left')).toBeInTheDocument()
    expect(screen.queryByText(/1 days left/)).not.toBeInTheDocument()
  })
})

describe('focus management (review [25])', () => {
  it('activating Subscribe moves focus to the first plan row', async () => {
    billing.fetchPlans.mockResolvedValue({
      ok: true,
      value: {
        monthly: { amountCents: 999, currency: 'usd', interval: 'month' },
        yearly: { amountCents: 9900, currency: 'usd', interval: 'year' },
      },
    })
    mount(row(), 'trialing')
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Monthly/ })).toBeInTheDocument())
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Monthly/ }))
    )
  })
})

describe('US3 — manage opens the portal', () => {
  it('Manage → portal URL navigation', async () => {
    billing.openPortal.mockResolvedValue({ ok: true, value: { url: 'https://portal.stripe.test/x' } })
    mount(row({ status: 'active', plan: 'monthly', source: 'stripe', access_expires_at: '2026-08-10T00:00:00Z' }), 'active')
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://portal.stripe.test/x'))
  })

  it('portal failure lands as calm copy in the status region (aria-live)', async () => {
    billing.openPortal.mockResolvedValue({ ok: false, code: 'no_billing_account' })
    mount(row({ status: 'active', plan: 'monthly', source: 'stripe', access_expires_at: '2026-08-10T00:00:00Z' }), 'active')
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not open billing. Try again.')
    )
    expect(assignSpy).not.toHaveBeenCalled()
  })
})

describe('subscribe from Settings (trialing)', () => {
  it('expands to plan rows with operator amounts, then mints a checkout', async () => {
    billing.fetchPlans.mockResolvedValue({
      ok: true,
      value: {
        monthly: { amountCents: 999, currency: 'usd', interval: 'month' },
        yearly: { amountCents: 9900, currency: 'usd', interval: 'year' },
      },
    })
    billing.startCheckout.mockResolvedValue({ ok: true, value: { url: 'https://checkout.stripe.test/y' } })
    mount(row(), 'trialing')
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    await waitFor(() => expect(screen.getByText(/\$99\.00/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Yearly/ }))
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://checkout.stripe.test/y'))
    expect(billing.startCheckout).toHaveBeenCalledWith('yearly')
  })
})

describe('checkout return path (T022)', () => {
  it('?checkout=success announces calm copy and refreshes the entitlement', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignSpy, search: '?checkout=success' },
      writable: true,
      configurable: true,
    })
    store.state = { entitlement: row(), gateState: 'trialing', refreshEntitlement: vi.fn(() => Promise.resolve()) }
    render(<SubscriptionSection />)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Payment received/)
    )
    expect(store.state.refreshEntitlement).toHaveBeenCalledTimes(1)
  })

  it('?checkout=cancelled announces quietly and does NOT refresh', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignSpy, search: '?checkout=cancelled' },
      writable: true,
      configurable: true,
    })
    store.state = { entitlement: row(), gateState: 'trialing', refreshEntitlement: vi.fn(() => Promise.resolve()) }
    render(<SubscriptionSection />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Checkout cancelled.'))
    expect(store.state.refreshEntitlement).not.toHaveBeenCalled()
  })
})

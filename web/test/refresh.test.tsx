// @vitest-environment jsdom
/**
 * Spec 017 US4 — manual refresh: re-invokes the one-shot loadAll so two live
 * sessions converge without relaunching. Success replaces all household
 * collections consistently; failure leaves everything intact; open forms are
 * never clobbered. Explicitly manual — no polling, no subscriptions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'
import { RefreshControl } from '@/components/RefreshControl'

const ISO1 = '2026-01-01T00:00:00Z'

function txRow(id: string, merchant: string, cents: number) {
  return {
    id, household_id: 'hh-1', merchant, category: 'groceries', kind: 'expense',
    amount_cents: cents, source: 'Checking', date: '2026-06-10T12:00:00Z',
    created_by: 'u-me', created_at: '2026-06-10T12:00:00Z', updated_at: '2026-06-10T12:00:00Z',
  }
}

/** Returns BOTH the dataset and live references to its tables so tests can
 *  simulate another session's writes between load and refresh. */
function dataset() {
  const tables: Record<string, unknown[]> = {
    users: [{ id: 'u-me', name: 'Ava', initial: 'A', color_key: 'sage', created_at: ISO1 }],
    household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: ISO1 }],
    household_people: [
      { id: 'p-me', household_id: 'hh-1', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: ISO1 },
    ],
    households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: ISO1 }],
    transactions: [txRow('tx-1', 'Costco', 5000)],
    transaction_shares: [{ transaction_id: 'tx-1', person_id: 'p-me', amount_cents: 5000 }],
    cards: [], properties: [], mortgage_info: [], lease_info: [], units: [],
    rental_payments: [], budgets: [], pending_invites: [],
  }
  return { ds: { authUser: { id: 'u-me', email: 'ava@example.com' }, tables }, tables }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

/** A stand-in for any open add/edit form: component-local state that a
 *  refresh must never clobber (FR-023). */
function OpenForm() {
  const [value, setValue] = useState('')
  return <input aria-label="Merchant draft" value={value} onChange={(e) => setValue(e.target.value)} />
}

async function renderStore(ui?: React.ReactNode) {
  render(
    <AppStateProvider>
      <Capture />
      {ui}
    </AppStateProvider>
  )
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => {
  stubNoNetwork()
  primeFxCache()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('store refresh (US4)', () => {
  it('replaces all household collections with the other session\'s writes', async () => {
    const { ds, tables } = dataset()
    h.mock = makeSupabaseMock(ds)
    await renderStore()
    expect(api.transactions).toHaveLength(1)

    // Another session writes a transaction, a person, and a budget.
    tables.transactions.push(txRow('tx-2', 'Blue Bottle', 450))
    tables.transaction_shares.push({ transaction_id: 'tx-2', person_id: 'p-me', amount_cents: 450 })
    tables.household_people.push({ id: 'p-new', household_id: 'hh-1', name: 'Ben', initial: 'B', color_key: 'slate', linked_user_id: null, sort_order: 1, removed_at: null, created_at: ISO1 })
    tables.budgets.push({ id: 'b-1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 40000 })

    let inFlight: Promise<boolean>
    act(() => {
      inFlight = api.refresh()
    })
    // Mid-flight: it is a refresh, never a re-boot — the app stays usable.
    expect(api.refreshing).toBe(true)
    expect(api.loading).toBe(false)
    await act(async () => {
      await inFlight
    })

    // Everything from the refreshed read, consistently (FR-021).
    expect(api.transactions.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-2'])
    expect(api.people.map((p) => p.name).sort()).toEqual(['Ava', 'Ben'])
    expect(api.budgets).toHaveLength(1)
    expect(api.refreshing).toBe(false)
    expect(api.error).toBeNull()
  })

  it('a failed refresh keeps ALL prior data intact and surfaces a calm error', async () => {
    const { ds, tables } = dataset()
    h.mock = makeSupabaseMock(ds)
    await renderStore()
    expect(api.transactions).toHaveLength(1)

    // The next read fails (offline, RLS hiccup). Simulate after initial load.
    ;(ds as { selectErrors?: Record<string, string> }).selectErrors = { transactions: 'network down' }
    tables.budgets.push({ id: 'b-1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 40000 })

    let result = true
    await act(async () => {
      result = await api.refresh()
    })
    expect(result).toBe(false)

    // Nothing was replaced — not even the tables that would have succeeded.
    expect(api.transactions).toHaveLength(1)
    expect(api.budgets).toHaveLength(0)
    await waitFor(() => expect(api.error).not.toBeNull())
    expect(api.refreshing).toBe(false)
  })

  it('never clobbers an open form (component state survives refresh)', async () => {
    const { ds } = dataset()
    h.mock = makeSupabaseMock(ds)
    const user = userEvent.setup()
    await renderStore(<OpenForm />)

    const draft = screen.getByLabelText('Merchant draft') as HTMLInputElement
    await user.type(draft, 'Farmers market')

    await act(async () => {
      await api.refresh()
    })
    expect((screen.getByLabelText('Merchant draft') as HTMLInputElement).value).toBe('Farmers market')
  })

  it('refresh is a no-op before a household is loaded', async () => {
    const { ds } = dataset()
    ds.tables.household_members = []
    h.mock = makeSupabaseMock(ds)
    await renderStore()
    expect(api.membershipStatus).toBe('none')

    await act(async () => {
      await api.refresh()
    })
    expect(api.error).toBeNull()
  })
})

describe('RefreshControl (US4 UI)', () => {
  it('is an accessible button that refreshes and announces completion', async () => {
    const { ds, tables } = dataset()
    h.mock = makeSupabaseMock(ds)
    const user = userEvent.setup()
    await renderStore(<RefreshControl />)

    tables.transactions.push(txRow('tx-2', 'Blue Bottle', 450))
    tables.transaction_shares.push({ transaction_id: 'tx-2', person_id: 'p-me', amount_cents: 450 })

    const btn = screen.getByRole('button', { name: 'Refresh' })
    await user.click(btn)

    await waitFor(() => expect(api.transactions).toHaveLength(2))
    // Completion is announced politely for screen readers.
    expect(await screen.findByText('Updated')).toBeTruthy()
  })
})

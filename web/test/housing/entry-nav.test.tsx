// @vitest-environment jsdom
//
// Spec 025 — mobile housing entry points NAVIGATE to the dedicated pages instead
// of opening the in-place Drawer. Real store (AppStateProvider) + Supabase mock;
// only router + breakpoint mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/housing',
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false, useMediaQuery: () => false }))

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import HousingPage from '@/app/(app)/housing/page'

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
    household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
    household_people: [
      { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
    ],
    households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
    transactions: [], transaction_shares: [], cards: [], budgets: [],
    properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [],
    ...extra,
  }
}

beforeEach(() => {
  stubNoNetwork()
  primeFxCache()
  nav.push.mockClear()
  nav.replace.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('housing mobile entry points navigate (spec 025)', () => {
  it('the empty-state / header "Add property" navigates to /housing/new', async () => {
    h.mock = makeSupabaseMock({ authUser: { id: 'u-me', email: 'maya@example.com' }, tables: baseTables() })
    const user = userEvent.setup()
    render(<AppStateProvider><HousingPage /></AppStateProvider>)
    await screen.findByText('No properties yet')

    await user.click(screen.getAllByRole('button', { name: 'Add property' })[0])
    expect(nav.push).toHaveBeenCalledWith('/housing/new')
  })

  it('a property’s "Edit" navigates to /housing/edit?id=<id>', async () => {
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: baseTables({
        properties: [{ id: 'prop-1', household_id: 'hh-1', kind: 'rental', address: '9 Birch St', nickname: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
        lease_info: [{ property_id: 'prop-1', monthly_rent_cents: 200000, lease_start: '2026-01-01', lease_end: '2027-01-01', security_deposit_cents: null, paid_with_source: null }],
      }),
    })
    const user = userEvent.setup()
    render(<AppStateProvider><HousingPage /></AppStateProvider>)
    // A single property renders the "lonely" layout with an Edit control.
    await screen.findByText('9 Birch St', { exact: false })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(nav.push).toHaveBeenCalledWith('/housing/edit?id=prop-1')
  })
})

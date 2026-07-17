// @vitest-environment jsdom
//
// Spec 025 — mobile entry points NAVIGATE to the dedicated pages instead of
// opening the in-place overlay. Runs against the REAL store (AppStateProvider)
// seeded from the in-memory Supabase mock; only the router + breakpoint are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/transactions',
}))
// Force the mobile branch (desktop early-returns <TransactionsDesktop/>).
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => false, useMediaQuery: () => false }))

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import TransactionsPage from '@/app/(app)/transactions/page'

function thisMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString()
}

function dataset() {
  const date = thisMonthISO()
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        { id: 'tx-1', household_id: 'hh-1', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: 10000, source: 'Checking', date, created_by: 'u-me', created_at: date, updated_at: date },
      ],
      transaction_shares: [{ transaction_id: 'tx-1', person_id: 'u-me', amount_cents: 10000 }],
      cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
    },
  }
}

beforeEach(() => {
  h.mock = makeSupabaseMock(dataset())
  stubNoNetwork()
  primeFxCache()
  nav.push.mockClear()
  nav.replace.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('transactions mobile entry points navigate (spec 025)', () => {
  it('the header "Add transaction" navigates to /transactions/new', async () => {
    const user = userEvent.setup()
    render(<AppStateProvider><TransactionsPage /></AppStateProvider>)
    await screen.findByText('Costco')

    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(nav.push).toHaveBeenCalledWith('/transactions/new')
  })

  it('the detail sheet "Edit" navigates to /transactions/edit?id=<id>', async () => {
    const user = userEvent.setup()
    render(<AppStateProvider><TransactionsPage /></AppStateProvider>)
    await user.click(await screen.findByText('Costco'))

    // Detail sheet is open; tapping Edit navigates to the edit page.
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(nav.push).toHaveBeenCalledWith('/transactions/edit?id=tx-1')
  })
})

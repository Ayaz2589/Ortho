// @vitest-environment jsdom
// T021 (spec 024, FR-001) — Settings shows a "Linked banks" entry for
// household members, with a calm peek of how many banks are connected.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from '../helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import SettingsPage from '@/app/(app)/settings/page'

function dataset(): SupabaseMockDataset {
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
      linked_institutions: [
        {
          id: 'li-1', household_id: 'hh-1', provider: 'plaid', provider_item_id: 'item-1',
          provider_institution_id: 'ins_1', institution_name: 'First Platypus Bank',
          status: 'active', created_by: 'u-me', created_at: '2026-07-10T00:00:00Z',
          updated_at: '2026-07-10T00:00:00Z', disconnected_at: null,
        },
      ],
      linked_accounts: [],
    },
    rpc: { ensure_entitlement: makeEntitlement() },
  }
}

beforeEach(() => {
  primeFxCache()
  stubNoNetwork()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('the Household section links to Linked banks with a connected-count peek', async () => {
  h.mock = makeSupabaseMock(dataset())
  render(
    <AppStateProvider>
      <SettingsPage />
    </AppStateProvider>
  )
  const entry = await waitFor(() => screen.getByRole('link', { name: /Linked banks/ }))
  expect(entry).toHaveAttribute('href', '/settings/linked-banks')
  expect(entry).toHaveTextContent('1 connected')
})

// @vitest-environment jsdom
// T017 (spec 024, US1/US4) — linked banks are household facts loaded with the
// bootstrap fan-out and refreshable on demand; clients only ever read them
// (writes happen in the plaid-* edge functions via service role).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from '../helpers/supabase-mock'
import type { LinkedAccount, LinkedInstitution } from '@/lib/types'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'

const INSTITUTION: LinkedInstitution = {
  id: 'li-1',
  household_id: 'hh-1',
  provider: 'plaid',
  provider_item_id: 'item-1',
  provider_institution_id: 'ins_109508',
  institution_name: 'First Platypus Bank',
  status: 'active',
  created_by: 'u-me',
  created_at: '2026-07-16T00:00:00Z',
  updated_at: '2026-07-16T00:00:00Z',
  disconnected_at: null,
}

const ACCOUNT: LinkedAccount = {
  id: 'la-1',
  institution_id: 'li-1',
  provider_account_id: 'acc-1',
  name: 'Plaid Checking',
  official_name: 'Plaid Gold Standard 0% Interest Checking',
  mask: '0000',
  account_type: 'depository',
  account_subtype: 'checking',
  created_at: '2026-07-16T00:00:00Z',
}

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
      linked_institutions: [INSTITUTION],
      linked_accounts: [ACCOUNT],
    },
    rpc: { ensure_entitlement: makeEntitlement() },
    ...overrides,
  }
}

let probe: ReturnType<typeof useApp> | null = null
function Probe() {
  probe = useApp()
  return null
}

async function boot(ds: SupabaseMockDataset) {
  h.mock = makeSupabaseMock(ds)
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
  await waitFor(() => expect(probe?.loading).toBe(false))
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

describe('bootstrap loads linked banks with the fan-out', () => {
  it('exposes linkedInstitutions and linkedAccounts via useApp()', async () => {
    await boot(dataset())
    expect(probe!.linkedInstitutions).toEqual([INSTITUTION])
    expect(probe!.linkedAccounts).toEqual([ACCOUNT])
    expect(probe!.bootstrapFailed).toBe(false)
  })

  it('an empty household has empty lists, not an error', async () => {
    const ds = dataset()
    ds.tables!.linked_institutions = []
    ds.tables!.linked_accounts = []
    await boot(ds)
    expect(probe!.linkedInstitutions).toEqual([])
    expect(probe!.linkedAccounts).toEqual([])
  })

  it('the client NEVER writes linked-bank state (service-role-only tables)', async () => {
    await boot(dataset())
    expect(h.mock!.callsFor('linked_institutions')).toHaveLength(0)
    expect(h.mock!.callsFor('linked_accounts')).toHaveLength(0)
  })
})

describe('refreshLinkedBanks', () => {
  it('refetches both tables (the post-connect/post-disconnect path)', async () => {
    const ds = dataset()
    await boot(ds)
    const second: LinkedInstitution = { ...INSTITUTION, id: 'li-2', provider_item_id: 'item-2', institution_name: 'Houndstooth Bank' }
    ds.tables!.linked_institutions = [INSTITUTION, second]
    ds.tables!.linked_accounts = [ACCOUNT, { ...ACCOUNT, id: 'la-2', institution_id: 'li-2', name: 'Houndstooth Checking' }]
    let ok = false
    await act(async () => {
      ok = await probe!.refreshLinkedBanks()
    })
    expect(ok).toBe(true)
    expect(probe!.linkedInstitutions).toHaveLength(2)
    expect(probe!.linkedAccounts).toHaveLength(2)
  })

  it('a failed refresh keeps the current lists and reports false', async () => {
    const ds = dataset()
    await boot(ds)
    ds.selectErrors = { linked_institutions: 'flaky network' }
    let ok = true
    await act(async () => {
      ok = await probe!.refreshLinkedBanks()
    })
    expect(ok).toBe(false)
    expect(probe!.linkedInstitutions).toEqual([INSTITUTION])
  })
})

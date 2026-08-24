// @vitest-environment jsdom
//
// Review 2026-08-24 write-path integrity findings against the store:
//  A5    — an RLS-refused delete (success with zero rows, per the harness
//          contract test) must not stand as deleted in the UI.
//  minor — deleteTransaction's error rollback was untested.
//  minor — the budgets upsert sent the client id, churning the row PK on
//          conflict; the payload must omit id.
//  minor — saveFixedCosts replace-all left phantom optimistic state (and no
//          restore) when the insert failed after the delete succeeded.
//  minor — a corrupt persisted currency key was adopted unvalidated.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'
import { makeTx } from './helpers/fixtures'
import type { Budget } from '@/lib/types'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

const { impact, notification } = vi.hoisted(() => ({
  impact: vi.fn(() => Promise.resolve()),
  notification: vi.fn(() => Promise.resolve()),
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, notification },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Warning: 'WARNING' },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

import { AppStateProvider, useApp } from '@/lib/store'

function dataset() {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [
        { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        {
          id: 'tx-1',
          household_id: 'hh-1',
          merchant: 'Costco',
          category: 'groceries',
          kind: 'expense',
          amount_cents: 5000,
          source: 'Checking',
          date: '2026-06-10T12:00:00Z',
          created_by: 'u-me',
          created_at: '2026-06-10T12:00:00Z',
          updated_at: '2026-06-10T12:00:00Z',
        },
      ],
      transaction_shares: [{ transaction_id: 'tx-1', person_id: 'u-me', amount_cents: 5000 }],
      cards: [],
      properties: [],
      mortgage_info: [],
      lease_info: [],
      units: [],
      rental_payments: [],
      budgets: [],
      user_fixed_costs: [
        { id: 'fc-old', user_id: 'u-me', label: 'Rent', amount_cents: 120000, kind: 'other', created_at: '2026-01-01T00:00:00Z' },
      ],
    },
  }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

async function renderStore() {
  render(
    <AppStateProvider>
      <Capture />
    </AppStateProvider>
  )
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => {
  stubNoNetwork()
  primeFxCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('deleteTransaction honesty (A5)', () => {
  it('restores the row when the server delete is RLS-filtered to zero rows', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), deleteNoop: { transactions: true } })
    await renderStore()

    await act(async () => {
      api.deleteTransaction('tx-1')
    })
    await waitFor(() => expect(api.transactions).toHaveLength(1))
    expect(api.transactions[0].id).toBe('tx-1')
    expect(api.error).not.toBeNull()
  })

  it('restores the row and surfaces the error when the delete errors', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), deleteErrors: { transactions: 'RLS denied' } })
    await renderStore()

    await act(async () => {
      api.deleteTransaction('tx-1')
    })
    await waitFor(() => expect(api.transactions).toHaveLength(1))
    expect(api.error).toContain('RLS denied')
  })
})

describe('budgets upsert payload', () => {
  it('omits the client id so a conflicting save never churns the row PK', async () => {
    h.mock = makeSupabaseMock(dataset())
    await renderStore()

    const budget: Budget = {
      id: 'client-uuid',
      household_id: 'hh-1',
      category: 'groceries',
      monthly_limit_cents: 60000,
      budget_type: 'fixed',
      rollover_cap_cents: null,
      person_id: null,
    }
    await act(async () => {
      api.addOrUpdateBudget(budget)
    })
    await waitFor(() => {
      const upsert = h.mock!.calls.find((c) => c.table === 'budgets' && c.op === 'upsert')
      expect(upsert).toBeDefined()
      expect(Object.keys(upsert!.payload as Record<string, unknown>)).not.toContain('id')
    })
  })
})

describe('saveFixedCosts failure honesty', () => {
  it('rolls back the optimistic rows when the insert fails after the delete', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { user_fixed_costs: 'insert boom' } })
    await renderStore()
    expect(api.userFixedCosts).toHaveLength(1)

    await act(async () => {
      await api.saveFixedCosts([{ label: 'New rent', amount_cents: 150000, kind: 'other' }])
    })
    // The failed batch must not keep rendering as saved.
    expect(api.userFixedCosts.map((c) => c.label)).toEqual(['Rent'])
    expect(api.error).toContain('insert boom')
  })
})

describe('persisted currency validation', () => {
  it('ignores a corrupt stored currency key', async () => {
    localStorage.setItem('currency', 'wat')
    h.mock = makeSupabaseMock(dataset())
    await renderStore()
    expect(api.currency).toBe('usd')
  })
})

describe('legacy localUsers fold', () => {
  it('keeps the localStorage backup when a fold insert fails', async () => {
    localStorage.setItem('localUsers', JSON.stringify([{ name: 'Nana' }]))
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { household_people: 'insert boom' } })
    await renderStore()
    expect(localStorage.getItem('localUsers')).not.toBeNull()
  })

  it('clears the backup only after a successful fold', async () => {
    localStorage.setItem('localUsers', JSON.stringify([{ name: 'Nana' }]))
    h.mock = makeSupabaseMock(dataset())
    await renderStore()
    await waitFor(() => expect(localStorage.getItem('localUsers')).toBeNull())
  })
})

// Review 2026-08-24: routine confirm/dismiss/rename was optimistic with NO
// rollback — a failed upsert left the phantom state in the session, diverging
// from the store's documented mutation contract (optimistic → error → restore
// previous state + banner).
describe('routine state rollback', () => {
  const CONFIRMED = {
    id: 'rs-1',
    household_id: 'hh-1',
    routine_key: 'rc:costco:m',
    status: 'confirmed',
    label: null,
    person_id: null,
    created_by: 'u-me',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }

  it('a failed confirm leaves no phantom state row', async () => {
    const d = dataset()
    h.mock = makeSupabaseMock({
      ...d,
      upsertErrors: { recognized_routine_states: 'RLS denied' },
    })
    await renderStore()
    await act(async () => {
      await api.confirmRoutine('rc:netflix:1')
    })
    expect(api.recognizedRoutineStates).toHaveLength(0)
    expect(api.error).toContain('RLS denied')
  })

  it('a failed dismiss restores the existing confirmed row', async () => {
    const d = dataset()
    d.tables = { ...d.tables, recognized_routine_states: [CONFIRMED] } as typeof d.tables & {
      recognized_routine_states: (typeof CONFIRMED)[]
    }
    h.mock = makeSupabaseMock({
      ...d,
      upsertErrors: { recognized_routine_states: 'network down' },
    })
    await renderStore()
    await waitFor(() => expect(api.recognizedRoutineStates).toHaveLength(1))
    await act(async () => {
      await api.dismissRoutine('rc:costco:m')
    })
    expect(api.recognizedRoutineStates).toHaveLength(1)
    expect(api.recognizedRoutineStates[0].status).toBe('confirmed')
    expect(api.error).toContain('network down')
  })
})

// @vitest-environment jsdom
// Spec 027 — store-level tag behavior: rehydration from transaction_tags, the
// household roster, optimistic addTag (dedup + create), and writeTags on save.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'
import { makeTx } from '../helpers/fixtures'

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
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        { id: 'tx-a', household_id: 'hh-1', merchant: 'Bistro', category: 'dining', kind: 'expense', amount_cents: 4000, source: 'Amex', date: '2026-06-10T12:00:00Z', created_by: 'u-me', created_at: '2026-06-10T12:00:00Z', updated_at: '2026-06-10T12:00:00Z', paid_by: 'u-me', notes: 'client dinner' },
        { id: 'tx-b', household_id: 'hh-1', merchant: 'Blue Bottle', category: 'coffee', kind: 'expense', amount_cents: 500, source: 'Amex', date: '2026-06-11T12:00:00Z', created_by: 'u-me', created_at: '2026-06-11T12:00:00Z', updated_at: '2026-06-11T12:00:00Z', paid_by: 'u-me', notes: null },
      ],
      transaction_shares: [
        { transaction_id: 'tx-a', person_id: 'u-me', amount_cents: 4000 },
        { transaction_id: 'tx-b', person_id: 'u-me', amount_cents: 500 },
      ],
      tags: [
        { id: 'tag-work', household_id: 'hh-1', name: 'work', created_at: '2026-01-01T00:00:00Z' },
        { id: 'tag-vacay', household_id: 'hh-1', name: 'Vacation', created_at: '2026-01-02T00:00:00Z' },
      ],
      transaction_tags: [
        { transaction_id: 'tx-a', tag_id: 'tag-work' },
        { transaction_id: 'tx-a', tag_id: 'tag-vacay' },
      ],
      cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
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

describe('store — tags (spec 027)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('rehydrates tx.tags from transaction_tags and exposes the household roster + notes', async () => {
    await renderStore()
    expect(api.tags.map((t) => t.name).sort()).toEqual(['Vacation', 'work'])
    const a = api.transactions.find((t) => t.id === 'tx-a')!
    const b = api.transactions.find((t) => t.id === 'tx-b')!
    expect((a.tags ?? []).sort()).toEqual(['tag-vacay', 'tag-work'])
    expect(b.tags ?? []).toEqual([]) // no join rows → materialized to []
    expect(a.notes).toBe('client dinner')
    expect(b.notes).toBeNull()
  })

  it('addTag reuses an existing tag case-insensitively (no duplicate, no insert)', async () => {
    await renderStore()
    const before = api.tags.length
    let returned: { id: string } | undefined
    await act(async () => { returned = api.addTag('  VACATION ') })
    expect(returned!.id).toBe('tag-vacay')
    expect(api.tags).toHaveLength(before) // reused, not created
    expect(h.mock!.callsFor('tags').some((c) => c.op === 'insert')).toBe(false)
  })

  it('addTag creates a new household tag optimistically and persists it', async () => {
    await renderStore()
    const before = api.tags.length
    let returned: { id: string; name: string } | undefined
    await act(async () => { returned = api.addTag('Reimbursable') })
    expect(api.tags).toHaveLength(before + 1)
    expect(returned!.name).toBe('Reimbursable')
    await waitFor(() => expect(h.mock!.callsFor('tags').some((c) => c.op === 'insert')).toBe(true))
    expect(api.error).toBeNull()
  })

  it('addTransaction with tags writes the transaction_tags join', async () => {
    await renderStore()
    const tx = makeTx({ id: 'tx-new', merchant: 'Airbnb', amount_cents: 9000, owner_ids: ['u-me'], household_id: 'hh-1', tags: ['tag-vacay'] })
    await act(async () => { api.addTransaction(tx) })
    await waitFor(() => expect(h.mock!.callsFor('transaction_tags').some((c) => c.op === 'insert')).toBe(true))
    const insert = h.mock!.callsFor('transaction_tags').find((c) => c.op === 'insert')!
    expect(insert.payload).toEqual([{ transaction_id: 'tx-new', tag_id: 'tag-vacay' }])
  })

  it('a failed tag write surfaces an error but keeps the saved transaction (no rollback)', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { transaction_tags: 'tag RLS denied' } })
    await renderStore()
    const startLen = api.transactions.length
    const tx = makeTx({ id: 'tx-keep', merchant: 'Hotel', amount_cents: 12000, owner_ids: ['u-me'], household_id: 'hh-1', tags: ['tag-work'] })
    await act(async () => { api.addTransaction(tx) })
    await waitFor(() => expect(api.error).toBeTruthy())
    // The transaction itself survives — tags are non-critical metadata.
    expect(api.transactions.find((t) => t.id === 'tx-keep')).toBeDefined()
    expect(api.transactions).toHaveLength(startLen + 1)
  })
})

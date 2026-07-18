// @vitest-environment jsdom
//
// Tests for the upsert_transaction RPC path (spec 027-ledger-atomic-persistence).
// Verifies that addTransaction and updateTransaction call the RPC instead of the
// old two-step write, and that the store rolls back optimistic state on RPC failure.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'
import { makeTx } from './helpers/fixtures'
import { persist, txRecord, shareRows } from '../scripts/import/db/persist'
import type { Transaction } from '../lib/types'

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

function dataset(overrides: Parameters<typeof makeSupabaseMock>[0] = {}) {
  return makeSupabaseMock({
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'u-jordan', household_id: 'hh-1', name: 'Jordan', initial: 'J', color_key: 'slate', linked_user_id: 'u-jordan', sort_order: 1, removed_at: null, created_at: '2026-01-02T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [],
      transaction_shares: [],
      cards: [],
      properties: [],
      mortgage_info: [],
      lease_info: [],
      units: [],
      rental_payments: [],
      budgets: [],
    },
    ...overrides,
  })
}

let api: ReturnType<typeof useApp>
function Capture() { api = useApp(); return null }

async function renderStore() {
  stubNoNetwork()
  primeFxCache()
  render(<AppStateProvider><Capture /></AppStateProvider>)
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => { h.mock = dataset() })
afterEach(() => { cleanup(); vi.clearAllMocks() })

// ── T006: valid create calls the RPC ─────────────────────────────────────────

describe('addTransaction — atomic RPC path', () => {
  it('calls upsert_transaction RPC and commits the row optimistically', async () => {
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-new', merchant: 'Blue Bottle', amount_cents: 450, owner_ids: ['u-me'], household_id: 'hh-1', created_by: 'u-me' })
    await act(async () => { api.addTransaction(tx) })

    await waitFor(() => expect(api.transactions).toHaveLength(startLen + 1))
    expect(api.transactions[0].id).toBe('tx-new')
    expect(h.mock!.rpcCalls).toContain('upsert_transaction')
    // No direct table insert — the RPC owns both writes.
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'insert')).toBe(false)
  })

  // ── Payload shape: the store must send exactly the RPC contract's p_tx / p_shares,
  //    leaking no domain-only fields and materializing shares that sum to the amount.
  it('sends a well-formed p_tx / p_shares payload (no owner_ids/shares leak; shares reconcile)', async () => {
    await renderStore()
    const tx = makeTx({ id: 'tx-shape', merchant: 'Bistro', amount_cents: 450, owner_ids: ['u-me', 'u-jordan'], household_id: 'hh-1', created_by: 'u-me' })
    await act(async () => { api.addTransaction(tx) })

    await waitFor(() => expect(h.mock!.rpcInvocations.some((c) => c.name === 'upsert_transaction')).toBe(true))
    const call = h.mock!.rpcInvocations.find((c) => c.name === 'upsert_transaction')!
    const { p_tx, p_shares } = call.params as {
      p_tx: Record<string, unknown>
      p_shares: Array<{ person_id: string; amount_cents: number }>
    }

    // p_tx is exactly the transactions column shape — no owner_ids / shares / scope.
    expect(p_tx).toEqual({
      id: 'tx-shape',
      household_id: 'hh-1',
      merchant: 'Bistro',
      category: 'groceries',
      kind: 'expense',
      amount_cents: 450,
      source: 'Checking',
      date: '2026-06-12T12:00:00.000Z',
      created_by: 'u-me',
      paid_by: null, // payer-less row writes null (settle-up contract)
    })
    expect('owner_ids' in p_tx).toBe(false)
    expect('shares' in p_tx).toBe(false)

    // p_shares: one row per owner, summing to amount_cents (the DB sum invariant).
    expect(p_shares.map((s) => s.person_id)).toEqual(['u-me', 'u-jordan'])
    expect(p_shares.reduce((n, s) => n + s.amount_cents, 0)).toBe(450)
  })

  // ── T007: sum-mismatch error rolls back ───────────────────────────────────

  it('rolls back optimistic state when RPC returns SHARES_MISMATCH', async () => {
    h.mock = dataset({ rpcErrors: { upsert_transaction: new Error('SHARES_MISMATCH: shares sum 300 != transaction amount 450') } })
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-fail', merchant: 'Bistro', amount_cents: 450, owner_ids: ['u-me', 'u-jordan'], household_id: 'hh-1', created_by: 'u-me' })
    await act(async () => { api.addTransaction(tx) })

    await waitFor(() => expect(api.error).not.toBeNull())
    expect(api.transactions.find((t) => t.id === 'tx-fail')).toBeUndefined()
    expect(api.transactions).toHaveLength(startLen)
    // No compensating delete needed — the RPC is atomic.
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'delete')).toBe(false)
  })

  // ── T008: no-shares error rolls back ─────────────────────────────────────

  it('rolls back optimistic state when RPC returns NO_SHARES', async () => {
    h.mock = dataset({ rpcErrors: { upsert_transaction: new Error('NO_SHARES: transaction must have at least one owner share') } })
    await renderStore()
    const startLen = api.transactions.length

    const tx = makeTx({ id: 'tx-noshares', merchant: 'Bistro', amount_cents: 450, owner_ids: [], household_id: 'hh-1', created_by: 'u-me' })
    await act(async () => { api.addTransaction(tx) })

    await waitFor(() => expect(api.error).not.toBeNull())
    expect(api.transactions.find((t) => t.id === 'tx-noshares')).toBeUndefined()
    expect(api.transactions).toHaveLength(startLen)
  })
})

// ── T012: update path calls the RPC ──────────────────────────────────────────

describe('updateTransaction — atomic RPC path', () => {
  it('calls upsert_transaction RPC (same id) and replaces the row', async () => {
    const existing = makeTx({ id: 'tx-exist', merchant: 'Costco', amount_cents: 5000, owner_ids: ['u-me'], household_id: 'hh-1', created_by: 'u-me' })
    h.mock = dataset()
    // Seed the store with an existing transaction in the initial load.
    h.mock!.client.auth // already set up; add tx to tables via a second mock setup
    // Use the pattern from store.test.tsx: render with tx in tables
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
        household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
        household_people: [
          { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        ],
        households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
        transactions: [{ id: 'tx-exist', household_id: 'hh-1', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: 5000, source: '', date: '2026-07-01T00:00:00Z', created_by: 'u-me', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' }],
        transaction_shares: [{ transaction_id: 'tx-exist', person_id: 'u-me', amount_cents: 5000 }],
        cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      },
    })
    await renderStore()

    const edited = { ...existing, merchant: 'Whole Foods', amount_cents: 4200, shares: { 'u-me': 4200 } }
    await act(async () => { api.updateTransaction(edited) })

    await waitFor(() => expect(api.transactions.find((t) => t.id === 'tx-exist')?.merchant).toBe('Whole Foods'))
    expect(h.mock!.rpcCalls).toContain('upsert_transaction')
    // No direct table update — the RPC owns both writes.
    expect(h.mock!.callsFor('transactions').some((c) => c.op === 'update')).toBe(false)
  })

  // ── T013: update with bad sum restores original ───────────────────────────

  it('restores original when RPC returns an error on update', async () => {
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
        household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
        household_people: [{ id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' }],
        households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
        transactions: [{ id: 'tx-orig', household_id: 'hh-1', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: 5000, source: '', date: '2026-07-01T00:00:00Z', created_by: 'u-me', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' }],
        transaction_shares: [{ transaction_id: 'tx-orig', person_id: 'u-me', amount_cents: 5000 }],
        cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      },
      rpcErrors: { upsert_transaction: new Error('SHARES_MISMATCH: shares sum 3000 != transaction amount 4200') },
    })
    await renderStore()

    const edited = makeTx({ id: 'tx-orig', merchant: 'Whole Foods', amount_cents: 4200, owner_ids: ['u-me'], household_id: 'hh-1', created_by: 'u-me' })
    await act(async () => { api.updateTransaction(edited) })

    // Both the error flag and the restored merchant must be stable together.
    await waitFor(() => {
      expect(api.error).not.toBeNull()
      expect(api.transactions.find((t) => t.id === 'tx-orig')?.merchant).toBe('Costco')
    })
  })
})

// ── T017: CLI persist() calls the RPC ────────────────────────────────────────

const cliTx: Transaction = {
  id: 'cli-tx-1',
  household_id: 'hh-cli',
  merchant: 'Costco',
  category: 'groceries',
  kind: 'expense',
  amount_cents: 5000,
  source: 'TD Bank',
  date: '2026-07-01T00:00:00.000Z',
  created_by: 'u-me',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  owner_ids: ['u-me'],
  shares: { 'u-me': 5000 },
}

describe('persist() — CLI atomic RPC path', () => {
  it('calls upsert_transaction RPC for each transaction and returns the count', async () => {
    const rpcCalls: Array<{ name: string }> = []
    const fake = {
      rpc: (name: string) => {
        rpcCalls.push({ name })
        return Promise.resolve({ error: null })
      },
    } as never

    const n = await persist(fake, [cliTx, { ...cliTx, id: 'cli-tx-2' }])
    expect(n).toBe(2)
    expect(rpcCalls).toHaveLength(2)
    expect(rpcCalls.every((c) => c.name === 'upsert_transaction')).toBe(true)
  })

  it('throws a typed UPSERT_TX error on RPC failure and stops', async () => {
    let calls = 0
    const fake = {
      rpc: () => {
        calls++
        return Promise.resolve({ error: { message: 'SHARES_MISMATCH: ...' } })
      },
    } as never

    await expect(persist(fake, [cliTx, { ...cliTx, id: 'cli-tx-2' }])).rejects.toThrow(/UPSERT_TX/)
    expect(calls).toBe(1) // stops after first failure
  })
})

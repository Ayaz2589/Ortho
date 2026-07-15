// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'
import { makeTx } from '../helpers/fixtures'

// Swap the store's Supabase client for the in-memory mock (no network).
const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(() => Promise.resolve()), notification: vi.fn(() => Promise.resolve()) },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Warning: 'WARNING' },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

// Count actual row renders deterministically: each <TransactionRow> calls the
// store's formatMoney exactly once, with its own (unique) amount_cents. Spying
// on the underlying money formatter attributes each render to a specific row —
// immune to Profiler-bailout ambiguity. Calls are keyed by the first arg (cents).
const fmt = vi.hoisted(() => ({ cents: [] as number[] }))
vi.mock('@/lib/finance/money', async (orig) => {
  const actual = await orig<typeof import('@/lib/finance/money')>()
  return {
    ...actual,
    formatMoney: (cents: number, ...rest: unknown[]) => {
      fmt.cents.push(cents)
      return (actual.formatMoney as (...a: unknown[]) => string)(cents, ...rest)
    },
  }
})

// Import AFTER the mocks are registered.
import { AppStateProvider, useApp } from '@/lib/store'
import { TransactionRow } from '@/components/transactions/TransactionRow'

// Distinct amounts so each row's render is individually countable.
const CENTS_A = 5000
const CENTS_B = 3000
const CENTS_NEW = 450
const rendersOf = (cents: number) => fmt.cents.filter((c) => c === cents).length

function dataset() {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [{ id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' }],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        { id: 'tx-a', household_id: 'hh-1', merchant: 'Costco', category: 'groceries', kind: 'expense', amount_cents: CENTS_A, source: 'Checking', date: '2026-06-10T12:00:00Z', created_by: 'u-me', created_at: '2026-06-10T12:00:00Z', updated_at: '2026-06-10T12:00:00Z' },
        { id: 'tx-b', household_id: 'hh-1', merchant: 'Shell', category: 'fuel', kind: 'expense', amount_cents: CENTS_B, source: 'Checking', date: '2026-06-09T12:00:00Z', created_by: 'u-me', created_at: '2026-06-09T12:00:00Z', updated_at: '2026-06-09T12:00:00Z' },
      ],
      transaction_shares: [
        { transaction_id: 'tx-a', person_id: 'u-me', amount_cents: CENTS_A },
        { transaction_id: 'tx-b', person_id: 'u-me', amount_cents: CENTS_B },
      ],
      cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
    },
  }
}

let api: ReturnType<typeof useApp>

// Render every transaction as a real <TransactionRow>, each with fresh inline
// callbacks every render (mirroring the real transactions page) so the test also
// proves the memo ignores callback-identity churn.
function Ledger() {
  api = useApp()
  return (
    <>
      {api.transactions.map((tx) => (
        <TransactionRow key={tx.id} tx={tx} onOpen={() => {}} onCopy={() => {}} onDelete={() => {}} />
      ))}
    </>
  )
}

describe('store context render isolation (US6/P4)', () => {
  beforeEach(() => {
    h.mock = makeSupabaseMock(dataset())
    stubNoNetwork()
    primeFxCache()
    fmt.cents.length = 0
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('an unrelated optimistic add does not re-render an existing, unchanged row', async () => {
    render(
      <AppStateProvider>
        <Ledger />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))
    await waitFor(() => expect(rendersOf(CENTS_B)).toBeGreaterThanOrEqual(1))

    const before = rendersOf(CENTS_B)

    // Add an unrelated transaction: it prepends a NEW row and leaves every
    // existing row's `tx` identity untouched, so row tx-b must not re-render.
    const fresh = makeTx({ id: 'tx-new', merchant: 'Blue Bottle', amount_cents: CENTS_NEW, owner_ids: ['u-me'], household_id: 'hh-1' })
    await act(async () => { api.addTransaction(fresh) })
    await waitFor(() => expect(rendersOf(CENTS_NEW)).toBeGreaterThanOrEqual(1))

    expect(rendersOf(CENTS_B)).toBe(before)
  })
})

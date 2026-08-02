// @vitest-environment jsdom
//
// Data-integrity guarantees of the store (parity wave 1, audit 2026-07-02):
// supabase-js reports failures via `{ error }` without throwing, so every
// missed check reads as success. These tests pin the fail-loud paths:
//  - bootstrap must NOT create a duplicate household when the membership
//    read fails transiently
//  - a failed table read surfaces an error instead of a fake empty state
//  - property add/update roll back locally when a sub-table write fails
//  - a failed property delete restores the locally-cascaded rental payments
//  - a failed budget upsert rolls back the optimistic value
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock, type SupabaseMockDataset } from './helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

// Import AFTER the mock is registered.
import { AppStateProvider, useApp } from '@/lib/store'
import { housingSummary } from '@/lib/finance/housing-summary'
import { monthlyPaymentCents } from '@/lib/finance/mortgage'
import { netRentalCents, rentUnitsFrom } from '@/lib/finance/housing'
import type { Property } from '@/lib/types'

const MORTGAGE = {
  property_id: 'prop-1',
  purchase_price_cents: 50_000_000,
  original_loan_cents: 40_000_000,
  annual_interest_rate_percent: 6,
  loan_term_years: 30,
  closing_date: '2024-03-01',
  auto_pay_source: null,
}

function dataset(): SupabaseMockDataset {
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
      transactions: [],
      transaction_shares: [],
      cards: [],
      properties: [
        { id: 'prop-1', household_id: 'hh-1', kind: 'primaryHome', address: '124 Oak Lane', nickname: 'Home base', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      mortgage_info: [MORTGAGE],
      lease_info: [],
      units: [],
      rental_payments: [
        { id: 'rp-1', property_id: 'prop-1', amount_cents: 150_000, date: '2026-06-01T12:00:00.000Z', note: null, created_at: '2026-06-01T12:00:00Z' },
      ],
      budgets: [
        { id: 'b-1', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 40_000 },
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
  primeFxCache()
  stubNoNetwork()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('bootstrap fail-loud', () => {
  it('does not create a household when the membership read fails', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: { household_members: 'transient read failure' },
    })
    await renderStore()

    expect(api.error).toMatch(/transient read failure/)
    // The dangerous outcome: falling into the create branch on a failed read.
    expect(h.mock.callsFor('households').filter((c) => c.op === 'insert')).toHaveLength(0)
    expect(h.mock.callsFor('household_members').filter((c) => c.op === 'insert')).toHaveLength(0)
  })

  it('surfaces a failed table read as an error instead of a fake empty state', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: { transactions: 'transactions read failed' },
    })
    await renderStore()

    expect(api.error).toMatch(/transactions read failed/)
  })
})

describe('bootstrap profile row', () => {
  it('leaves an existing users profile row untouched (no upsert, no insert)', async () => {
    h.mock = makeSupabaseMock(dataset())
    await renderStore()

    expect(api.error).toBeNull()
    expect(h.mock.callsFor('users')).toHaveLength(0)
  })

  it('inserts the profile row only when absent', async () => {
    const d = dataset()
    d.tables!.users = []
    h.mock = makeSupabaseMock(d)
    await renderStore()

    const writes = h.mock.callsFor('users')
    expect(writes).toHaveLength(1)
    expect(writes[0].op).toBe('insert')
  })
})

describe('mid-session sign-out', () => {
  it('clears state immediately on a SIGNED_OUT auth event', async () => {
    h.mock = makeSupabaseMock(dataset())
    await renderStore()
    expect(api.currentUserId).toBe('u-me')
    expect(api.properties).toHaveLength(1)

    act(() => h.mock!.emitAuthChange('SIGNED_OUT'))
    expect(api.currentUserId).toBe('')
    expect(api.properties).toHaveLength(0)
    expect(api.transactions).toHaveLength(0)
    expect(api.currentHousehold).toBeNull()
  })
})

describe('error banner', () => {
  it('dismissError clears the banner; a failed bootstrap flags retry', async () => {
    h.mock = makeSupabaseMock({
      ...dataset(),
      selectErrors: { transactions: 'transactions read failed' },
    })
    await renderStore()

    expect(api.error).toMatch(/transactions read failed/)
    expect(api.bootstrapFailed).toBe(true)
    act(() => api.dismissError())
    expect(api.error).toBeNull()
  })

  it('retryBootstrap re-runs the bootstrap and recovers once the failure clears', async () => {
    const failing: SupabaseMockDataset = {
      ...dataset(),
      selectErrors: { transactions: 'transactions read failed' },
    }
    h.mock = makeSupabaseMock(failing)
    await renderStore()
    expect(api.bootstrapFailed).toBe(true)

    // Heal the transient failure (the mock reads selectErrors per query),
    // then retry — the store reloads cleanly.
    delete failing.selectErrors!.transactions
    act(() => api.retryBootstrap())
    await waitFor(() => expect(api.loading).toBe(false))
    expect(api.error).toBeNull()
    expect(api.bootstrapFailed).toBe(false)
  })
})

describe('unknown enum resilience', () => {
  it('drops a row with an unknown category/kind and keeps the rest (no crash)', async () => {
    const d = dataset()
    d.tables!.transactions = [
      { id: 'tx-ok', household_id: 'hh-1', merchant: 'Grocer', category: 'groceries', kind: 'expense', amount_cents: 1000, source: 'Visa', date: '2026-06-10T12:00:00.000Z', created_by: 'u-me', created_at: '2026-06-10T12:00:00Z', updated_at: '2026-06-10T12:00:00Z', paid_by: 'u-me' },
      { id: 'tx-bad-cat', household_id: 'hh-1', merchant: 'Mystery', category: 'futurecat', kind: 'expense', amount_cents: 2000, source: 'Visa', date: '2026-06-11T12:00:00.000Z', created_by: 'u-me', created_at: '2026-06-11T12:00:00Z', updated_at: '2026-06-11T12:00:00Z', paid_by: 'u-me' },
      { id: 'tx-bad-kind', household_id: 'hh-1', merchant: 'Mystery 2', category: 'groceries', kind: 'futurekind', amount_cents: 3000, source: 'Visa', date: '2026-06-12T12:00:00.000Z', created_by: 'u-me', created_at: '2026-06-12T12:00:00Z', updated_at: '2026-06-12T12:00:00Z', paid_by: 'u-me' },
    ]
    d.tables!.transaction_shares = [
      { transaction_id: 'tx-ok', person_id: 'u-me', amount_cents: 1000 },
      { transaction_id: 'tx-bad-cat', person_id: 'u-me', amount_cents: 2000 },
    ]
    h.mock = makeSupabaseMock(d)
    await renderStore()

    // One bad row disappears; everything else renders; no error is raised.
    expect(api.error).toBeNull()
    expect(api.transactions.map((t) => t.id)).toEqual(['tx-ok'])
  })
})

describe('FX fallback', () => {
  it('keeps stale cached rates when the live fetch fails (never reverts to hardcoded)', async () => {
    // Cache a real-but-stale rate table (25h old), then kill the network.
    localStorage.setItem('fxRates', JSON.stringify({ usd: 1, gbp: 0.5 }))
    localStorage.setItem('fxRatesFetchedAt', String(Date.now() - 25 * 60 * 60 * 1000))
    h.mock = makeSupabaseMock(dataset())
    await renderStore()

    await waitFor(() => expect(api.ratesError).not.toBeNull())
    // The stale cached rate wins over the hardcoded approximation (0.78).
    expect(api.rate('gbp')).toBe(0.5)
    expect(api.ratesLastFetched).not.toBeNull()
  })
})

describe('property write rollback', () => {
  it('rolls back addProperty when a sub-table write fails', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { units: 'units insert failed' } })
    await renderStore()

    const p: Property = {
      id: 'prop-new',
      household_id: 'hh-1',
      kind: 'multifamily',
      address: '9 Elm St',
      nickname: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      units: [
        { id: 'unit-1', property_id: 'prop-new', name: 'Unit 1', monthly_rent_cents: 120_000, tenant_name: null, tenant_email: null, sort_order: 0 },
      ],
    }
    act(() => api.addProperty(p))
    await waitFor(() => expect(api.error).toMatch(/units insert failed/))
    expect(api.properties.find((x) => x.id === 'prop-new')).toBeUndefined()
  })

  it('rolls back updateProperty when a sub-table write fails', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { mortgage_info: 'mortgage write failed' } })
    await renderStore()

    const original = api.properties.find((x) => x.id === 'prop-1')!
    act(() =>
      api.updateProperty({
        ...original,
        nickname: 'Renamed',
        mortgage: { ...MORTGAGE, original_loan_cents: 39_000_000 },
      })
    )
    await waitFor(() => expect(api.error).toMatch(/mortgage write failed/))
    const after = api.properties.find((x) => x.id === 'prop-1')!
    expect(after.nickname).toBe('Home base')
    expect(after.mortgage?.original_loan_cents).toBe(40_000_000)
  })

  it('restores cascaded rental payments when the property delete fails', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), deleteErrors: { properties: 'delete blocked' } })
    await renderStore()
    expect(api.rentalPayments).toHaveLength(1)

    act(() => api.deleteProperty('prop-1'))
    await waitFor(() => expect(api.error).toMatch(/delete blocked/))
    expect(api.properties.find((x) => x.id === 'prop-1')).toBeDefined()
    expect(api.rentalPayments).toHaveLength(1)
  })
})

describe('budget rollback', () => {
  it('restores the previous limit when the upsert fails', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), upsertErrors: { budgets: 'budget save failed' } })
    await renderStore()

    const original = api.budgets.find((b) => b.id === 'b-1')!
    act(() => api.addOrUpdateBudget({ ...original, monthly_limit_cents: 99_999 }))
    await waitFor(() => expect(api.error).toMatch(/budget save failed/))
    expect(api.budgets.find((b) => b.id === 'b-1')?.monthly_limit_cents).toBe(40_000)
  })

  it('removes a new budget when the upsert fails', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), upsertErrors: { budgets: 'budget save failed' } })
    await renderStore()

    act(() =>
      api.addOrUpdateBudget({ id: 'b-new', household_id: 'hh-1', category: 'dining', monthly_limit_cents: 20_000, budget_type: 'fixed', rollover_cap_cents: null })
    )
    await waitFor(() => expect(api.error).toMatch(/budget save failed/))
    expect(api.budgets.find((b) => b.category === 'dining')).toBeUndefined()
  })
})

describe('desktop housing summary', () => {
  const base = { household_id: 'hh-1', nickname: null, created_at: '', updated_at: '' }

  it('includes a mortgage-free multifamily in net rental income (occupied units)', () => {
    const paidOff: Property = {
      ...base,
      id: 'p-multi',
      kind: 'multifamily',
      address: '9 Elm St',
      units: [
        { id: 'u1', property_id: 'p-multi', name: 'Unit 1', monthly_rent_cents: 120_000, tenant_name: 'Alice', tenant_email: null, sort_order: 0 },
        { id: 'u2', property_id: 'p-multi', name: 'Unit 2', monthly_rent_cents: 80_000, tenant_name: 'Bob', tenant_email: null, sort_order: 1 },
      ],
    }
    const s = housingSummary([paidOff])
    expect(s.multi).toBe(true)
    expect(s.netRental).toBe(200_000)
    expect(s.cost).toBe(0)
  })

  it('subtracts the mortgage payment when the multifamily has one', () => {
    const mortgaged: Property = {
      ...base,
      id: 'p-multi',
      kind: 'multifamily',
      address: '9 Elm St',
      mortgage: { ...MORTGAGE, property_id: 'p-multi' },
      units: [
        { id: 'u1', property_id: 'p-multi', name: 'Unit 1', monthly_rent_cents: 400_000, tenant_name: 'Carol', tenant_email: null, sort_order: 0 },
      ],
    }
    const s = housingSummary([mortgaged])
    expect(s.multi).toBe(true)
    // rent − payment: the payment figure itself is pinned by the mortgage
    // golden vectors; here we only assert it was subtracted.
    expect(s.netRental).toBeLessThan(400_000)
    expect(s.netRental).toBe(400_000 - s.cost)
  })

  it('net rental excludes vacant units — Dashboard summary matches the property detail (US2)', () => {
    // One occupied ($2,000) + one vacant ($2,600), mortgage present. The Dashboard
    // housingSummary and the property-detail Net balance must agree, and the vacant
    // unit's asking rent must NOT inflate the figure.
    const mixed: Property = {
      ...base,
      id: 'p-multi',
      kind: 'multifamily',
      address: '9 Elm St',
      mortgage: { ...MORTGAGE, property_id: 'p-multi' },
      units: [
        { id: 'u1', property_id: 'p-multi', name: 'Unit 1', monthly_rent_cents: 200_000, tenant_name: 'Dana', tenant_email: null, sort_order: 0 },
        { id: 'u2', property_id: 'p-multi', name: 'Unit 2', monthly_rent_cents: 260_000, tenant_name: null, tenant_email: null, sort_order: 1 },
      ],
    }
    const pay = monthlyPaymentCents(MORTGAGE.original_loan_cents, MORTGAGE.annual_interest_rate_percent, MORTGAGE.loan_term_years)
    const detailNet = netRentalCents(rentUnitsFrom(mixed.units ?? []), pay) // property-detail computation
    const s = housingSummary([mixed])
    expect(s.netRental).toBe(detailNet) // Dashboard == detail
    expect(s.netRental).toBe(200_000 - pay) // vacant $2,600 excluded
  })
})

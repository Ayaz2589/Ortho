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
import { housingSummary } from '@/components/web/DashboardDesktop'
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
      api.addOrUpdateBudget({ id: 'b-new', household_id: 'hh-1', category: 'dining', monthly_limit_cents: 20_000 })
    )
    await waitFor(() => expect(api.error).toMatch(/budget save failed/))
    expect(api.budgets.find((b) => b.category === 'dining')).toBeUndefined()
  })
})

describe('desktop housing summary', () => {
  const base = { household_id: 'hh-1', nickname: null, created_at: '', updated_at: '' }

  it('includes a mortgage-free multifamily in net rental income', () => {
    const paidOff: Property = {
      ...base,
      id: 'p-multi',
      kind: 'multifamily',
      address: '9 Elm St',
      units: [
        { id: 'u1', property_id: 'p-multi', name: 'Unit 1', monthly_rent_cents: 120_000, tenant_name: null, tenant_email: null, sort_order: 0 },
        { id: 'u2', property_id: 'p-multi', name: 'Unit 2', monthly_rent_cents: 80_000, tenant_name: null, tenant_email: null, sort_order: 1 },
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
        { id: 'u1', property_id: 'p-multi', name: 'Unit 1', monthly_rent_cents: 400_000, tenant_name: null, tenant_email: null, sort_order: 0 },
      ],
    }
    const s = housingSummary([mortgaged])
    expect(s.multi).toBe(true)
    // rent − payment: the payment figure itself is pinned by the mortgage
    // golden vectors; here we only assert it was subtracted.
    expect(s.netRental).toBeLessThan(400_000)
    expect(s.netRental).toBe(400_000 - s.cost)
  })
})

// @vitest-environment jsdom
//
// Review 2026-08-24 (minor, FX round-trip family): PropertyForm prefills every
// money field from stored cents and always re-parses on submit, so a no-op
// edit under a lossy display rate (GBP 0.78) silently rewrote
// purchase/loan/rent/deposit by ±1¢. Untouched fields must save the stored
// cents verbatim (the TxForm originalAmountText pattern).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Property } from '@/lib/types'

const H = vi.hoisted(() => ({ addProperty: vi.fn(), updateProperty: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'gbp',
    rate: () => 0.78,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    addProperty: H.addProperty,
    updateProperty: H.updateProperty,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { AddPropertyModal } from '@/components/housing/AddPropertyModal'

// 400002¢ → "3120.02" → re-parse 400003¢; 300002¢ → "2340.02" → 300003¢.
const HOME: Property = {
  id: 'prop-1',
  household_id: 'h1',
  kind: 'primary_home',
  address: '12 Elm St',
  nickname: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  mortgage: {
    property_id: 'prop-1',
    purchase_price_cents: 400002,
    original_loan_cents: 300002,
    annual_interest_rate_percent: 6.25,
    loan_term_years: 30,
    closing_date: '2024-03-15',
    auto_pay_source: null,
  },
  units: [],
}

const RENTAL: Property = {
  id: 'prop-2',
  household_id: 'h1',
  kind: 'rental',
  address: '9 Birch St',
  nickname: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  lease: {
    property_id: 'prop-2',
    monthly_rent_cents: 400002,
    lease_start: '2026-01-01',
    lease_end: '2027-01-01',
    security_deposit_cents: 300002,
    paid_with_source: null,
  },
  units: [],
}

beforeEach(() => {
  H.addProperty.mockClear()
  H.updateProperty.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(cleanup)

describe('PropertyForm FX round-trip guard', () => {
  it('a no-op mortgage edit in GBP preserves purchase and loan cents', async () => {
    const user = userEvent.setup()
    render(<AddPropertyModal open kind="primary_home" editing={HOME} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save property' }))

    expect(H.updateProperty).toHaveBeenCalledTimes(1)
    const saved = H.updateProperty.mock.calls[0][0] as Property
    expect(saved.mortgage!.purchase_price_cents).toBe(400002)
    expect(saved.mortgage!.original_loan_cents).toBe(300002)
  })

  it('a no-op rental edit in GBP preserves rent and deposit cents', async () => {
    const user = userEvent.setup()
    render(<AddPropertyModal open kind="rental" editing={RENTAL} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save property' }))

    expect(H.updateProperty).toHaveBeenCalledTimes(1)
    const saved = H.updateProperty.mock.calls[0][0] as Property
    expect(saved.lease!.monthly_rent_cents).toBe(400002)
    expect(saved.lease!.security_deposit_cents).toBe(300002)
  })
})

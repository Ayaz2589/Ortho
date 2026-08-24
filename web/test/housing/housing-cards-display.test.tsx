// @vitest-environment jsdom
//
// Review 2026-08-24 housing render-layer findings:
//  B5    — the "Principal paid down" card printed paid-down/original-loan as
//          its money pair but computed the % and progress bar from
//          equity/purchase-price (a different basis): on the seed household it
//          read "$14,691.62 of $496,000.00 · 22.4%" where the true ratio is
//          3.0%. The fraction must come from the printed pair.
//  minor — after maturity, the "Principal balance" row showed the raw sub-$5
//          floating-point residual next to a 100% card; spec 027 requires
//          "Paid off" (the clamp the sibling cards already use).
//  B7    — the per-unit "Vacant"/tenant label inferred occupancy from tenant
//          name while the money beside it honours the explicit spec-020
//          `occupied` flag — label and money could contradict on one screen.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { MortgageInfo, Property } from '@/lib/types'
import { currentPrincipalBalanceCents, PAID_OFF_THRESHOLD_CENTS } from '@/lib/finance/mortgage'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
  }),
}))

import { EquityProgress, MortgageDetails } from '@/components/housing/MortgageCards'
import { UnitsCard } from '@/components/housing/MultifamilyCards'

// The repo seed household's mortgage: purchase $620k, loan $496k — a down
// payment exists, so the two bases visibly diverge.
const SEED_MORTGAGE: MortgageInfo = {
  property_id: 'p1',
  purchase_price_cents: 62_000_000,
  original_loan_cents: 49_600_000,
  annual_interest_rate_percent: 6.25,
  loan_term_years: 30,
  closing_date: '2024-03-15',
  auto_pay_source: null,
}

const MATURED_MORTGAGE: MortgageInfo = {
  ...SEED_MORTGAGE,
  closing_date: '1990-01-01',
}

afterEach(cleanup)

describe('EquityProgress basis coherence (B5)', () => {
  it('the % matches the printed paid-down / original-loan pair', () => {
    render(<EquityProgress mortgage={SEED_MORTGAGE} />)
    const balance = currentPrincipalBalanceCents(
      SEED_MORTGAGE.original_loan_cents,
      SEED_MORTGAGE.annual_interest_rate_percent,
      SEED_MORTGAGE.loan_term_years,
      SEED_MORTGAGE.closing_date
    )
    const paidDown = SEED_MORTGAGE.original_loan_cents - balance
    const expectedPct = ((paidDown / SEED_MORTGAGE.original_loan_cents) * 100).toFixed(1)
    expect(screen.getByText(new RegExp(`· ${expectedPct}%`))).toBeTruthy()
  })
})

describe('MortgageDetails after maturity', () => {
  it('shows "Paid off" instead of the floating-point residual', () => {
    const residual = currentPrincipalBalanceCents(
      MATURED_MORTGAGE.original_loan_cents,
      MATURED_MORTGAGE.annual_interest_rate_percent,
      MATURED_MORTGAGE.loan_term_years,
      MATURED_MORTGAGE.closing_date
    )
    expect(residual).toBeLessThanOrEqual(PAID_OFF_THRESHOLD_CENTS) // fixture sanity
    render(<MortgageDetails mortgage={MATURED_MORTGAGE} />)
    expect(screen.getByText('Paid off')).toBeTruthy()
  })
})

describe('UnitsCard occupancy label (B7)', () => {
  const multifamily = (units: Property['units']): Property =>
    ({
      id: 'p1',
      household_id: 'hh',
      kind: 'multifamily',
      address: '12 Plex Ln',
      nickname: null,
      created_at: '',
      updated_at: '',
      units,
    }) as Property

  it('an occupied unit with no recorded tenant is not labeled Vacant', () => {
    render(
      <UnitsCard
        property={multifamily([
          { id: 'u1', property_id: 'p1', name: 'Unit 1', monthly_rent_cents: 180000, tenant_name: null, tenant_email: null, sort_order: 0, occupied: true },
        ])}
      />
    )
    expect(screen.queryByText('Vacant')).toBeNull()
  })

  it('an explicitly vacant unit shows Vacant even with a tenant name on file', () => {
    render(
      <UnitsCard
        property={multifamily([
          { id: 'u1', property_id: 'p1', name: 'Unit 1', monthly_rent_cents: 180000, tenant_name: 'Old Tenant', tenant_email: null, sort_order: 0, occupied: false },
        ])}
      />
    )
    expect(screen.getByText('Vacant')).toBeTruthy()
  })
})

/**
 * Household-wide housing roll-up: monthly cost, principal paid down, and net
 * rental across every property. Pure integer-cents money math, pinned by
 * `test/store.integrity.test.tsx` (Principle VI). Previously colocated with the
 * desktop dashboard composition; extracted here (spec 034) when the dashboard
 * moved to the widget framework, so the math and its coverage outlive any one
 * screen. Net rental must NOT be gated on having a mortgage — a paid-off
 * multifamily still earns its unit rents.
 */
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  PAID_OFF_THRESHOLD_CENTS,
} from './mortgage'
import { netRentalCents, rentUnitsFrom } from './housing'
import type { Property } from '@/lib/types'

export interface HousingSummary {
  cost: number
  equity: number
  netRental: number
  multi: boolean
  count: number
}

export function housingSummary(properties: Property[]): HousingSummary {
  let cost = 0
  let equity = 0
  let netRental = 0
  let multi = false
  for (const p of properties) {
    const m = p.mortgage
    const pay = m
      ? monthlyPaymentCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years)
      : 0
    if (m) {
      cost += pay
      const rawBalance = currentPrincipalBalanceCents(
        m.original_loan_cents,
        m.annual_interest_rate_percent,
        m.loan_term_years,
        m.closing_date
      )
      const balance = rawBalance <= PAID_OFF_THRESHOLD_CENTS ? 0 : rawBalance
      equity += m.original_loan_cents - balance
    }
    if (p.kind === 'multifamily') {
      multi = true
      // Occupied-only net (money collected), identical to the property-detail
      // Net balance card and iOS.
      netRental += netRentalCents(rentUnitsFrom(p.units ?? []), pay)
    }
    if (p.lease) cost += p.lease.monthly_rent_cents
  }
  return { cost, equity, netRental, multi, count: properties.length }
}

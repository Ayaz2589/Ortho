/**
 * Housing rental-income math — the single source of truth for the net rental
 * figure shown on BOTH the Dashboard housing summary and the property-detail
 * "Net balance" card, so the two screens can never disagree.
 *
 * Mirrored by iOS `Property.swift` (`occupiedMonthlyRentCents` + net) and pinned
 * by `shared/test-vectors/housing-net-rental.json`. Integer USD cents throughout.
 */

export interface RentUnit {
  rentCents: number
  occupied: boolean
}

/** A unit counts as occupied when it has a (non-blank) tenant name. Vacancy is a
 *  deliberate state (see spec 019 US5); a blank tenant name means vacant. */
export function isUnitOccupied(tenantName: string | null | undefined): boolean {
  return (tenantName ?? '').trim() !== ''
}

/** Sum of configured rents for OCCUPIED units only. Vacant units contribute
 *  zero — their rent is the asking number, not money you're collecting. */
export function occupiedRentCents(units: RentUnit[]): number {
  return units.reduce((sum, u) => (u.occupied ? sum + u.rentCents : sum), 0)
}

/** Monthly net rental cashflow: occupied rent minus the mortgage payment. May be
 *  negative (a cash-flow-negative building); never gated on a mortgage — pass
 *  `mortgagePaymentCents = 0` for a paid-off property. */
export function netRentalCents(units: RentUnit[], mortgagePaymentCents: number): number {
  return occupiedRentCents(units) - mortgagePaymentCents
}

/** Map stored units (rent + optional tenant name) to the resolved-occupancy shape
 *  the pure math above consumes. Structural input so this stays free of app types
 *  (and safe for the vector generator). Every surface uses this one mapping. */
export function rentUnitsFrom(
  units: ReadonlyArray<{ monthly_rent_cents: number; tenant_name: string | null; occupied?: boolean }>
): RentUnit[] {
  return units.map((u) => ({
    rentCents: u.monthly_rent_cents,
    // Explicit occupancy when present (spec 020 US4); fall back to tenant-name
    // inference for rows not yet migrated to the `occupied` column. `?? ` keeps
    // an explicit `false` (a deliberately-vacant unit), only undefined falls back.
    occupied: u.occupied ?? isUnitOccupied(u.tenant_name),
  }))
}

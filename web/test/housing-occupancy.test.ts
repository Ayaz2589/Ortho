import { describe, expect, it } from 'vitest'
import { rentUnitsFrom, occupiedRentCents, netRentalCents } from '@/lib/finance/housing'

// Spec 020 US4: occupancy is an explicit stored state (`units.occupied`), no
// longer inferred from a blank tenant name. rentUnitsFrom is the single mapping
// both the Dashboard summary and the property-detail net card use, so they can
// never disagree. The pure net functions are unchanged (housing-net-rental.json
// stays byte-identical) — only the mapping now reads the column.

describe('rentUnitsFrom — explicit occupancy with tenant-name fallback', () => {
  it('reads the explicit occupied column when present (independent of tenant name)', () => {
    const units = [
      { monthly_rent_cents: 1000, tenant_name: null, occupied: true }, // no name, but explicitly occupied → counts
      { monthly_rent_cents: 2000, tenant_name: 'Alex', occupied: false }, // named, but explicitly vacant → excluded
    ]
    expect(rentUnitsFrom(units)).toEqual([
      { rentCents: 1000, occupied: true },
      { rentCents: 2000, occupied: false },
    ])
    expect(occupiedRentCents(rentUnitsFrom(units))).toBe(1000)
  })

  it('falls back to tenant-name inference for pre-migration rows (occupied absent)', () => {
    const units = [
      { monthly_rent_cents: 1000, tenant_name: 'Alex' }, // inferred occupied
      { monthly_rent_cents: 2000, tenant_name: '' }, //     inferred vacant
      { monthly_rent_cents: 3000, tenant_name: null }, //   inferred vacant
    ]
    expect(rentUnitsFrom(units).map((u) => u.occupied)).toEqual([true, false, false])
    expect(occupiedRentCents(rentUnitsFrom(units))).toBe(1000)
  })

  it('an explicit false is preserved (not overridden by a present tenant name)', () => {
    expect(rentUnitsFrom([{ monthly_rent_cents: 500, tenant_name: 'Sam', occupied: false }])[0].occupied).toBe(false)
  })

  it('backfill parity: explicit occupied == inference for an existing named row', () => {
    const inferred = rentUnitsFrom([{ monthly_rent_cents: 5000, tenant_name: 'Sam' }])
    const explicit = rentUnitsFrom([{ monthly_rent_cents: 5000, tenant_name: 'Sam', occupied: true }])
    expect(explicit).toEqual(inferred)
  })

  it('net excludes a vacant unit consistently (single source → dashboard == detail)', () => {
    const units = rentUnitsFrom([
      { monthly_rent_cents: 300000, tenant_name: 'A', occupied: true },
      { monthly_rent_cents: 260000, tenant_name: null, occupied: false },
    ])
    // Only the occupied unit's rent counts; the same figure feeds both screens.
    expect(occupiedRentCents(units)).toBe(300000)
    expect(netRentalCents(units, 505654)).toBe(300000 - 505654)
  })
})

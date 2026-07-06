// US2 — net rental income is one shared, vector-locked computation (spec 019).
// This asserts the web engine against the golden vector that iOS also asserts,
// so the Dashboard and the property page can never drift.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  occupiedRentCents,
  netRentalCents,
  isUnitOccupied,
  rentUnitsFrom,
  type RentUnit,
} from '../lib/finance/housing'

const here = dirname(fileURLToPath(import.meta.url))
const vectors = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/housing-net-rental.json'), 'utf8')
) as Array<{
  input: { name: string; units: RentUnit[]; mortgagePaymentCents: number }
  expected: { occupiedRentCents: number; netRentalCents: number }
}>

describe('housing net-rental parity vs golden vectors', () => {
  for (const { input, expected } of vectors) {
    it(input.name, () => {
      expect(occupiedRentCents(input.units)).toBe(expected.occupiedRentCents)
      expect(netRentalCents(input.units, input.mortgagePaymentCents)).toBe(expected.netRentalCents)
    })
  }
})

// US5 — occupancy is derived from a (non-blank) tenant name; the rule is
// centralized so a rent-earning unit is never dropped inconsistently.
describe('unit occupancy rule (contract C7)', () => {
  it('a unit with a tenant name is occupied; a blank/whitespace name is vacant', () => {
    expect(isUnitOccupied('Alice')).toBe(true)
    expect(isUnitOccupied('')).toBe(false)
    expect(isUnitOccupied('   ')).toBe(false)
    expect(isUnitOccupied(null)).toBe(false)
    expect(isUnitOccupied(undefined)).toBe(false)
  })

  it('rentUnitsFrom resolves occupancy and only occupied rent counts', () => {
    const units = [
      { monthly_rent_cents: 200000, tenant_name: 'Dana' },
      { monthly_rent_cents: 260000, tenant_name: null },
    ]
    const rentUnits = rentUnitsFrom(units)
    expect(rentUnits).toEqual([
      { rentCents: 200000, occupied: true },
      { rentCents: 260000, occupied: false },
    ])
    expect(occupiedRentCents(rentUnits)).toBe(200000) // the vacant $2,600 is excluded
  })
})

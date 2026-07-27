import { describe, expect, it } from 'vitest'
import { housingSection, type HousingRecord } from '../../lib/dataFile/sections/housing'
import { makeStore, property, rental } from './_fixtures'

describe('housing section', () => {
  it('serializes a property with nested mortgage/lease/units + its rental payments', () => {
    const store = makeStore({
      properties: [
        property({
          id: 'prop1',
          kind: 'rental',
          mortgage: { property_id: 'prop1', purchase_price_cents: 50000000, original_loan_cents: 40000000, annual_interest_rate_percent: 6.5, loan_term_years: 30, closing_date: '2020-01-01', auto_pay_source: null },
          units: [{ id: 'u1', property_id: 'prop1', name: 'A', monthly_rent_cents: 200000, tenant_name: 'T', tenant_email: null, sort_order: 0 }],
        }),
      ],
      rentalPayments: [rental({ id: 'rp1', property_id: 'prop1', amount_cents: 200000 })],
    })
    const recs = housingSection.serialize(store)
    expect(recs).toHaveLength(1)
    expect(recs[0].property.mortgage?.original_loan_cents).toBe(40000000)
    expect(recs[0].property.units).toHaveLength(1)
    expect(recs[0].rentalPayments).toHaveLength(1)
  })

  it('round-trips losslessly (serialize → read → deepEqual)', () => {
    const store = makeStore({
      properties: [property({ id: 'prop1', lease: { property_id: 'prop1', monthly_rent_cents: 300000, lease_start: '2026-01-01', lease_end: '2026-12-31', security_deposit_cents: 300000, paid_with_source: null } })],
      rentalPayments: [rental({ id: 'rp1', property_id: 'prop1' })],
    })
    const recs = housingSection.serialize(store)
    expect(housingSection.read({ key: 'housing', sectionVersion: 1, records: recs })).toEqual(recs)
  })

  it('applies a new property with its rental payments, preserving ids', () => {
    const store = makeStore()
    const rec: HousingRecord = {
      property: { id: 'prop1', kind: 'primary_home', address: '1 Main St', nickname: 'Home', mortgage: null, lease: null, units: [] },
      rentalPayments: [{ id: 'rp1', amount_cents: 200000, date: '2026-05-01', note: null }],
    }
    housingSection.apply({ add: [rec], skipById: [], skipByContent: [] }, store, { now: '2026-07-27T00:00:00.000Z' })
    expect(store.added.properties[0].id).toBe('prop1')
    expect(store.added.properties[0].household_id).toBe('hh1')
    expect(store.added.rentalPayments[0].property_id).toBe('prop1')
  })
})

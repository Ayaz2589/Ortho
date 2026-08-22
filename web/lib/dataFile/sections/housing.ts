// spec 032 — the housing data section.
//
// A housing record bundles a property (with its nested mortgage/lease/units)
// and that property's rental payments. Dedup is at property granularity:
// tier-1 by property id, tier-2 by normalized address. On apply a new property
// is created with all its rental payments; an already-present property is
// skipped (rental-payment-level merge is a documented future enhancement).

import type { LeaseInfo, MortgageInfo, Property, PropertyKind, RentalPayment, Unit } from '../../types'
import type { SectionPayload } from '../envelope'
import type {
  ApplyCtx,
  DataSection,
  DataStore,
  RenderCtx,
  SectionDedupePlan,
  SectionRenderModel,
} from '../registry'

export const HOUSING_KEY = 'housing'
const SECTION_VERSION = 1

export interface HousingRecord {
  property: {
    id: string
    kind: PropertyKind
    address: string
    nickname: string | null
    mortgage: MortgageInfo | null
    lease: LeaseInfo | null
    units: Unit[]
  }
  rentalPayments: Array<{ id: string; amount_cents: number; date: string; note: string | null }>
}

function normalizeAddress(a: string): string {
  return a.toLowerCase().replace(/\s+/g, ' ').trim()
}

function serialize(store: DataStore): HousingRecord[] {
  const paymentsByProperty = new Map<string, RentalPayment[]>()
  for (const rp of store.rentalPayments) {
    const list = paymentsByProperty.get(rp.property_id) ?? []
    list.push(rp)
    paymentsByProperty.set(rp.property_id, list)
  }
  return store.properties.map((p) => ({
    property: {
      id: p.id,
      kind: p.kind,
      address: p.address,
      nickname: p.nickname,
      mortgage: p.mortgage ?? null,
      lease: p.lease ?? null,
      units: (p.units ?? []).map((u) => ({ ...u })),
    },
    rentalPayments: (paymentsByProperty.get(p.id) ?? []).map((rp) => ({
      id: rp.id,
      amount_cents: rp.amount_cents,
      date: rp.date,
      note: rp.note,
    })),
  }))
}

function read(payload: SectionPayload): HousingRecord[] {
  return (payload.records as HousingRecord[]).map((r) => ({
    property: {
      ...r.property,
      nickname: r.property.nickname ?? null,
      mortgage: r.property.mortgage ?? null,
      lease: r.property.lease ?? null,
      units: r.property.units ?? [],
    },
    rentalPayments: r.rentalPayments ?? [],
  }))
}

function dedupe(records: HousingRecord[], store: DataStore): SectionDedupePlan<HousingRecord> {
  const existingIds = new Set(store.properties.map((p) => p.id))
  const existingAddresses = new Set(store.properties.map((p) => normalizeAddress(p.address)))
  const plan: SectionDedupePlan<HousingRecord> = { add: [], skipById: [], skipByContent: [] }
  for (const r of records) {
    if (existingIds.has(r.property.id)) plan.skipById.push(r)
    else if (existingAddresses.has(normalizeAddress(r.property.address))) plan.skipByContent.push(r)
    else plan.add.push(r)
  }
  return plan
}

function apply(plan: SectionDedupePlan<HousingRecord>, store: DataStore, ctx: ApplyCtx): void {
  const householdId = store.currentHousehold?.id ?? ''
  for (const r of plan.add) {
    const property: Property = {
      id: r.property.id, // preserve → re-import is a tier-1 no-op
      household_id: householdId,
      kind: r.property.kind,
      address: r.property.address,
      nickname: r.property.nickname,
      created_at: ctx.now,
      updated_at: ctx.now,
      mortgage: r.property.mortgage
        ? { ...r.property.mortgage, property_id: r.property.id }
        : undefined,
      lease: r.property.lease ? { ...r.property.lease, property_id: r.property.id } : undefined,
      units: r.property.units.map((u) => ({ ...u, property_id: r.property.id })),
    }
    store.addProperty(property)
    for (const rp of r.rentalPayments) {
      store.addRentalPayment({
        id: rp.id,
        property_id: r.property.id,
        amount_cents: rp.amount_cents,
        date: rp.date,
        note: rp.note,
        created_at: ctx.now,
      })
    }
  }
}

function monthlyCents(r: HousingRecord): number {
  if (r.property.lease) return r.property.lease.monthly_rent_cents
  if (r.property.units.length) return r.property.units.reduce((s, u) => s + u.monthly_rent_cents, 0)
  return 0
}

const KIND_LABEL: Record<PropertyKind, string> = {
  primary_home: 'Primary home',
  multifamily: 'Multifamily',
  rental: 'Rental',
}

function renderModel(records: HousingRecord[], ctx: RenderCtx): SectionRenderModel {
  return {
    title: ctx.t('Housing'),
    columns: [ctx.t('Property'), ctx.t('Type'), ctx.t('Monthly')],
    rows: records.map((r) => [
      r.property.nickname || r.property.address,
      ctx.t(KIND_LABEL[r.property.kind]),
      ctx.formatMoney(monthlyCents(r), ctx.currency, ctx.rate(ctx.currency), false, ctx.locale),
    ]),
    emptyLabel: ctx.t('No housing yet'),
  }
}

export const housingSection: DataSection<HousingRecord> = {
  key: HOUSING_KEY,
  sectionVersion: SECTION_VERSION,
  serialize,
  read,
  dedupe,
  apply,
  renderModel,
}

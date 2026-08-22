// Shared fixtures for spec 032 data-file tests. A minimal in-memory DataStore
// whose additive mutations push into arrays so tests can assert what was created.

import type { DataStore } from '../../lib/dataFile/registry'
import type { Person, Property, RentalPayment, Tag, Transaction, User } from '../../lib/types'

export function person(id: string, name: string, linked = false): Person {
  return {
    id,
    household_id: 'hh1',
    name,
    initial: name[0] ?? '?',
    color_key: 'sage',
    linked_user_id: linked ? `u-${id}` : null,
    sort_order: 0,
    removed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

export function tx(over: Partial<Transaction> = {}): Transaction {
  const amount = over.amount_cents ?? 10000
  const owners = over.owner_ids ?? ['p1']
  const shares = over.shares ?? Object.fromEntries(owners.map((o, i) => [o, i === 0 ? amount - Math.floor(amount / owners.length) * (owners.length - 1) : Math.floor(amount / owners.length)]))
  return {
    id: over.id ?? 't1',
    household_id: 'hh1',
    merchant: over.merchant ?? 'Netflix',
    category: over.category ?? 'subs',
    kind: over.kind ?? 'expense',
    amount_cents: amount,
    source: over.source ?? 'Visa',
    date: over.date ?? '2026-05-01',
    created_by: 'u-p1',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    paid_by: over.paid_by ?? 'p1',
    owner_ids: owners,
    shares,
    tags: over.tags ?? [],
    notes: over.notes ?? null,
  }
}

export function property(over: Partial<Property> = {}): Property {
  return {
    id: over.id ?? 'prop1',
    household_id: 'hh1',
    kind: over.kind ?? 'primary_home',
    address: over.address ?? '1 Main St',
    nickname: over.nickname ?? 'Home',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    mortgage: over.mortgage,
    lease: over.lease,
    units: over.units,
  }
}

export function rental(over: Partial<RentalPayment> = {}): RentalPayment {
  return {
    id: over.id ?? 'rp1',
    property_id: over.property_id ?? 'prop1',
    amount_cents: over.amount_cents ?? 200000,
    date: over.date ?? '2026-05-01',
    note: over.note ?? null,
    created_at: '2026-05-01T00:00:00.000Z',
  }
}

export interface FakeStore extends DataStore {
  added: {
    transactions: Transaction[]
    properties: Property[]
    rentalPayments: RentalPayment[]
    tags: Tag[]
  }
}

export function makeStore(init: Partial<DataStore> = {}): FakeStore {
  const people = init.people ?? [person('p1', 'Ava', true), person('p2', 'Ben')]
  const tags: Tag[] = [...(init.tags ?? [])]
  const added = {
    transactions: [] as Transaction[],
    properties: [] as Property[],
    rentalPayments: [] as RentalPayment[],
    tags: [] as Tag[],
  }
  const store: FakeStore = {
    currentHousehold: init.currentHousehold ?? { id: 'hh1', name: 'Our Home' },
    currentUserId: init.currentUserId ?? 'u-p1',
    currentPersonId: init.currentPersonId ?? 'p1',
    people,
    transactions: [...(init.transactions ?? [])],
    properties: [...(init.properties ?? [])],
    rentalPayments: [...(init.rentalPayments ?? [])],
    tags,
    addTransaction: (t) => {
      store.transactions.push(t)
      added.transactions.push(t)
    },
    addProperty: (p) => {
      store.properties.push(p)
      added.properties.push(p)
    },
    addRentalPayment: (rp) => {
      store.rentalPayments.push(rp)
      added.rentalPayments.push(rp)
    },
    addTag: (name) => {
      const existing = tags.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
      if (existing) return existing
      const t: Tag = { id: `tag-${name}`, household_id: 'hh1', name: name.trim(), created_at: '2026-01-01T00:00:00.000Z' }
      tags.push(t)
      added.tags.push(t)
      return t
    },
    resolveUser: (id) => {
      const p = people.find((x) => x.id === id)
      const u: User = {
        id,
        name: p?.name ?? 'Someone',
        initial: p?.initial ?? '?',
        color_key: p?.color_key ?? 'sage',
        created_at: '2026-01-01T00:00:00.000Z',
      }
      return u
    },
    added,
  }
  return store
}

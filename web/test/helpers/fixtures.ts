import type {
  User,
  Household,
  Transaction,
  TransactionCategory,
  TransactionKind,
} from '@/lib/types'
import { computeShares } from '@/lib/splits'

let seq = 0
const nextId = (p: string) => `${p}-${++seq}`

export function makeUser(overrides: Partial<User> = {}): User {
  const name = overrides.name ?? 'Maya'
  return {
    id: overrides.id ?? nextId('user'),
    name,
    initial: overrides.initial ?? name.charAt(0).toUpperCase(),
    color_key: overrides.color_key ?? 'sage',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? nextId('hh'),
    owner_id: overrides.owner_id ?? 'u-me',
    name: overrides.name ?? 'Home',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  const kind: TransactionKind = overrides.kind ?? 'expense'
  const category: TransactionCategory = overrides.category ?? (kind === 'income' ? 'income' : 'groceries')
  const owner_ids = overrides.owner_ids ?? ['u-me']
  const amount_cents = overrides.amount_cents ?? 1000
  return {
    id: overrides.id ?? nextId('tx'),
    household_id: overrides.household_id ?? 'hh-1',
    merchant: overrides.merchant ?? 'Whole Foods',
    category,
    kind,
    amount_cents,
    source: overrides.source ?? 'Checking',
    date: overrides.date ?? '2026-06-12T12:00:00.000Z',
    created_by: overrides.created_by ?? owner_ids[0] ?? 'u-me',
    created_at: overrides.created_at ?? '2026-06-12T12:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-06-12T12:00:00.000Z',
    owner_ids,
    shares: overrides.shares ?? computeShares(amount_cents, owner_ids, { method: 'even' }),
    ...overrides,
  }
}

/** Reset the id sequence so ids are stable within a test that needs it. */
export function resetFixtureIds(): void {
  seq = 0
}

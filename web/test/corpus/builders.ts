// Pure row builders for the coverage corpus (spec 026). Every builder returns
// EXISTING lib/types rows. Split math comes ONLY from lib/splits (computeShares /
// orderedOwnerIds) — never re-implemented here (FR-005/FR-013).

import type {
  User,
  Household,
  Person,
  Card,
  Transaction,
  TransactionShare,
  Property,
  MortgageInfo,
  LeaseInfo,
  Unit,
  RentalPayment,
  Budget,
  TransactionCategory,
  TransactionKind,
  PropertyKind,
} from '@/lib/types'
import { computeShares, orderedOwnerIds, type SplitInput, type SplitMethod } from '@/lib/splits'
import type { GeneratedTransaction, GeneratedProperty, HouseholdMember, TxIntent } from './model'

/** Fixed, clock-independent timestamp for created_at/updated_at where the exact
 *  value is immaterial (keeps the corpus byte-stable). Transaction rows use the
 *  transaction date for created_at/updated_at instead (see buildTransaction). */
export const FIXED_TS = '2026-01-01T00:00:00.000Z'

export function buildUser(id: string, name: string, colorKey = 'sage'): User {
  return { id, name, initial: name.charAt(0).toUpperCase(), color_key: colorKey, created_at: FIXED_TS }
}

export function buildHousehold(id: string, ownerId: string, name: string): Household {
  return { id, owner_id: ownerId, name, created_at: FIXED_TS }
}

export function buildPerson(
  id: string,
  householdId: string,
  name: string,
  sortOrder: number,
  linkedUserId: string | null = null,
  colorKey = 'sage'
): Person {
  return {
    id,
    household_id: householdId,
    name,
    initial: name.charAt(0).toUpperCase(),
    color_key: colorKey,
    linked_user_id: linkedUserId,
    sort_order: sortOrder,
    removed_at: null,
    created_at: FIXED_TS,
  }
}

export function buildMember(
  householdId: string,
  userId: string,
  role: 'owner' | 'member'
): HouseholdMember {
  return { household_id: householdId, user_id: userId, role, created_at: FIXED_TS }
}

export function buildCard(id: string, householdId: string, name: string): Card {
  return { id, household_id: householdId, name, created_at: FIXED_TS }
}

export function buildBudget(
  id: string,
  householdId: string,
  category: TransactionCategory,
  monthlyLimitCents: number
): Budget {
  return { id, household_id: householdId, category, monthly_limit_cents: monthlyLimitCents }
}

export interface TxSpec {
  id: string
  householdId: string
  merchant: string
  category: TransactionCategory
  kind: TransactionKind
  amountCents: number
  source: string
  date: string
  createdBy: string
  /** Unordered owner (person) ids. Canonicalized before share computation. */
  owners: string[]
  paidBy?: string | null
  split?: SplitInput
  intent?: TxIntent[]
}

/**
 * Build a transaction + its per-owner shares. Owners are canonicalized via
 * `orderedOwnerIds` (the app regime) and shares are computed via `computeShares`
 * — so the corpus mirrors app-created rows and shares ALWAYS reconcile to the
 * amount for even/percent (and for value when the caller supplies balanced
 * values). The A4 divergence is surfaced by tests re-ordering owners, not by the
 * builder.
 */
export function buildTransaction(spec: TxSpec): GeneratedTransaction {
  const split: SplitInput = spec.split ?? { method: 'even' }
  const ordered = orderedOwnerIds(spec.owners)
  const sharesMap = computeShares(spec.amountCents, ordered, split)
  const shares: TransactionShare[] = ordered.map((pid) => ({
    transaction_id: spec.id,
    person_id: pid,
    amount_cents: sharesMap[pid] ?? 0,
  }))
  const transaction: Transaction = {
    id: spec.id,
    household_id: spec.householdId,
    merchant: spec.merchant,
    category: spec.category,
    kind: spec.kind,
    amount_cents: spec.amountCents,
    source: spec.source,
    date: spec.date,
    created_by: spec.createdBy,
    created_at: spec.date,
    updated_at: spec.date,
    paid_by: spec.paidBy ?? (spec.kind === 'income' ? null : spec.createdBy),
    owner_ids: ordered,
    shares: sharesMap,
  }
  return { transaction, shares, splitMethod: split.method as SplitMethod, intent: spec.intent ?? [] }
}

export interface PropertySpec {
  id: string
  householdId: string
  kind: PropertyKind
  address: string
  nickname?: string | null
  mortgage?: Omit<MortgageInfo, 'property_id'>
  lease?: Omit<LeaseInfo, 'property_id'>
  units?: Array<Omit<Unit, 'property_id'>>
  rentalPayments?: Array<Omit<RentalPayment, 'property_id'>>
}

export function buildProperty(spec: PropertySpec): GeneratedProperty {
  const property: Property = {
    id: spec.id,
    household_id: spec.householdId,
    kind: spec.kind,
    address: spec.address,
    nickname: spec.nickname ?? null,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
  }
  const units: Unit[] = (spec.units ?? []).map((u) => ({ ...u, property_id: spec.id }))
  const rentalPayments: RentalPayment[] = (spec.rentalPayments ?? []).map((p) => ({
    ...p,
    property_id: spec.id,
  }))
  return {
    property,
    mortgage: spec.mortgage ? { ...spec.mortgage, property_id: spec.id } : undefined,
    lease: spec.lease ? { ...spec.lease, property_id: spec.id } : undefined,
    units,
    rentalPayments,
  }
}

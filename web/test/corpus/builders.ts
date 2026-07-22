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
  Tag,
  Goal,
  GoalKind,
  GoalContribution,
  LinkedInstitution,
  LinkedAccount,
  LinkedProvider,
  LinkedInstitutionStatus,
  TransactionCategory,
  TransactionKind,
  PropertyKind,
} from '@/lib/types'
import type { DbEntitlement, EntitlementStatus } from '@/lib/entitlements'
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
  monthlyLimitCents: number,
  budgetType: Budget['budget_type'] = 'fixed',
  rolloverCapCents: number | null = null,
  createdAt?: string
): Budget {
  return {
    id,
    household_id: householdId,
    category,
    monthly_limit_cents: monthlyLimitCents,
    budget_type: budgetType,
    rollover_cap_cents: rolloverCapCents,
    // Carry anchor for flex/non_monthly rollover. Omitted when unset so existing
    // fixed budgets serialize byte-identically to the spec-026 snapshot.
    ...(createdAt !== undefined ? { created_at: createdAt } : {}),
  }
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
  /** Ids of household `tags` attached to this transaction (spec 030). */
  tags?: string[]
  /** Free-form note (spec 030). */
  notes?: string | null
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
    // Only emit tags/notes when the caller sets them, so transactions that carry
    // neither serialize byte-identically to the spec-026 snapshot.
    ...(spec.tags !== undefined ? { tags: spec.tags } : {}),
    ...(spec.notes !== undefined ? { notes: spec.notes } : {}),
  }
  return { transaction, shares, splitMethod: split.method as SplitMethod, intent: spec.intent ?? [] }
}

// ---------------------------------------------------------------------------
// spec 030 — builders for the holistic-seed tables (tags, goals, banks,
// entitlements). Every one returns an EXISTING lib/types (or lib/entitlements)
// row shape; no new domain type is defined here.
// ---------------------------------------------------------------------------

export function buildTag(id: string, householdId: string, name: string): Tag {
  return { id, household_id: householdId, name, created_at: FIXED_TS }
}

export interface GoalSpec {
  id: string
  householdId: string
  name: string
  kind?: GoalKind
  targetCents: number
  targetDate?: string | null
  linkedAccountId?: string | null
  linkedCategory?: TransactionCategory | null
  createdBy: string
  createdAt?: string
}

export function buildGoal(spec: GoalSpec): Goal {
  return {
    id: spec.id,
    household_id: spec.householdId,
    name: spec.name,
    kind: spec.kind ?? 'savings',
    target_cents: spec.targetCents,
    target_date: spec.targetDate ?? null,
    linked_account_id: spec.linkedAccountId ?? null,
    linked_category: spec.linkedCategory ?? null,
    created_by: spec.createdBy,
    created_at: spec.createdAt ?? FIXED_TS,
    updated_at: spec.createdAt ?? FIXED_TS,
  }
}

export function buildGoalContribution(
  id: string,
  goalId: string,
  amountCents: number,
  date: string,
  createdBy: string,
  note: string | null = null
): GoalContribution {
  return { id, goal_id: goalId, amount_cents: amountCents, date, note, created_by: createdBy, created_at: date }
}

export interface LinkedInstitutionSpec {
  id: string
  householdId: string
  provider: LinkedProvider
  providerItemId: string
  institutionName: string
  status?: LinkedInstitutionStatus
  createdBy: string
  disconnectedAt?: string | null
  lastSyncedAt?: string | null
  syncCursor?: string | null
}

export function buildLinkedInstitution(spec: LinkedInstitutionSpec): LinkedInstitution {
  return {
    id: spec.id,
    household_id: spec.householdId,
    provider: spec.provider,
    provider_item_id: spec.providerItemId,
    provider_institution_id: null,
    institution_name: spec.institutionName,
    status: spec.status ?? 'active',
    created_by: spec.createdBy,
    created_at: FIXED_TS,
    updated_at: FIXED_TS,
    disconnected_at: spec.disconnectedAt ?? null,
    // SimpleFIN carries sync state; Plaid leaves it null (spec 028).
    last_synced_at: spec.lastSyncedAt ?? null,
    last_manual_refresh_at: null,
    sync_cursor: spec.syncCursor ?? null,
  }
}

export interface LinkedAccountSpec {
  id: string
  institutionId: string
  providerAccountId: string
  name: string
  mask?: string | null
  accountType: string
  accountSubtype?: string | null
  currency?: string | null
}

export function buildLinkedAccount(spec: LinkedAccountSpec): LinkedAccount {
  return {
    id: spec.id,
    institution_id: spec.institutionId,
    provider_account_id: spec.providerAccountId,
    name: spec.name,
    official_name: null,
    mask: spec.mask ?? null,
    account_type: spec.accountType,
    account_subtype: spec.accountSubtype ?? null,
    currency: spec.currency ?? null,
    created_at: FIXED_TS,
  }
}

export interface EntitlementSpec {
  userId: string
  status: EntitlementStatus
  accessExpiresAt?: string | null
  plan?: 'monthly' | 'yearly' | null
  source?: 'trial' | 'stripe' | 'operator'
  createdAt?: string
}

export function buildEntitlement(spec: EntitlementSpec): DbEntitlement {
  return {
    user_id: spec.userId,
    status: spec.status,
    access_expires_at: spec.accessExpiresAt ?? null,
    plan: spec.plan ?? null,
    source: spec.source ?? (spec.status === 'trialing' ? 'trial' : 'stripe'),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    last_event_at: null,
    created_at: spec.createdAt ?? FIXED_TS,
    updated_at: spec.createdAt ?? FIXED_TS,
  }
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

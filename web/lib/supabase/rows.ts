/**
 * Hand-written mirror of the Supabase table shapes that `store.tsx`'s `loadAll`
 * reads — the typed seam between raw DB rows and the domain types in
 * `lib/types.ts` (FR-018, spec 023).
 *
 * `supabase gen types` isn't runnable in this sandbox (no CLI / no DB access), so
 * these interfaces stand in for the generated `Database['public']['Tables'][*]['Row']`
 * types. Each `loadAll` read is asserted to its `*Row` type and then assigned to
 * the domain-typed store state, so a renamed/removed column (mirrored here) or a
 * changed enum fails to compile at the load boundary instead of surfacing at
 * runtime. Keep these in lockstep with:
 *   - the column projections in `loadAll` (only projected columns are present), and
 *   - the domain types in `lib/types.ts` (each row must stay assignable to its domain).
 */
import type { TransactionCategory, TransactionKind, PropertyKind } from '@/lib/types'

export interface UserRow {
  id: string
  name: string
  initial: string
  color_key: string
  created_at: string
}

export interface PersonRow {
  id: string
  household_id: string
  name: string
  initial: string
  color_key: string
  linked_user_id: string | null
  sort_order: number
  removed_at: string | null
  created_at: string
}

export interface TransactionRow {
  id: string
  household_id: string
  merchant: string
  category: TransactionCategory
  kind: TransactionKind
  amount_cents: number
  source: string
  date: string
  created_by: string
  created_at: string
  updated_at: string
  paid_by: string | null
}

export interface TransactionShareRow {
  transaction_id: string
  person_id: string
  amount_cents: number
}

export interface CardRow {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface PropertyRow {
  id: string
  household_id: string
  kind: PropertyKind
  address: string
  nickname: string | null
  created_at: string
  updated_at: string
}

export interface MortgageInfoRow {
  property_id: string
  purchase_price_cents: number
  original_loan_cents: number
  annual_interest_rate_percent: number
  loan_term_years: number
  closing_date: string
  auto_pay_source: string | null
}

export interface LeaseInfoRow {
  property_id: string
  monthly_rent_cents: number
  lease_start: string
  lease_end: string
  security_deposit_cents: number | null
  paid_with_source: string | null
}

export interface UnitRow {
  id: string
  property_id: string
  name: string
  monthly_rent_cents: number
  tenant_name: string | null
  tenant_email: string | null
  sort_order: number
  occupied: boolean
}

export interface RentalPaymentRow {
  id: string
  property_id: string
  amount_cents: number
  date: string
  note: string | null
  created_at: string
}

export interface BudgetRow {
  id: string
  household_id: string
  category: TransactionCategory
  monthly_limit_cents: number
  // spec 027: nullable/optional so a deploy-before-migrate client tolerates the
  // columns' absence — the store defaults them at the row→domain boundary.
  budget_type?: 'fixed' | 'flex' | 'non_monthly' | null
  rollover_cap_cents?: number | null
  created_at?: string | null
}

export interface LinkedInstitutionRow {
  id: string
  household_id: string
  provider: 'plaid'
  provider_item_id: string
  provider_institution_id: string | null
  institution_name: string
  status: 'active' | 'disconnected'
  created_by: string
  created_at: string
  updated_at: string
  disconnected_at: string | null
}

export interface LinkedAccountRow {
  id: string
  institution_id: string
  provider_account_id: string
  name: string
  official_name: string | null
  mask: string | null
  account_type: string
  account_subtype: string | null
  created_at: string
}

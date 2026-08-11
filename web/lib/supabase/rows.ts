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
import type { TransactionCategory, TransactionKind, PropertyKind, GoalKind } from '@/lib/types'

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
  notes: string | null
}

export interface TransactionShareRow {
  transaction_id: string
  person_id: string
  amount_cents: number
}

export interface TagRow {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface TransactionTagRow {
  transaction_id: string
  tag_id: string
}

export interface CardRow {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface DepositAccountRow {
  id: string
  household_id: string
  name: string
  created_at: string
}

// Financial Health (spec 041) — user-scoped rows (RLS user_id = auth.uid()).
export interface UserFinancialProfileRow {
  id: string
  user_id: string
  monthly_income_cents: number
  income_is_variable: boolean
  income_low_estimate_cents: number | null
  housing_type: 'rent' | 'own' | 'family' | 'none'
  housing_cost_cents: number | null
  housing_share_fraction: number
  savings_target_fraction: number
  emergency_fund_level: 'none' | 'under_1m' | '1_3m' | '3_6m' | '6m_plus'
  created_at: string
  updated_at: string
}

export interface UserFixedCostRow {
  id: string
  user_id: string
  label: string
  amount_cents: number
  kind: 'remittance' | 'loan' | 'phone' | 'transit' | 'childcare' | 'subscription' | 'other'
  created_at: string
}

export interface UserDimensionWeightRow {
  id: string
  user_id: string
  dimension:
    | 'cash_flow'
    | 'safety_net'
    | 'commitment_load'
    | 'savings_momentum'
    | 'plan_engagement'
    | 'routine_awareness'
  weight: number
  created_at: string
}

export interface FinancialHealthSnapshotRow {
  id: string
  user_id: string
  score: number
  band: 'strong' | 'steady' | 'building' | 'getting_started'
  created_at: string
}

// Financial Routines (spec 044). recognized_routine_states/merchant_geocodes are
// household-scoped (RLS via is_household_member); user_location_consent/user_routine_visits are
// user-scoped (RLS user_id = auth.uid()), mirroring the financial-health rows above.
export interface RecognizedRoutineStateRow {
  id: string
  household_id: string
  routine_key: string
  status: 'confirmed' | 'dismissed'
  label: string | null
  person_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface UserLocationConsentRow {
  id: string
  user_id: string
  level: 'off' | 'geocoding' | 'foreground_capture'
  granted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface UserRoutineVisitRow {
  id: string
  user_id: string
  household_id: string
  captured_at: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  created_at: string
}

export interface MerchantGeocodeRow {
  id: string
  household_id: string
  merchant_key: string
  latitude: number | null
  longitude: number | null
  label: string | null
  resolved_at: string | null
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

export interface GoalRow {
  id: string
  household_id: string
  name: string
  kind: GoalKind
  target_cents: number
  target_date: string | null
  linked_account_id: string | null
  linked_category: TransactionCategory | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface GoalContributionRow {
  id: string
  goal_id: string
  amount_cents: number
  date: string
  note: string | null
  created_by: string
  created_at: string
}

export interface LinkedInstitutionRow {
  id: string
  household_id: string
  provider: 'plaid' | 'simplefin'
  provider_item_id: string
  provider_institution_id: string | null
  institution_name: string
  status: 'active' | 'disconnected'
  created_by: string
  created_at: string
  updated_at: string
  disconnected_at: string | null
  last_synced_at: string | null
  last_manual_refresh_at: string | null
  sync_cursor: string | null
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
  currency: string | null
  created_at: string
}

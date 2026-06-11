export type Role = 'owner' | 'member'
export type TransactionKind = 'expense' | 'income'
export type TransactionScope = 'personal' | 'shared'
export type PropertyKind = 'primary_home' | 'multifamily' | 'rental'
export type TransactionCategory =
  | 'coffee'
  | 'groceries'
  | 'dining'
  | 'subs'
  | 'fuel'
  | 'rent'
  | 'health'
  | 'income'
  | 'transit'
  | 'utilities'
  | 'entertainment'
export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface User {
  id: string
  name: string
  initial: string
  color_key: string
  created_at: string
}

export interface Household {
  id: string
  owner_id: string
  name: string
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: Role
  created_at: string
}

export interface Card {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface Transaction {
  id: string
  household_id: string | null
  merchant: string
  category: TransactionCategory
  kind: TransactionKind
  scope: TransactionScope
  amount_cents: number
  source: string
  date: string
  created_by: string
  created_at: string
  updated_at: string
  shares?: TransactionShare[]
  // Client-derived from shares / created_by (see rehydrate in store).
  owner_ids: string[]
  // Explicit per-owner percentages (sum to 100); null = split evenly.
  splits: Record<string, number> | null
}

/** A device-only person (roommate/partner) without an Ortho account.
 *  Never written to Supabase — persisted in localStorage. May only
 *  participate in PERSONAL-scope transactions. */
export interface LocalUser {
  id: string
  name: string
  initial: string
  color_key: string
  is_local: true
}

export type Platform = 'web' | 'ios'

export interface TransactionShare {
  transaction_id: string
  user_id: string
  percent: number
}

export interface Property {
  id: string
  household_id: string
  kind: PropertyKind
  address: string
  nickname: string | null
  created_at: string
  updated_at: string
  mortgage?: MortgageInfo
  lease?: LeaseInfo
  units?: Unit[]
}

export interface MortgageInfo {
  property_id: string
  purchase_price_cents: number
  original_loan_cents: number
  annual_interest_rate_percent: number
  loan_term_years: number
  closing_date: string
  auto_pay_source: string | null
}

export interface LeaseInfo {
  property_id: string
  monthly_rent_cents: number
  lease_start: string
  lease_end: string
  security_deposit_cents: number | null
  paid_with_source: string | null
}

export interface Unit {
  id: string
  property_id: string
  name: string
  monthly_rent_cents: number
  tenant_name: string | null
  tenant_email: string | null
  sort_order: number
}

export interface RentalPayment {
  id: string
  property_id: string
  amount_cents: number
  date: string
  note: string | null
  created_at: string
}

export interface Budget {
  id: string
  household_id: string
  category: TransactionCategory
  monthly_limit_cents: number
}

export interface Insight {
  id: string
  title: string
  body: string
  severity: InsightSeverity
  icon: string
  category: TransactionCategory | null
  magnitude_cents: number
}

export interface PlatformLock {
  user_id: string
  platform: 'web' | 'ios'
  locked_at: string
}

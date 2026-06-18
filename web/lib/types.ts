export type Role = 'owner' | 'member'
/** `transfer` = a member-to-member reimbursement (settle-up); never spend or income. */
export type TransactionKind = 'expense' | 'income' | 'transfer'
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
  | 'transfer'
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

/** A name-only member of a household (the account holder or someone you added).
 *  Owners of transactions are People. Added people need no Ortho account. */
export interface Person {
  id: string
  household_id: string
  name: string
  initial: string
  color_key: string
  /** Set for the account holder (their auth uid); null for name-only people. */
  linked_user_id: string | null
  sort_order: number
  /** Soft-remove: hidden from pickers, kept on existing transactions. */
  removed_at: string | null
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
  /** Person who paid the money out. For an expense: who fronted it (defaults to
   *  the creator). For a `transfer`: the sender (the ower paying back). Null for
   *  income and legacy expenses whose creator has no linked person; optional so
   *  existing fixtures/importers need not set it (the DB column is nullable). */
  paid_by?: string | null
  /** Person ids that own/share this transaction (ordered). Derived from shares.
   *  For a `transfer` this is `[recipient]` (the member being reimbursed). */
  owner_ids: string[]
  /** Per-owner amount in cents; the values sum to `amount_cents`. */
  shares: Record<string, number>
}

export type Platform = 'web' | 'ios'

/** One owner's cents share of a transaction (Supabase `transaction_shares`). */
export interface TransactionShare {
  transaction_id: string
  person_id: string
  amount_cents: number
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

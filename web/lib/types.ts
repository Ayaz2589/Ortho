/** `transfer` = a member-to-member reimbursement (settle-up); never spend or income. */
export type TransactionKind = 'expense' | 'income' | 'transfer'
export type PropertyKind = 'primary_home' | 'multifamily' | 'rental'
/** Every category a user can pick in a form/filter. `transfer` is deliberately
 *  absent — Reimbursement is never a pickable category/budget/filter (locked
 *  product decision, 2026-07-02 audit). The union derives from this list so a
 *  new category can never reach the type without reaching every picker
 *  (spec 013 US5). */
export const PICKABLE_CATEGORIES = [
  'coffee',
  'groceries',
  'dining',
  'subs',
  'fuel',
  'rent',
  'health',
  'income',
  'transit',
  'utilities',
  'entertainment',
] as const
export type TransactionCategory = (typeof PICKABLE_CATEGORIES)[number] | 'transfer'
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
  /** Explicit occupancy (spec 020). Optional so rows not yet migrated to the
   *  `occupied` column keep working — consumers fall back to tenant-name
   *  inference (`isUnitOccupied`) when it is absent. Only occupied units'
   *  rent counts toward net rental income. */
  occupied?: boolean
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

/** Aggregation provider seam (spec 024): a second provider extends this union
 *  (plus the Postgres enum) without reshaping household data. */
export type LinkedProvider = 'plaid'
export type LinkedInstitutionStatus = 'active' | 'disconnected'

/** One standing bank connection made through an aggregation provider
 *  (Supabase `linked_institutions`, spec 024). Display metadata only — the
 *  provider access credential lives server-side in Vault and has no client
 *  type on purpose. Clients read; only edge functions write. */
export interface LinkedInstitution {
  id: string
  household_id: string
  provider: LinkedProvider
  provider_item_id: string
  provider_institution_id: string | null
  institution_name: string
  status: LinkedInstitutionStatus
  /** User who connected it (US4 attribution). */
  created_by: string
  created_at: string
  updated_at: string
  disconnected_at: string | null
}

/** One bank account revealed by a linked institution (Supabase
 *  `linked_accounts`, spec 024). Never balances, never transactions —
 *  connect-only scope. Type/subtype are Plaid vocabulary rendered verbatim. */
export interface LinkedAccount {
  id: string
  institution_id: string
  provider_account_id: string
  name: string
  official_name: string | null
  /** Last-4 display mask; the provider may omit it. */
  mask: string | null
  account_type: string
  account_subtype: string | null
  created_at: string
}

export interface Insight {
  id: string
  title: string
  body: string
  severity: InsightSeverity
  icon: string
  category: TransactionCategory | null
  magnitude_cents: number
  /** Recurring insight only: the 3-merchant preview, amount-desc with
   *  case-insensitive name tie-break, newest-transaction casing. Vectored
   *  (spec 013) because ordering/casing are cross-surface logic; the body
   *  string itself stays per-surface (localized). */
  preview_merchants?: string[]
}


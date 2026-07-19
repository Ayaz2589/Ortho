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
  /** Ids of the household `tags` attached to this transaction (spec 027).
   *  Orthogonal to `category`. Optional so existing fixtures/importers need not
   *  set it; `rehydrateTransactions` always materializes it to at least []. */
  tags?: string[]
  /** Free-form note (spec 027; Supabase `transactions.notes`). Distinct from
   *  `source` (the card/account that paid). null/absent = no note. */
  notes?: string | null
}

/** One owner's cents share of a transaction (Supabase `transaction_shares`). */
export interface TransactionShare {
  transaction_id: string
  person_id: string
  amount_cents: number
}

/** A free-form, household-scoped label (spec 027; Supabase `tags`). Orthogonal
 *  to category; identity is its trimmed, case-insensitive name per household. */
export interface Tag {
  id: string
  household_id: string
  name: string
  created_at: string
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

/** How a budget behaves month to month (spec 027). `fixed` = reset monthly
 *  (the pre-027 behavior and the migration default); `flex` = unused remainder
 *  rolls forward, overspend forgiven; `non_monthly` = signed sinking fund. */
export type BudgetType = 'fixed' | 'flex' | 'non_monthly'

export interface Budget {
  id: string
  household_id: string
  category: TransactionCategory
  /** Base monthly limit (integer USD cents). Rollover builds on top of this. */
  monthly_limit_cents: number
  budget_type: BudgetType
  /** Flex-only cap on accumulated carry (cents); null = uncapped. */
  rollover_cap_cents: number | null
  /** Carry anchor — the month carry begins accruing. Present from the DB row. */
  created_at?: string
}

/** Savings vs. debt-payoff (spec 027). Both accumulate contributions toward a
 *  positive target with identical math — kind drives only plain-language framing
 *  ("saved" vs "paid off"). Mirrors the Postgres `goal_kind` enum. */
export type GoalKind = 'savings' | 'debt_payoff'

/** A named household goal (Supabase `goals`, spec 027): reach `target_cents` by
 *  the optional `target_date`. Progress is the client-computed sum of the goal's
 *  `GoalContribution`s (see `lib/finance/goals.ts`) — never stored. The optional
 *  `linked_account_id` / `linked_category` are CONTEXT ONLY in v1 (bank balances
 *  aren't synced — spec 024 is connect-only); at most one is set. */
export interface Goal {
  id: string
  household_id: string
  name: string
  kind: GoalKind
  target_cents: number
  /** 'YYYY-MM-DD' local calendar day, or null for an undated goal (no pace). */
  target_date: string | null
  /** Context association (spec 027 v1): at most one of these two is set; neither
   *  drives progress. */
  linked_account_id: string | null
  linked_category: TransactionCategory | null
  created_by: string
  /** Doubles as the pace START reference for the off-track insight. */
  created_at: string
  updated_at: string
}

/** One dated USD-cent amount set aside toward a goal (Supabase
 *  `goal_contributions`, spec 027). The sum of a goal's contributions is its
 *  progress; removing a mistaken one is a delete (contributions are positive). */
export interface GoalContribution {
  id: string
  goal_id: string
  amount_cents: number
  /** 'YYYY-MM-DD'. */
  date: string
  note: string | null
  created_by: string
  created_at: string
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


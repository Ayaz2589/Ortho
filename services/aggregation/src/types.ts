// Provider-agnostic shapes for the aggregation core (spec 024, FR-010).
// Plaid-specific code lives in deprecated/plaid.ts; SimpleFIN (the go-forward
// provider, spec 028) in simplefin.ts / simplefinClient.ts / normalize.ts.
// Both providers end in these same shapes.

/** Aggregation providers. Mirrors the Postgres `linked_provider` enum. */
export type LinkedProvider = 'plaid' | 'simplefin'

/** Mirrors the Postgres `transaction_kind` enum (direction of money). Ortho stores
 *  amount_cents as non-negative; kind carries the sign. `transfer` is never inferred
 *  from SimpleFIN data — sync classifies only income/expense (spec 028, research D4). */
export type TransactionKind = 'income' | 'expense' | 'transfer'

/** Mirrors the Postgres `linked_institution_status` enum. */
export type LinkedInstitutionStatus = 'active' | 'disconnected'

/** How the Link UI runs: in the web page, or in the external system browser
 *  (Capacitor iOS — webview Link is deprecated by the provider). */
export type LinkMode = 'embedded' | 'hosted'

/** Contract error codes shared with the plaid-* edge functions and localized
 *  by the clients (contracts/plaid-functions.md). Raw provider text never
 *  crosses this boundary. */
export type AggregationErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'not_configured'
  | 'not_household_member'
  | 'provider_unreachable'
  | 'provider_error'
  | 'session_not_found'
  | 'session_not_owned'
  | 'session_expired'
  | 'session_incomplete'
  | 'exchange_failed'
  | 'institution_not_found'
  | 'disconnect_failed'
  // SimpleFIN (spec 028)
  | 'claim_failed'
  | 'rate_limited'
  | 'sync_failed'

/** A normalized account revealed at link time — display metadata only
 *  (connect-only scope: never balances, never transactions). */
export interface NormalizedAccount {
  providerAccountId: string
  name: string
  officialName: string | null
  mask: string | null
  accountType: string
  accountSubtype: string | null
}

/** SimpleFIN account display metadata parsed from GET /accounts (spec 028). Adds
 *  `currency` to NormalizedAccount's display fields. */
export interface SimpleFinAccountMeta {
  providerAccountId: string
  name: string
  /** Org/bank name (SimpleFIN groups accounts under orgs). */
  orgName: string | null
  currency: string | null
  mask: string | null
  accountType: string
}

/** One normalized SimpleFIN transaction ready to map into an upsert_transaction
 *  payload. `amountCents` is the absolute value; direction is in `kind`. */
export interface SimpleFinTransaction {
  providerAccountId: string
  providerTxnId: string
  amountCents: number
  kind: TransactionKind
  /** Unix epoch seconds of the posted (or transacted) time. */
  postedAt: number
  description: string
  memo: string | null
  pending: boolean
}

/** Result of parsing GET /accounts: normalized transactions + accounts + any
 *  in-band provider warnings (SimpleFIN returns errors alongside data). */
export interface ParsedSimpleFinAccounts {
  accounts: SimpleFinAccountMeta[]
  transactions: SimpleFinTransaction[]
  warnings: string[]
}

// Provider-agnostic shapes for the aggregation core (spec 024, FR-010).
// Everything Plaid-specific lives in plaid.ts / plaidClient.ts; a second
// provider adds a module that ends in these same shapes.

/** Aggregation providers. Mirrors the Postgres `linked_provider` enum. */
export type LinkedProvider = 'plaid'

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

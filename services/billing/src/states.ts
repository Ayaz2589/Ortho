/**
 * Binding constants and state vocabularies.
 * Contract: specs/018-subscription-system/contracts/entitlement-state.md — amend it first.
 */

/** Stored, provider-shaped status (Postgres enum `entitlement_status`). */
export type EntitlementStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'unpaid'
  | 'canceled'
  | 'admin'

/** Derived, UI-facing gate fact — the single thing clients gate the shell on. */
export type GateState = 'admin' | 'trialing' | 'active' | 'grace' | 'lapsed'

export type BillingPlan = 'monthly' | 'yearly'

/** Late-renewal / missed-event slack applied to trialing+active at derivation time. */
export const LEEWAY_HOURS = 48

/** Extra access window while past_due (matches Stripe's default retry window of ~2 weeks). */
export const DUNNING_GRACE_DAYS = 14

/** Length of the app-administered free month (ensure_entitlement() mirrors this in SQL). */
export const TRIAL_DAYS = 31

/** The slice of an entitlements row that derivation needs. */
export type EntitlementSnapshot = {
  status: EntitlementStatus
  /** ISO-8601 UTC or null. Null means "never expires" and is legal ONLY for admin. */
  accessExpiresAt: string | null
}

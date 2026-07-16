/**
 * Entitlement gate derivation — HAND-MIRRORED from services/billing/src/derive.ts
 * (the canonical copy); the Capacitor iOS shell ships this copy. Both are locked
 * by the identical literal vectors V01–V19 + digest in
 * specs/018-subscription-system/contracts/entitlement-state.md — amend the
 * contract before touching semantics here. Deliberately NOT imported from
 * services/billing (plan D7): a 40-line mirrored pure function under literal lock
 * beats a cross-package build dependency.
 */

export type EntitlementStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'unpaid'
  | 'canceled'
  | 'admin'

/** The single fact the shell gates on (FR-005). */
export type GateState = 'admin' | 'trialing' | 'active' | 'grace' | 'lapsed'

export const LEEWAY_HOURS = 48
export const DUNNING_GRACE_DAYS = 14
export const TRIAL_DAYS = 31

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export type EntitlementSnapshot = {
  status: EntitlementStatus
  accessExpiresAt: string | null
}

/** The entitlements row as PostgREST returns it (data-model §2). */
export type DbEntitlement = {
  user_id: string
  status: EntitlementStatus
  access_expires_at: string | null
  plan: 'monthly' | 'yearly' | null
  source: 'trial' | 'stripe' | 'operator'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

/** Rules evaluate top-down, first match wins; expiry comparisons are STRICT `<`. */
export function deriveGateState(row: EntitlementSnapshot, nowIso: string): GateState {
  if (row.status === 'admin') return 'admin'
  if (row.accessExpiresAt === null) return 'lapsed'

  const now = Date.parse(nowIso)
  const expires = Date.parse(row.accessExpiresAt)

  switch (row.status) {
    case 'trialing':
      return now < expires + LEEWAY_HOURS * HOUR_MS ? 'trialing' : 'lapsed'
    case 'active':
      return now < expires + LEEWAY_HOURS * HOUR_MS ? 'active' : 'lapsed'
    case 'past_due':
      return now < expires + LEEWAY_HOURS * HOUR_MS + DUNNING_GRACE_DAYS * DAY_MS
        ? 'grace'
        : 'lapsed'
    case 'canceled':
      // Paid-through: access until the period end, deliberately with NO leeway.
      return now < expires ? 'active' : 'lapsed'
    case 'paused':
    case 'unpaid':
      return 'lapsed'
  }
}

/** Whole days until expiry (floor 0) — Settings "X days left" copy. */
export function daysRemaining(accessExpiresAt: string | null, nowIso: string): number {
  if (accessExpiresAt === null) return 0
  const ms = Date.parse(accessExpiresAt) - Date.parse(nowIso)
  return ms > 0 ? Math.ceil(ms / DAY_MS) : 0
}

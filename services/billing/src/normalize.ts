import type { BillingPlan, EntitlementStatus } from './states.ts'

/**
 * The provider-adapter seam (contracts/stripe-events.md): everything provider-specific
 * ends at this shape. A future Apple/StoreKit adapter emits the same structure with
 * provider: 'apple'; the machine never learns provider details beyond the tag.
 */
export type NormalizedEventType =
  | 'checkout_completed'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'subscription_updated'
  | 'subscription_deleted'
  | 'subscription_paused'
  | 'trial_will_end'
  | 'unrecognized'

export type NormalizedBillingEvent = {
  eventId: string
  provider: 'stripe'
  type: NormalizedEventType
  /** ISO-8601 UTC of the provider-side `created` — drives the staleness guard. */
  eventCreatedAt: string
  /** Resolved target user, or null when the host must resolve via customer lookup. */
  userId: string | null
  /** Provider-mapped stored status; present only for subscription_updated. */
  status?: EntitlementStatus
  /** Raw provider period end (leeway is applied ONLY at derivation). */
  periodEndsAt?: string | null
  plan?: BillingPlan
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

/** The full entitlements row as the machine sees it (camelCase of data-model §2). */
export type EntitlementRow = {
  userId: string
  status: EntitlementStatus
  accessExpiresAt: string | null
  plan: BillingPlan | null
  source: 'trial' | 'stripe' | 'operator'
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  /** Provider `created` of the last APPLIED event — the out-of-order shield. */
  lastEventAt: string | null
}

export type MachineOutcome =
  | { kind: 'applied'; row: EntitlementRow }
  | { kind: 'noop'; reason: string }
  | { kind: 'skipped_stale' }
  | { kind: 'skipped_unmatched' }

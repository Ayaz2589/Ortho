import type { EntitlementRow, MachineOutcome, NormalizedBillingEvent } from './normalize.ts'

/**
 * Provider-agnostic entitlement state machine. Pure: never mutates inputs, returns a
 * fresh row on 'applied'. Dedup by event id is the HOST's job (billing_events unique
 * insert) and happens before this function is called.
 *
 * Guard order and transition semantics are contract-bound: see
 * specs/018-subscription-system/contracts/stripe-events.md.
 */
export function applyBillingEvent(
  row: EntitlementRow | null,
  event: NormalizedBillingEvent
): MachineOutcome {
  // Guard 2 (guard 1, dedup, lives in the host): unmatched target.
  if (row === null || event.userId === null) return { kind: 'skipped_unmatched' }

  // Guard 3: staleness — newest provider `created` wins; equal is stale (documented edge).
  if (row.lastEventAt !== null && Date.parse(event.eventCreatedAt) <= Date.parse(row.lastEventAt)) {
    return { kind: 'skipped_stale' }
  }

  // Guard 4: admin wins — reference ids may update, status/expiry/plan/source never.
  if (row.status === 'admin') {
    return {
      kind: 'applied',
      row: {
        ...row,
        stripeCustomerId: event.stripeCustomerId ?? row.stripeCustomerId,
        stripeSubscriptionId: event.stripeSubscriptionId ?? row.stripeSubscriptionId,
        lastEventAt: event.eventCreatedAt,
      },
    }
  }

  const applied = (changes: Partial<EntitlementRow>): MachineOutcome => ({
    kind: 'applied',
    row: {
      ...row,
      // Money-carrying events fill reference fields whenever they bring them.
      stripeCustomerId: event.stripeCustomerId ?? row.stripeCustomerId,
      stripeSubscriptionId: event.stripeSubscriptionId ?? row.stripeSubscriptionId,
      plan: event.plan ?? row.plan,
      ...changes,
      lastEventAt: event.eventCreatedAt,
    },
  })

  switch (event.type) {
    case 'checkout_completed':
      if (!event.periodEndsAt) return { kind: 'noop', reason: 'checkout_without_period' }
      return applied({ status: 'active', accessExpiresAt: event.periodEndsAt, source: 'stripe' })

    case 'payment_succeeded':
      if (!event.periodEndsAt) return { kind: 'noop', reason: 'payment_without_period' }
      return applied({ status: 'active', accessExpiresAt: event.periodEndsAt, source: 'stripe' })

    case 'payment_failed':
      // FR-020: a failure event alone NEVER lapses; and it only means dunning for a
      // subscription we know is running (fail-safe on early/out-of-context arrival).
      if (row.status !== 'active' && row.status !== 'past_due') {
        return { kind: 'noop', reason: `payment_failed_ignored_on_${row.status}` }
      }
      return applied({ status: 'past_due' })

    case 'subscription_updated':
      if (!event.status) return { kind: 'noop', reason: 'update_without_status' }
      return applied({
        status: event.status,
        accessExpiresAt: event.periodEndsAt ?? row.accessExpiresAt,
        source: 'stripe',
      })

    case 'subscription_deleted':
      // Paid-through: the event's period end IS the paid-through instant when carried.
      return applied({
        status: 'canceled',
        accessExpiresAt: event.periodEndsAt ?? row.accessExpiresAt,
        source: 'stripe',
      })

    case 'subscription_paused':
      return applied({
        status: 'paused',
        accessExpiresAt: event.periodEndsAt ?? row.accessExpiresAt,
        source: 'stripe',
      })

    case 'trial_will_end':
      return { kind: 'noop', reason: 'trial_will_end_log_only' }

    case 'unrecognized':
      return { kind: 'noop', reason: 'unrecognized_event_type' }
  }
}

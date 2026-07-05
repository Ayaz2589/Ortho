import type { NormalizedBillingEvent } from './normalize.ts'
import type { BillingPlan, EntitlementStatus } from './states.ts'

/**
 * Pure Stripe payload → NormalizedBillingEvent translator. No SDK, no I/O: the host
 * verifies signatures and (for checkout.session.completed only) retrieves the
 * subscription, then hands plain JSON here. Never throws on malformed input — the
 * worst outcome is type 'unrecognized' (the webhook must 200 unknown shapes).
 */
export type StripeEventLike = {
  id: string
  type: string
  /** Unix seconds. */
  created: number
  data: { object: unknown }
}

export type StripePriceConfig = { priceMonthly: string; priceYearly: string }

/** Host-supplied extras; the retrieved subscription for checkout.session.completed. */
export type StripeSupplements = { subscription?: unknown }

type Rec = Record<string, unknown>

const asRec = (v: unknown): Rec | null =>
  typeof v === 'object' && v !== null ? (v as Rec) : null

const asStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const unixToIso = (seconds: number): string => new Date(seconds * 1000).toISOString()

function planForPrice(priceId: string | null, config: StripePriceConfig): BillingPlan | undefined {
  if (priceId === config.priceMonthly) return 'monthly'
  if (priceId === config.priceYearly) return 'yearly'
  return undefined
}

function metadataUserId(obj: Rec | null): string | null {
  return asStr(asRec(obj?.['metadata'])?.['user_id'])
}

/** Subscription-object field extraction shared by updated/deleted/paused + the checkout supplement. */
function subscriptionFields(sub: Rec | null, config: StripePriceConfig) {
  const items = asRec(sub?.['items'])
  const firstItem = asRec((items?.['data'] as unknown[] | undefined)?.[0])
  const priceId = asStr(asRec(firstItem?.['price'])?.['id'])
  const periodEnd = asNum(sub?.['current_period_end'])
  return {
    userId: metadataUserId(sub),
    periodEndsAt: periodEnd === null ? null : unixToIso(periodEnd),
    plan: planForPrice(priceId, config),
    stripeCustomerId: asStr(sub?.['customer']),
    stripeSubscriptionId: asStr(sub?.['id']),
  }
}

const STRIPE_STATUS_MAP: Record<string, EntitlementStatus> = {
  active: 'active',
  trialing: 'active', // v1 runs no Stripe trials; treat as good standing if it ever appears
  past_due: 'past_due',
  paused: 'paused',
  unpaid: 'unpaid',
  canceled: 'canceled',
  // incomplete / incomplete_expired deliberately absent: pre-payment states never apply.
}

export function translateStripeEvent(
  event: StripeEventLike,
  config: StripePriceConfig,
  supplements: StripeSupplements = {}
): NormalizedBillingEvent {
  const base = {
    eventId: event.id,
    provider: 'stripe' as const,
    eventCreatedAt: unixToIso(event.created),
  }
  const unrecognized = (userId: string | null = null): NormalizedBillingEvent => ({
    ...base,
    type: 'unrecognized',
    userId,
  })

  const obj = asRec(event.data?.object)
  if (obj === null) return unrecognized()

  switch (event.type) {
    case 'checkout.session.completed': {
      if (asStr(obj['mode']) !== 'subscription') return unrecognized()
      const sub = asRec(supplements.subscription)
      const fields = subscriptionFields(sub, config)
      const userId =
        metadataUserId(obj) ?? fields.userId ?? asStr(obj['client_reference_id'])
      return {
        ...base,
        type: 'checkout_completed',
        userId,
        periodEndsAt: fields.periodEndsAt,
        ...(fields.plan ? { plan: fields.plan } : {}),
        ...(asStr(obj['customer']) ? { stripeCustomerId: asStr(obj['customer'])! } : {}),
        ...(asStr(obj['subscription']) ? { stripeSubscriptionId: asStr(obj['subscription'])! } : {}),
      }
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const lines = (asRec(obj['lines'])?.['data'] as unknown[] | undefined) ?? []
      let maxEnd: number | null = null
      let priceId: string | null = null
      for (const line of lines) {
        const rec = asRec(line)
        const end = asNum(asRec(rec?.['period'])?.['end'])
        if (end !== null && (maxEnd === null || end > maxEnd)) {
          maxEnd = end
          priceId = asStr(asRec(rec?.['price'])?.['id']) ?? priceId
        }
      }
      const plan = planForPrice(priceId, config)
      const userId = metadataUserId(asRec(obj['subscription_details']))
      return {
        ...base,
        type: event.type === 'invoice.paid' ? 'payment_succeeded' : 'payment_failed',
        userId,
        periodEndsAt: event.type === 'invoice.paid' && maxEnd !== null ? unixToIso(maxEnd) : null,
        ...(event.type === 'invoice.paid' && plan ? { plan } : {}),
        ...(asStr(obj['customer']) ? { stripeCustomerId: asStr(obj['customer'])! } : {}),
        ...(asStr(obj['subscription']) ? { stripeSubscriptionId: asStr(obj['subscription'])! } : {}),
      }
    }

    case 'customer.subscription.updated': {
      const status = STRIPE_STATUS_MAP[asStr(obj['status']) ?? '']
      if (!status) return unrecognized(metadataUserId(obj))
      const fields = subscriptionFields(obj, config)
      return {
        ...base,
        type: 'subscription_updated',
        userId: fields.userId,
        status,
        periodEndsAt: fields.periodEndsAt,
        ...(fields.plan ? { plan: fields.plan } : {}),
        ...(fields.stripeCustomerId ? { stripeCustomerId: fields.stripeCustomerId } : {}),
        ...(fields.stripeSubscriptionId ? { stripeSubscriptionId: fields.stripeSubscriptionId } : {}),
      }
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const fields = subscriptionFields(obj, config)
      return {
        ...base,
        type: event.type === 'customer.subscription.deleted' ? 'subscription_deleted' : 'subscription_paused',
        userId: fields.userId,
        periodEndsAt: fields.periodEndsAt,
        ...(fields.plan ? { plan: fields.plan } : {}),
        ...(fields.stripeCustomerId ? { stripeCustomerId: fields.stripeCustomerId } : {}),
        ...(fields.stripeSubscriptionId ? { stripeSubscriptionId: fields.stripeSubscriptionId } : {}),
      }
    }

    case 'customer.subscription.trial_will_end':
      return { ...base, type: 'trial_will_end', userId: metadataUserId(obj) }

    default:
      return unrecognized()
  }
}

import { describe, expect, it } from 'vitest'
import { translateStripeEvent, type StripePriceConfig } from '../src/index'

const config: StripePriceConfig = { priceMonthly: 'price_m', priceYearly: 'price_y' }

// Unix seconds used by Stripe `created` / period fields.
const CREATED = 1783600000 // 2026-07-09T02:26:40Z
const CREATED_ISO = new Date(CREATED * 1000).toISOString()
const PERIOD_END = 1786300000
const PERIOD_END_ISO = new Date(PERIOD_END * 1000).toISOString()

function stripeEvent(type: string, object: Record<string, unknown>) {
  return { id: 'evt_1', type, created: CREATED, data: { object } }
}

const subscriptionObject = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: 'active',
  current_period_end: PERIOD_END,
  metadata: { user_id: 'user-1' },
  items: { data: [{ price: { id: 'price_m' } }] },
  ...overrides,
})

describe('checkout.session.completed', () => {
  const session = {
    id: 'cs_1',
    object: 'checkout.session',
    mode: 'subscription',
    customer: 'cus_1',
    subscription: 'sub_1',
    client_reference_id: 'user-ref',
    metadata: { user_id: 'user-1' },
  }

  it('with the retrieved subscription supplement → checkout_completed with period/plan/ids', () => {
    const out = translateStripeEvent(stripeEvent('checkout.session.completed', session), config, {
      subscription: subscriptionObject(),
    })
    expect(out).toMatchObject({
      eventId: 'evt_1',
      provider: 'stripe',
      type: 'checkout_completed',
      eventCreatedAt: CREATED_ISO,
      userId: 'user-1',
      periodEndsAt: PERIOD_END_ISO,
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
  })

  it('userId falls back to the SUBSCRIPTION metadata when session metadata is absent', () => {
    const out = translateStripeEvent(
      stripeEvent('checkout.session.completed', { ...session, metadata: {} }),
      config,
      { subscription: subscriptionObject() }
    )
    expect(out.userId).toBe('user-1')
  })

  it('client_reference_id is NEVER trusted for user resolution (review 018 security finding)', () => {
    // Both metadata sources absent: even with a client_reference_id present the
    // translator must return null and let the host resolve via the customer-id
    // mapping it wrote itself — c_r_i is a client-suppliable field on payment
    // links and must not become an entitlement-write path.
    const out = translateStripeEvent(
      stripeEvent('checkout.session.completed', { ...session, metadata: {} }),
      config,
      { subscription: subscriptionObject({ metadata: {} }) }
    )
    expect(out.userId).toBeNull()
  })

  it('non-subscription mode → unrecognized', () => {
    const out = translateStripeEvent(
      stripeEvent('checkout.session.completed', { ...session, mode: 'payment' }),
      config
    )
    expect(out.type).toBe('unrecognized')
  })

  it('without the supplement, periodEndsAt is absent (machine will noop defensively)', () => {
    const out = translateStripeEvent(stripeEvent('checkout.session.completed', session), config)
    expect(out.type).toBe('checkout_completed')
    expect(out.periodEndsAt ?? null).toBeNull()
  })
})

describe('invoice.paid', () => {
  const invoice = {
    id: 'in_1',
    object: 'invoice',
    customer: 'cus_1',
    subscription: 'sub_1',
    subscription_details: { metadata: { user_id: 'user-1' } },
    lines: {
      data: [
        { period: { start: 1, end: PERIOD_END - 100 }, price: { id: 'price_m' } },
        { period: { start: 1, end: PERIOD_END }, price: { id: 'price_m' } },
      ],
    },
  }

  it('→ payment_succeeded with MAX line period end, plan, ids', () => {
    const out = translateStripeEvent(stripeEvent('invoice.paid', invoice), config)
    expect(out).toMatchObject({
      type: 'payment_succeeded',
      userId: 'user-1',
      periodEndsAt: PERIOD_END_ISO,
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
  })

  it('yearly price id maps to yearly plan', () => {
    const yearly = {
      ...invoice,
      lines: { data: [{ period: { start: 1, end: PERIOD_END }, price: { id: 'price_y' } }] },
    }
    expect(translateStripeEvent(stripeEvent('invoice.paid', yearly), config).plan).toBe('yearly')
  })

  it('unknown price id → plan absent (never guessed)', () => {
    const other = {
      ...invoice,
      lines: { data: [{ period: { start: 1, end: PERIOD_END }, price: { id: 'price_zzz' } }] },
    }
    expect(translateStripeEvent(stripeEvent('invoice.paid', other), config).plan ?? null).toBeNull()
  })

  it('plan follows the MAX-period line only — independent of line order (no price bleed)', () => {
    // A proration/adjustment line can be the max-period line yet carry no
    // extractable price, while an earlier lower-period line does. The plan must
    // come from the winning max line, not leak from the lower line — otherwise the
    // same invoice yields a different plan depending purely on array order.
    const lower = { period: { start: 1, end: PERIOD_END - 100 }, price: { id: 'price_m' } }
    const maxNoPrice = { period: { start: 1, end: PERIOD_END } }
    const forward = { ...invoice, lines: { data: [lower, maxNoPrice] } }
    const reversed = { ...invoice, lines: { data: [maxNoPrice, lower] } }
    const planForward = translateStripeEvent(stripeEvent('invoice.paid', forward), config).plan ?? null
    const planReversed = translateStripeEvent(stripeEvent('invoice.paid', reversed), config).plan ?? null
    expect(planForward).toBe(planReversed)
    expect(planForward).toBeNull()
    // periodEndsAt still tracks the max line regardless.
    expect(translateStripeEvent(stripeEvent('invoice.paid', forward), config).periodEndsAt).toBe(
      PERIOD_END_ISO,
    )
  })
})

describe('invoice.payment_failed', () => {
  it('→ payment_failed with customer id; no period', () => {
    const out = translateStripeEvent(
      stripeEvent('invoice.payment_failed', {
        id: 'in_2',
        object: 'invoice',
        customer: 'cus_1',
        subscription: 'sub_1',
        subscription_details: { metadata: { user_id: 'user-1' } },
        lines: { data: [] },
      }),
      config
    )
    expect(out.type).toBe('payment_failed')
    expect(out.userId).toBe('user-1')
    expect(out.periodEndsAt ?? null).toBeNull()
  })
})

describe('customer.subscription.updated', () => {
  const cases: Array<[stripeStatus: string, expected: string | null]> = [
    ['active', 'active'],
    ['trialing', 'active'], // v1 runs no Stripe trials; treat as good standing
    ['past_due', 'past_due'],
    ['paused', 'paused'],
    ['unpaid', 'unpaid'],
    ['canceled', 'canceled'],
  ]

  for (const [stripeStatus, expected] of cases) {
    it(`status ${stripeStatus} → ${expected}`, () => {
      const out = translateStripeEvent(
        stripeEvent('customer.subscription.updated', subscriptionObject({ status: stripeStatus })),
        config
      )
      expect(out.type).toBe('subscription_updated')
      expect(out.status).toBe(expected)
      expect(out.periodEndsAt).toBe(PERIOD_END_ISO)
      expect(out.plan).toBe('monthly')
    })
  }

  for (const preStatus of ['incomplete', 'incomplete_expired']) {
    it(`pre-payment status ${preStatus} → unrecognized (never applied)`, () => {
      const out = translateStripeEvent(
        stripeEvent('customer.subscription.updated', subscriptionObject({ status: preStatus })),
        config
      )
      expect(out.type).toBe('unrecognized')
    })
  }
})

describe('customer.subscription.deleted / paused carry the full subscription object', () => {
  it('deleted → subscription_deleted with period, plan, ids', () => {
    const out = translateStripeEvent(
      stripeEvent('customer.subscription.deleted', subscriptionObject({ status: 'canceled' })),
      config
    )
    expect(out).toMatchObject({
      type: 'subscription_deleted',
      periodEndsAt: PERIOD_END_ISO,
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
  })

  it('paused → subscription_paused with the same field extraction', () => {
    const out = translateStripeEvent(
      stripeEvent('customer.subscription.paused', subscriptionObject({ status: 'paused' })),
      config
    )
    expect(out.type).toBe('subscription_paused')
    expect(out.periodEndsAt).toBe(PERIOD_END_ISO)
  })
})

// stripe@22 pins API version 2026-06-24.dahlia: current_period_end lives on the
// SUBSCRIPTION ITEM (not the subscription), invoices carry parent.subscription_details
// (no top-level subscription_details/subscription), and lines price via
// pricing.price_details.price (no line.price). The translator must parse BOTH
// generations (review 018 finding, verified against the published package types).
describe('dahlia (2025+) payload shapes', () => {
  const dahliaSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    // NO top-level current_period_end
    metadata: { user_id: 'user-1' },
    items: { data: [{ price: { id: 'price_y' }, current_period_end: PERIOD_END }] },
    ...overrides,
  })

  it('subscription events read period end from the item level', () => {
    const out = translateStripeEvent(
      stripeEvent('customer.subscription.updated', dahliaSubscription()),
      config
    )
    expect(out.periodEndsAt).toBe(PERIOD_END_ISO)
    expect(out.plan).toBe('yearly')
  })

  it('checkout supplement in dahlia shape still yields the period end', () => {
    const out = translateStripeEvent(
      stripeEvent('checkout.session.completed', {
        id: 'cs_1', object: 'checkout.session', mode: 'subscription',
        customer: 'cus_1', subscription: 'sub_1', metadata: { user_id: 'user-1' },
      }),
      config,
      { subscription: dahliaSubscription() }
    )
    expect(out.type).toBe('checkout_completed')
    expect(out.periodEndsAt).toBe(PERIOD_END_ISO)
  })

  it('deleted events in dahlia shape carry period/plan/ids', () => {
    const out = translateStripeEvent(
      stripeEvent('customer.subscription.deleted', dahliaSubscription({ status: 'canceled' })),
      config
    )
    expect(out).toMatchObject({
      type: 'subscription_deleted',
      periodEndsAt: PERIOD_END_ISO,
      plan: 'yearly',
      stripeSubscriptionId: 'sub_1',
    })
  })

  it('dahlia invoices: metadata + subscription id via parent.subscription_details, price via pricing.price_details', () => {
    const out = translateStripeEvent(
      stripeEvent('invoice.paid', {
        id: 'in_9',
        object: 'invoice',
        customer: 'cus_1',
        // NO top-level subscription / subscription_details
        parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: 'user-1' } } },
        lines: {
          data: [
            { period: { start: 1, end: PERIOD_END }, pricing: { price_details: { price: 'price_m' } } },
          ],
        },
      }),
      config
    )
    expect(out).toMatchObject({
      type: 'payment_succeeded',
      userId: 'user-1',
      periodEndsAt: PERIOD_END_ISO,
      plan: 'monthly',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
  })
})

describe('invoice max-period line pairing is pinned (mutation-test finding)', () => {
  it('the plan comes from the MAX-period line, not the first line', () => {
    const out = translateStripeEvent(
      stripeEvent('invoice.paid', {
        id: 'in_pair',
        object: 'invoice',
        customer: 'cus_1',
        subscription: 'sub_1',
        subscription_details: { metadata: { user_id: 'user-1' } },
        lines: {
          data: [
            // First line: monthly price, EARLIER period end.
            { period: { start: 1, end: PERIOD_END - 500 }, price: { id: 'price_m' } },
            // Max-period line: yearly price — this one must win the pairing.
            { period: { start: 1, end: PERIOD_END }, price: { id: 'price_y' } },
            // Later-listed but earlier-period line must not steal it back.
            { period: { start: 1, end: PERIOD_END - 900 }, price: { id: 'price_m' } },
          ],
        },
      }),
      config
    )
    expect(out.periodEndsAt).toBe(PERIOD_END_ISO)
    expect(out.plan).toBe('yearly')
  })
})

describe('log-only and unknown types', () => {
  it('trial_will_end → trial_will_end (noop downstream)', () => {
    const out = translateStripeEvent(
      stripeEvent('customer.subscription.trial_will_end', subscriptionObject()),
      config
    )
    expect(out.type).toBe('trial_will_end')
  })

  it('unknown event type → unrecognized, never a throw', () => {
    const out = translateStripeEvent(stripeEvent('charge.refunded', { id: 'ch_1' }), config)
    expect(out.type).toBe('unrecognized')
    expect(out.eventId).toBe('evt_1')
  })

  it('malformed/missing object → unrecognized, never a throw', () => {
    const out = translateStripeEvent({ id: 'evt_x', type: 'invoice.paid', created: CREATED, data: { object: null } } as never, config)
    expect(out.type).toBe('unrecognized')
  })
})

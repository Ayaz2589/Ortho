# Contract: Stripe event → entitlement transition mapping

**Status**: BINDING for `services/billing` (`stripe.ts` translator + `machine.ts`) and the
webhook function. This is the provider-adapter seam: everything Stripe-specific ends at the
`NormalizedBillingEvent`; the machine below is provider-agnostic (a future StoreKit adapter
emits the same normalized shape with `provider: 'apple'`).

## Normalized event shape

```ts
type NormalizedBillingEvent = {
  eventId: string                    // provider event id (dedup key)
  provider: 'stripe'                 // 'apple' reserved (D6 seam)
  type: 'checkout_completed' | 'payment_succeeded' | 'payment_failed'
      | 'subscription_updated' | 'subscription_deleted' | 'subscription_paused'
      | 'trial_will_end' | 'unrecognized'
  eventCreatedAt: string             // ISO UTC of provider `created`
  userId: string | null              // resolution order below
  status?: EntitlementStatus         // only for subscription_updated (mapped table below)
  periodEndsAt?: string | null       // raw provider period end (leeway applied ONLY at derivation)
  plan?: 'monthly' | 'yearly'        // from price id ↔ STRIPE_PRICE_* env mapping
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}
```

**User resolution order** (adapter): `subscription_data`/session `metadata.user_id` →
`client_reference_id` → lookup `entitlements.stripe_customer_id`. Unresolvable ⇒ machine
outcome `skipped_unmatched` (event still logged; webhook still 200s).

## Stripe → normalized mapping

| Stripe event | Normalized `type` | Field extraction |
|---|---|---|
| `checkout.session.completed` | `checkout_completed` | customer + subscription ids from session; **the one API fetch**: retrieve the subscription for `current_period_end` + price→plan; ignore non-subscription-mode sessions (`noop`) |
| `invoice.paid` | `payment_succeeded` | `periodEndsAt` = max line `period.end`; customer id from invoice |
| `invoice.payment_failed` | `payment_failed` | customer id; no period change |
| `customer.subscription.updated` | `subscription_updated` | `status` per table below; `current_period_end`; price→plan |
| `customer.subscription.deleted` | `subscription_deleted` | ids only |
| `customer.subscription.paused` | `subscription_paused` | ids only |
| `customer.subscription.trial_will_end` | `trial_will_end` | log-only (v1 runs no Stripe trials) |
| anything else | `unrecognized` | logged `noop`; webhook 200s (never 500 on unknown types) |

**Stripe subscription status → stored `entitlement_status`** (for `subscription_updated`):

| Stripe | stored |
|---|---|
| `active` | `active` |
| `trialing` | `active` (v1 creates no Stripe trials; treat as paid-good-standing if it ever appears) |
| `past_due` | `past_due` |
| `paused` | `paused` |
| `unpaid` | `unpaid` |
| `canceled` | `canceled` |
| `incomplete` / `incomplete_expired` | `noop` — never applied (pre-payment states; entitlement untouched) |

## Machine guards (BINDING order — before any transition)

1. **Dedup** (outside machine): `billing_events.event_id` unique insert; conflict ⇒ `noop`, 200.
2. **Unmatched** `userId` ⇒ `skipped_unmatched`.
3. **Stale**: `eventCreatedAt <= entitlements.last_event_at` ⇒ `skipped_stale` (out-of-order shield; SC-007).
4. **Admin wins**: stored `status='admin'` ⇒ apply only `stripe_customer_id`/`stripe_subscription_id`
   reference updates; status/expiry/plan untouched.

## Transitions (post-guards; every row change also sets `last_event_at = eventCreatedAt`, `updated_at = now`)

| Normalized `type` | Effect |
|---|---|
| `checkout_completed` | `status='active'`, `access_expires_at=periodEndsAt`, `plan`, `source='stripe'`, ids |
| `payment_succeeded` | `status='active'` (heals `past_due`/`canceled`-resubscribe), `access_expires_at=periodEndsAt` |
| `payment_failed` | `status='past_due'` **iff** current ∈ {`active`,`past_due`} — else `noop` (FR-020: a failure event alone NEVER lapses; a `trialing` user's stray failure event is a `noop`) |
| `subscription_updated` | `status=mapped`, `access_expires_at=periodEndsAt`, `plan` (portal monthly↔yearly lands here) |
| `subscription_deleted` | `status='canceled'`; expiry **unchanged** (paid-through governs; FR-014/019) |
| `subscription_paused` | `status='paused'`; expiry unchanged |
| `trial_will_end` / `unrecognized` | `noop` (logged) |

## Idempotency & convergence properties (test obligations, SC-007)

For any event stream S with duplicates and arbitrary reordering, processing under the guards
must yield the same final `entitlements` row as processing sorted-unique S. Test fixtures MUST
include at minimum: duplicate `invoice.paid`; `payment_failed` arriving after the healing
`invoice.paid` (stale guard); `subscription_deleted` before a late `subscription_updated`
(stale guard); a replayed `checkout.session.completed`; an admin row receiving the full
subscribe-fail-cancel stream (admin-wins).

## Failure-mode obligations (webhook function)

- Signature invalid/missing ⇒ 400, nothing logged to `billing_events` (unverifiable payloads
  are not audit data).
- DB write failure after verification ⇒ 500 (Stripe retries; dedup makes the retry safe).
- Machine `noop`/`skipped_*` ⇒ 200 (Stripe must not retry semantic skips).

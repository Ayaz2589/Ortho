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

**User resolution order** (adapter): session `metadata.user_id` → subscription
`metadata.user_id` → host lookup via `entitlements.stripe_customer_id`.
`client_reference_id` is deliberately NEVER trusted (client-suppliable on some checkout
surfaces — review 018 security); `billing-checkout` sets `metadata.user_id` on both the
session and the subscription from the caller's JWT. Unresolvable ⇒ machine outcome
`skipped_unmatched` (event still logged; webhook still 200s).

**API version (BINDING)**: payload shapes are version-dependent. All Stripe clients pin
`apiVersion: '2026-06-24.dahlia'` (what `npm:stripe@22` ships), the webhook ENDPOINT is
pinned to the same version (quickstart §2.5), and the translator is dual-shape tolerant
anyway: subscription `current_period_end` read from the subscription OR its first item;
invoice metadata/subscription id from `subscription_details` OR `parent.subscription_details`;
line price from `price.id` OR `pricing.price_details.price` (review 018 — the original
single-shape extraction noop'd every live checkout).

## Stripe → normalized mapping

| Stripe event | Normalized `type` | Field extraction |
|---|---|---|
| `checkout.session.completed` | `checkout_completed` | customer + subscription ids from session; **the one API fetch**: retrieve the subscription for `current_period_end` + price→plan; ignore non-subscription-mode sessions (`noop`) |
| `invoice.paid` | `payment_succeeded` | `periodEndsAt` = max line `period.end`; customer id from invoice |
| `invoice.payment_failed` | `payment_failed` | customer id; no period change |
| `customer.subscription.updated` | `subscription_updated` | `status` per table below; `current_period_end`; price→plan |
| `customer.subscription.deleted` | `subscription_deleted` | full subscription object: ids + `current_period_end` + price→plan (the payload carries them; extracting them is what makes reordered streams converge on every field, not just status) |
| `customer.subscription.paused` | `subscription_paused` | full subscription object, as above |
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
| `subscription_deleted` | `status='canceled'`; expiry = event's `periodEndsAt` when present, else unchanged (Stripe's period end IS the paid-through instant — FR-014/019 semantics preserved); `plan`/ids filled when present |
| `subscription_paused` | `status='paused'`; same field-fill rules |
| `trial_will_end` / `unrecognized` | `noop` (logged) |

## Idempotency & convergence properties (test obligations, SC-007)

Precise binding property (single-pass incremental processing cannot converge under *arbitrary*
reordering of *conditional* transitions — the guarantees below are the honest, load-bearing set):

1. **Duplicates always converge**: re-delivery of any already-processed `event_id` is a `noop`
   (dedup) and the row is byte-identical.
2. **Status-carrying events converge under reordering**: for streams composed of unconditional
   transitions (`checkout_completed`, `payment_succeeded`, `subscription_updated`,
   `subscription_deleted`, `subscription_paused`), any processing order yields the same final
   row as created-order (the stale guard makes newest-created win).
3. **`payment_failed` is order-sensitive but fail-safe**: its only effect is
   `active/past_due → past_due`. Arriving early (before its causal predecessors) it degrades to
   `noop` — the user *keeps* access (never wrongly lapses), and the authoritative state is
   restored by the redundant `customer.subscription.updated` (Stripe fires one carrying
   `past_due` alongside every renewal failure). Tests assert the degradation AND the correction.

Test fixtures MUST include at minimum: duplicate `invoice.paid`; `payment_failed` arriving after
the healing `invoice.paid` (stale guard); `subscription_deleted` before a late
`subscription_updated` (stale guard); a replayed `checkout.session.completed`; an admin row
receiving the full subscribe-fail-cancel stream (admin-wins); the property-2 shuffles; and the
property-3 early-arrival + correction pair. Fixture `created` timestamps are strictly distinct
(Stripe's second-granularity `created` can theoretically collide; the stale guard's `<=` makes
same-second later arrivals no-ops — an accepted, documented edge).

## Failure-mode obligations (webhook function)

- Signature invalid/missing ⇒ 400, nothing logged to `billing_events` (unverifiable payloads
  are not audit data).
- **Failure-aware idempotency (review 018)**: the event-log claim must not turn retries into
  no-ops. Dedup-on-conflict treats only COMPLETED outcomes as duplicates; rows still at
  `received` (crashed mid-flight) or `failed` (500'd) are atomically re-claimed and processed.
  Every 500 path marks the row `failed` before returning, so Stripe's retry genuinely retries.
- DB **read** failures are infrastructure failures ⇒ 500 + re-claimable — never
  `skipped_unmatched` (a masked read error would stop Stripe's retries on a money event).
- A resolved user with NO entitlements row must not drop a money event: the webhook seeds the
  standard trial row (idempotent upsert, same values as `ensure_entitlement`) and applies the
  event to it (paid-before-row heal).
- Machine `noop`/`skipped_*` ⇒ 200 (Stripe must not retry semantic skips).

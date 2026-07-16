# Contract: Billing edge functions (HTTP surface)

**Status**: BINDING for both clients and the operator runbook. Four Supabase Edge Functions —
the repo's first server-side code. All bodies JSON; all errors use the shared error envelope
`{ "error": { "code": string, "message": string } }` with appropriate HTTP status. Functions
never expose Stripe error internals to clients; `message` is always safe, calm copy-source text
(clients localize by `code`, not by `message`).

Common `code` values: `unauthenticated` (401), `invalid_request` (400), `not_configured` (503 —
operator hasn't set prices/secrets; drives the calm "plans unavailable" state),
`no_billing_account` (409 — portal requested but user has no Stripe customer),
`provider_error` (502).

Auth: `billing-checkout`, `billing-portal`, `billing-plans` require a valid user JWT
(default `verify_jwt = true`; the function additionally resolves the user via
`supabase.auth.getUser(jwt)` and acts ONLY for that user — user id never comes from the request
body). `stripe-webhook` deploys with `verify_jwt = false`; its auth is the Stripe signature.

## 1. `POST /functions/v1/stripe-webhook`   (caller: Stripe only)

- Request: raw Stripe event JSON; header `stripe-signature` REQUIRED.
- Verification: `stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET,
  undefined, Stripe.createSubtleCryptoProvider())` on the **raw** `await req.text()` (Deno —
  sync `constructEvent` is forbidden; it throws in this runtime).
- Responses: `200 {"received": true, "outcome": <billing_events.outcome>}` for every
  successfully verified event (including dedup replays and skips — Stripe must not retry those);
  `400` bad/missing signature; `500` only for genuine processing failures (Stripe should retry).
- Processing order (BINDING): verify → insert `billing_events` (`on conflict (event_id) do
  nothing`; conflict ⇒ `200 noop`) → resolve user (subscription/session `metadata.user_id`,
  else `stripe_customer_id` lookup) → normalize (`stripe.ts`) → state machine (`machine.ts`
  guards: stale / admin-wins) → service-role upsert of `entitlements` + update the event row's
  `outcome`/`user_id`.
- Subscribed events (exactly, per D8): `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `customer.subscription.paused`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.trial_will_end`.

## 2. `POST /functions/v1/billing-checkout`

- Request: `{ "plan": "monthly" | "yearly" }` (anything else → 400 `invalid_request`).
- Behavior: ensure the caller's `entitlements` row exists (defensive `ensure_entitlement`);
  get-or-create Stripe Customer (store `stripe_customer_id` via service role; customer metadata
  `user_id`); create Checkout Session:
  `mode='subscription'`, `line_items=[{price: STRIPE_PRICE_<PLAN>, quantity: 1}]`,
  `subscription_data.metadata.user_id`, `client_reference_id = user_id`,
  `success_url = APP_BASE_URL + '/settings?checkout=success'`,
  `cancel_url  = APP_BASE_URL + '/settings?checkout=cancelled'`,
  `allow_promotion_codes = true`.
- Response: `200 { "url": "<stripe-hosted checkout url>" }`. Client behavior: web navigates
  same-tab; iOS opens externally. **No trial params** — trials are app-level (D4); a lapsed
  user checking out pays immediately.
- Missing price/secret config → `503 not_configured`.

## 3. `POST /functions/v1/billing-portal`

- Request: empty body `{}`.
- Behavior: caller must have `stripe_customer_id`, else `409 no_billing_account`; create a
  Billing Portal session with `return_url = APP_BASE_URL + '/settings'`.
- Response: `200 { "url": "<portal url>" }`.

## 4. `GET /functions/v1/billing-plans`

- Request: no body.
- Behavior: retrieve the two configured Prices from Stripe; respond from a short in-function
  cache (60 s) to keep the paywall snappy.
- Response:
  ```json
  {
    "plans": {
      "monthly": { "amountCents": 0, "currency": "usd", "interval": "month" },
      "yearly":  { "amountCents": 0, "currency": "usd", "interval": "year" }
    }
  }
  ```
  (`amountCents` = Stripe `unit_amount`, integer cents — house convention.) Prices are NEVER
  hardcoded anywhere else (FR-011/SC-008); paywalls render exactly these amounts as `$X.XX`
  and show the calm unavailable state on `not_configured`/`provider_error`.

## Secrets / configuration (Supabase function secrets; operator-set, never committed)

| Name | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | checkout, portal, plans, webhook (subscription retrieve on `checkout_completed`) |
| `STRIPE_WEBHOOK_SECRET` | webhook |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | checkout, plans, webhook (price→plan mapping) |
| `APP_BASE_URL` | checkout, portal (redirect targets) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | injected by platform; service-role writes |

`supabase/config.toml` gains `[functions.stripe-webhook] verify_jwt = false` (the only function
with JWT verification off).

## Client invocation contract

Both clients call functions via their Supabase SDK (`functions.invoke` / `functions.invoke(_:options:)`)
so the user JWT rides along automatically. Timeouts surface as the generic calm failure copy;
clients never retry `billing-checkout` automatically (avoid duplicate sessions) but may freely
retry `billing-plans` and entitlement refetch.

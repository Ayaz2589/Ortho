# Quickstart: Subscription System (spec 018)

How to validate this feature, split by what a Linux sandbox can prove locally versus what only
the operator can run live. References: [data-model.md](./data-model.md),
[contracts/](./contracts/), [plan.md](./plan.md).

## 1. Local validation (sandbox-safe; no network)

Prereqs: Node 22 (`.nvmrc`); on Linux-arm64 the native Vitest/Next binaries (see 015 plan).

```bash
# Billing core — state machine, derivation, replay property, drift lock, literal vectors
cd services/billing && npm install && npm test && npx tsc --noEmit

# Regenerate the edge-function copy after ANY core change, then prove no drift
npm run sync:functions && npm test   # shared-sync.test.ts must stay green

# Web — full suite (baseline 731 + new specs), types
cd ../../web && npm test && npx tsc --noEmit

# Golden vectors — must be ZERO drift (this feature may not touch them; FR-030)
npm run gen:vectors && git diff --exit-code ../shared/test-vectors/
```

Expected: everything green; `git status` clean except intentional changes. The web suite covers:
trial-row bootstrap call, all five gate states (incl. never-paywall-on-load-failure), paywall
semantics/a11y, Settings row per state, i18n key parity ×5, and the mock-harness RLS contract
(client writes to `entitlements` are rejected by the PostgREST-faithful mocks).

iOS (post-021 reality; see tasks.md T046): the iOS app ships the WEB bundle via the Capacitor
shell — there is no native billing code to test. Billing parity is covered entirely by the web
suite (the gate literal vectors V01–V19 + digest lock in `web/test/entitlements.test.ts`), and
`.github/workflows/capacitor-ios-ci.yml` build-verifies the shell on every `web/**` push. The
frozen native app (`ios-ci.yml`, manual-trigger, build-only) predates spec 018 and has no paywall.

## 2. `[OPERATOR-PENDING]` — one-time live setup (networked machine)

Order matters. Everything here is idempotent / re-runnable.

1. **Migration**: `supabase db push` (or apply
   `supabase/migrations/20260716130000_subscription_entitlements.sql` via the SQL editor).
2. **Stripe objects** (test mode first): create Product "Ortho" with two recurring Prices
   (monthly, yearly) at chosen amounts; note the two `price_…` ids.
3. **Function secrets**:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… \
     STRIPE_PRICE_MONTHLY=price_… STRIPE_PRICE_YEARLY=price_… \
     APP_BASE_URL=https://<web-host>          # or http://localhost:3000 while web is undeployed
   ```
4. **Deploy functions**:
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy billing-checkout billing-portal billing-plans
   ```
5. **Stripe webhook endpoint**: Dashboard → Webhooks → add
   `https://brujhxmtzfgowimprueo.supabase.co/functions/v1/stripe-webhook`, subscribing EXACTLY
   the seven events in [contracts/billing-functions.md](./contracts/billing-functions.md) §1,
   and **pin the endpoint's API version to `2026-06-24.dahlia`** (the version every function
   client pins and the translator's fixtures model — an unpinned endpoint would emit whatever
   payload shape is newest at creation time); copy the signing secret into step 3's
   `STRIPE_WEBHOOK_SECRET` and re-set.
6. **Probe**: `cd web && OPERATOR=1 npx tsx scripts/ops/billing-probe.ts` — read-only; verifies migration
   applied (RPC exists, tables selectable as service role), all four functions respond, prices
   resolve. Fix anything red before proceeding.

## 3. `[OPERATOR-PENDING]` — live smoke (test mode)

`cd web && OPERATOR=1 SMOKE_EMAIL=<test-user email> npx tsx scripts/ops/billing-smoke.ts`
guides this; manual outline:

1. Sign in as a fresh test user (web) → confirm `entitlements` row appears
   (`trialing`, expiry ≈ +31d) and the app is fully usable.
2. SQL: backdate that row's `access_expires_at` to yesterday-minus-3-days → reload → paywall.
3. Subscribe monthly with card `4242 4242 4242 4242` → back in Settings → "Check again" →
   `active`, correct renewal date; `billing_events` shows `checkout.session.completed` +
   `invoice.paid` applied.
4. Portal: switch monthly → yearly; verify `plan` flips via `subscription_updated`.
5. Dunning: attach failing card `4000 0000 0000 0341`, advance/trigger a renewal failure (test
   clock or `stripe trigger invoice.payment_failed`) → status `past_due`, app still fully
   usable, calm Settings notice shows (FR-020/026).
6. Cancel in portal → access persists; after period end (test clock) → paywall returns.
7. **Replay check**: `stripe events resend <evt_id>` on an applied event → webhook 200s,
   `billing_events` outcome `noop`, entitlement row byte-identical (SC-007 live).
8. **Admin**: `update entitlements set status='admin', access_expires_at=null, source='operator'
   where user_id='<uuid>';` → that account never sees the paywall, Settings shows the admin row
   (US4). Grant this to the two real household accounts as desired.
9. **iOS pass** (the Capacitor-shell build — TestFlight or simulator; Supabase env is inlined
   at `next build` time, no `SupabaseConfig.swift` involved): expired test user → paywall →
   plan button opens Stripe checkout in the EXTERNAL browser (Capacitor cancels the non-app
   navigation and hands it to the system — T046) → pay → return to the app → "Check again" →
   in. Foregrounding also re-derives the gate on its own (merge review). Do NOT use the frozen
   native app for this pass — it predates spec 018 and is intentionally ungated.
10. Repeat 2–3 in **live mode** with a real card + real prices before announcing.

## 4. Rollout notes

- Existing users are untouched at deploy: their entitlement row (fresh 31-day month) is created
  by their first post-rollout bootstrap (D4). No backfill script needed; nothing breaks if the
  migration deploys days before the clients ship.
- **Merging this branch to main IS the client ship** — Vercel auto-deploys `main` to
  production (docs/web.md §6); the runbook's ordering can no longer enforce "migration before
  clients". The client is safe either way (merge review): a MISSING `ensure_entitlement` RPC
  (PostgREST `PGRST202`, i.e. an unmigrated backend) fails **open** — null gate, no paywall,
  app fully usable, Settings billing row shows its calm unavailable state — while any OTHER
  entitlement failure still routes to the recovery path (FR-008). Complete §2 to light the
  feature up; nothing breaks if that happens days after the merge.
- Price changes later: edit the Stripe Prices (or create new ones and update the two secrets)
  — paywall reflects them with no app release (SC-008).
- Kill switch: granting `status='admin'` to affected users is the calm emergency lever if
  billing misbehaves in production.

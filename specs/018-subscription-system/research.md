# Research: Subscription System (spec 018)

**Date**: 2026-07-05. Sources: a 104-agent deep-research run (22 sources fetched, 59 claims
extracted, 25 adversarially verified 3-vote each → 22 confirmed / 3 refuted) plus a full codebase
reconnaissance. Confidence labels below reflect that verification. Where a sub-question produced
**no surviving verified claim**, it is listed under "Explicitly unverified" — statements there
must not be treated as researched fact.

## D1 — Billing provider surface: Stripe Checkout + Customer Portal

**Decision**: Web subscribes via Stripe Checkout (subscription mode) and self-manages via the
Stripe Customer Portal. No Payment Links, no embedded Elements, no in-app payment UI.

**Rationale** (verified, high confidence): Stripe's own docs and the canonical Next.js
subscription starters use exactly this surface; Checkout + Portal outsources card entry, SCA/3DS,
plan switching, cancellation, and dunning UI to Stripe-hosted pages — the least code and the least
PCI surface for a solo operator. Portal covers FR-013/014 (card update, monthly↔yearly switch,
cancel-at-period-end) with zero custom UI.

**Alternatives considered**: Payment Links (no programmatic user↔session linkage — attribution
would depend on fragile `client_reference_id` passing; a verified RevenueCat doc even reports that
route breaking); Elements (custom payment UI = PCI/SCA surface for no benefit at this scale).

## D2 — Where the server code lives: Supabase Edge Functions

**Decision**: All four endpoints (`stripe-webhook`, `billing-checkout`, `billing-portal`,
`billing-plans`) are Supabase Edge Functions attached to the existing hosted project.

**Rationale**: The repo has *no* server-side code and no web deployment story (recon: no
`web/app/api/`, no documented web host; the only server-ish code is `proxy.ts`). Edge functions
sit next to the database, hold secrets in Supabase function secrets, serve **both** surfaces
symmetrically (iOS calls them directly — critical since iOS has no web host to lean on), and the
Stripe-webhook-in-an-edge-function pattern is Supabase's own documented canonical example
(verified). **Deno gotchas locked in** (verified, incl. an empirical reproduction): deploy the
webhook with `verify_jwt = false` (Stripe's signature is the auth) and verify with
`stripe.webhooks.constructEventAsync()` + `Stripe.createSubtleCryptoProvider()` on the **raw**
`await req.text()` — the synchronous `constructEvent()` throws in Deno.

**Alternatives considered**: Next.js API routes (couples billing to a web deployment that doesn't
exist; single-surface); a standalone service (operational overkill for a solo dev; contradicts
minimal-ops goal — extraction later is *adding tenancy*, not running a server now).

## D3 — Entitlement source of truth: one custom Postgres table (skip RevenueCat)

**Decision**: One `entitlements` table (service-role-write-only) governed by an
`access_expires_at` timestamp with derivation-time leeway; append-only `billing_events` for
idempotency/audit. RevenueCat is not used. The Stripe Sync Engine (first-party Supabase↔Stripe
integration since Dec 2025) is noted as an optional operator add-on for debugging, **not** part of
the entitlement path.

**Rationale** (verified): Storing a per-customer access-expiration timestamp extended on payment
success "plus a day or two for leeway" is Stripe's own documented first-party entitlement pattern.
RevenueCat's Stripe integration is verified **not** zero-server-code (every Stripe purchase must be
attributed via a server-side `fetch_token` POST; its recommended backend sync is still
webhook-plus-REST plumbing) — so it would not remove the server surface we must build anyway,
while inserting a third vendor into the entitlement path and undermining the owner's
own-the-payments-core goal. Its 2026 pricing could not be verified at all.

**Alternatives considered**: RevenueCat as unifier (rejected above — value peaks with multiple
native app stores, which v1 deliberately avoids); Stripe's newer first-party Entitlements API
(complements rather than replaces the custom table; adds a Stripe-side dependency for state we
must mirror locally regardless); Sync Engine as source of truth (read-only replication — cannot
create checkout/portal sessions, and couples truth to Stripe schema).

## D4 — Trial mechanics: app-level, via a SECURITY DEFINER RPC

**Decision**: The 31-day trial is administered by Ortho, not Stripe. A new idempotent
`ensure_entitlement()` SECURITY DEFINER RPC inserts the caller's entitlement row
(`status='trialing'`, `access_expires_at = now() + 31 days`) **only if absent**, and both clients
call it during bootstrap. No Stripe customer/object exists until a user first opens checkout.

**Rationale**: Keeps signup friction at zero (FR-004: no card, no plan step), keeps trial logic in
the reusable core, covers **existing** users uniformly (their row is created on first post-rollout
bootstrap — spec assumption), and satisfies FR-001/002 (server-recorded, exactly once, reset-proof:
insert-if-absent means reinstalls/re-sign-ins are no-ops). Stripe's no-card trials
(`trial_settings.end_behavior.missing_payment_method`, verified first-class) exist but would
require a checkout session at signup — friction and a Stripe object for every user who never pays.
The RPC follows the repo's only existing trusted-write precedent (`accept_invite`).

**Alternatives considered**: Postgres trigger on `public.users` insert (doesn't cover existing
users; trigger + RPC would be two mechanisms where one suffices); Stripe-administered trials
(rejected above); client-side insert with RLS (violates FR-017 — a client that can write
`trialing` once can be coaxed into writing it again).

## D5 — Admin bypass: `status='admin'` in the entitlements table

**Decision**: Admin is a per-user value of the entitlement source of truth itself
(`entitlements.status = 'admin'`, `access_expires_at = NULL` = never expires), granted by the
operator via a runbook SQL step. No in-app grant path (FR-023). The state machine never
downgrades an admin row on provider events.

**Rationale**: FR-024 wants admin enforced by the same server-side source of truth — making it a
*state of that record* is the most direct reading: one fetch decides everything, no second system,
trivially auditable. The verified "official" Supabase mechanism (Custom Access Token Auth Hook
injecting JWT role claims, checked via `auth.jwt()`) is the right tool **when RLS policies must
branch on role** — but v1 does not RLS-gate data by subscription (see D9), the hook is
dashboard-labeled **Beta**, requires hosted-dashboard configuration this sandbox can't perform or
verify, and introduces claim-staleness (revoking admin wouldn't bite until token refresh).
Recorded as the designated upgrade path if subscription-aware RLS ever lands.

**Alternatives considered**: Auth Hook JWT claim (deferred, above); `ALTER TYPE role ADD VALUE
'admin'` on the household-members enum (wrong axis — that enum is *household* role; admin is a
person-level product concept; the v1 schema comment deferring 'admin' anticipated policy branches
we're not building).

## D6 — iOS purchase path: link-out to the same web checkout (no StoreKit in v1)

**Decision**: The iOS paywall's plan buttons open the Stripe Checkout URL externally (Safari).
The app never collects payment. A provider-adapter seam (normalized events into the same state
machine; `source` column on entitlements) is preserved so StoreKit 2 + App Store Server
Notifications can be added later as a second provider without touching the source of truth.

**Rationale** (verified, high confidence, with an explicit risk): Since May 2025 (court-compelled;
Ninth Circuit affirmed Dec 2025; SCOTUS cert granted June 2026 on the commission question),
US-storefront apps may link users to their own website to buy digital subscriptions — no
entitlement token, no scare screens, currently zero Apple commission. One billing stack for both
surfaces removes receipt validation, ASN ingestion, and cross-provider reconciliation from v1.
**Risk accepted by owner** (spec Assumptions): the regime is mid-litigation and could regain a
commission or conditions; and *whether an app may offer ONLY the external link with no IAP
alongside* was **not settled by any surviving claim** — App Review friction is possible. The seam
(D3 normalized-event design) is the hedge: if forced, StoreKit lands as an adapter, not a rewrite.

**Alternatives considered**: StoreKit 2 direct in v1 (the durable mainstream path, but adds a
second billing provider, ASN v2 JWS ingestion, and Apple commission for a two-person-household app
whose iOS users can realistically use a browser); RevenueCat to paper over both (rejected in D3).

## D7 — Package boundary & deployment of shared logic

**Decision**: `services/billing/` is a root-level, dependency-free TS package (the extraction
unit). Edge functions consume it via a **committed byte-copy** in
`supabase/functions/_shared/billing/`, produced by a sync script and locked by a
`shared-sync.test.ts` byte-identity test. Client-side gate derivation is a **hand-mirrored
TS↔Swift pair** (`web/lib/entitlements.ts` mirrors core `derive.ts`; iOS
`Shared/EntitlementLogic.swift` mirrors both), locked by identical literal vectors recorded in
`contracts/entitlement-state.md` — the 017 `InviteCodec` mechanism, deliberately not a golden
vector (no money/date engine involved; FR-030).

**Rationale**: Supabase's documented shareable-code location is `functions/_shared/`;
out-of-tree relative imports at deploy time are unverifiable from this sandbox (no `supabase
functions deploy` possible) — a broken deploy would surface only on the operator's machine. The
repo already trusts generate-then-assert copies (golden vectors, i18n catalog parity), so the
drift test makes the copy safe. Swift cannot import TS, so mirroring + literal lock is the proven
house answer.

**Alternatives considered**: core living in `functions/_shared/` with `services/billing`
re-exporting (inverts the extraction boundary — the reusable package would import *from* Ortho's
supabase tree); npm-publishing the core now (publishing infrastructure for one consumer;
extraction is the future, not the present); web importing the core cross-package for derivation
(Next 16 external-dir transpilation is riskier than a 40-line mirrored pure function under literal
lock).

## D8 — Lifecycle policy (the rules that bite)

**Decision**: Entitlement is governed by `access_expires_at` + constants applied at derivation:
`LEEWAY_HOURS = 48` (active/trialing grace for late renewals & missed events),
`DUNNING_GRACE_DAYS = 14` (access retained in `past_due` beyond expiry). Stored status stays
provider-shaped (`trialing | active | past_due | paused | unpaid | canceled | admin`); the gate
fact is derived. `invoice.payment_failed` → `past_due`, never a lapse by itself (FR-020). Terminal
events are never assumed: expiry + leeway lapses correctly even if `customer.subscription.deleted`
never arrives (FR-019). `canceled` retains access until `access_expires_at` (paid-through,
FR-014). Events are deduped by unique `event_id` insert-first; out-of-order events are ignored via
a `last_event_at` (provider `created`) guard; replay of any duplicated/reordered stream must
converge (SC-007, property-tested).

**Rationale** (verified): `invoice.payment_failed` fires on initial failure **and every retry**;
Smart Retries can run up to ~2 months and its end-of-retries outcome is **merchant-configurable**
(cancel / mark unpaid / leave as-is) — so revoking on first failure or waiting for a terminal
event are both verified failure modes. 14 days matches Stripe's recommended default retry window
(8 tries / 2 weeks); if the operator configures longer retries, a user could lapse mid-dunning at
expiry+14d — accepted (resubscribe path exists) and documented in the runbook. Webhook redelivery
makes idempotency non-optional.

**Event list** (derived from Stripe primary docs — the popular template's 10-event list was
**refuted** in verification; do not copy it): `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.paused`, `invoice.paid`, `invoice.payment_failed`, plus
`customer.subscription.trial_will_end` (subscribed but log-only in v1 — we run no Stripe trials).

## D9 — Trust model: shell gating in v1, no subscription-aware RLS

**Decision**: The paywall is enforced by (a) unforgeable entitlement state (FR-017) and (b) client
shell gating — existing data-table RLS is untouched. A lapsed user driving a raw PostgREST client
with valid credentials could still read/write their own data; they cannot fabricate entitlement.

**Rationale**: This matches the app's existing trust architecture exactly (clients are trusted
renderers; RLS guards *who owns what*, not *product features*). Wiring `is_entitled()` into every
table policy would touch dozens of policies (violating the no-existing-schema-changes constraint),
add a per-request subquery everywhere, and buy nothing against the actual threat (a paying-user
product, not an adversarial API market). Documented as a known limitation in the spec Assumptions
and PARITY.md; D5's auth-hook path is the designated hardening route if it ever matters.

## D10 — Prices & plan display

**Decision**: Prices exist **only** in Stripe (two Prices under one Product; IDs configured as
function secrets `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`). The paywall fetches display
amounts live via `billing-plans` (authenticated edge function querying those price IDs) and
renders plain `$X.XX` / month-or-year rows; if the lookup fails, a calm "plans are unavailable
right now" state with retry (spec edge case) — never broken price text, never a hardcoded amount
(FR-011, SC-008).

## Explicitly unverified (do not treat as researched fact)

No claims on these survived adversarial verification; anything stated about them in code comments
or docs must be marked as unverified: Apple's current native-IAP commission rates (Small Business
Program 15%, year-2 rates); whether US apps may ship external-link-**only** with no IAP; EU DMA
terms; App Store Server Notifications V2 → Deno JWS verification mechanics; StoreKit offer codes /
family sharing; Stripe **and** StoreKit monthly↔yearly proration specifics; RevenueCat 2026
pricing/free tier. None block v1 (US-only link-out, no Stripe trials, portal-managed plan
switches); the proration UX users see is whatever the Stripe Portal does, which is acceptable for
v1 and verifiable by the operator smoke run.

## Codebase facts the design leans on (recon, 2026-07-05)

- No server-side code exists: no `web/app/api/`, no `supabase/functions/`; `proxy.ts` only checks
  `supabase.auth.getUser()` and redirects — the paywall must NOT be wired there (FR-008: load
  failure ≠ lapse; proxy has no entitlement context and would conflate them).
- Blocking-gate slots already exist and are the mount points: web `app/(app)/layout.tsx` Shell
  (loading skeleton / error banner branch); iOS `Ortho_iOSApp.swift` root `switch appState.authPhase`
  + `bootstrapDidFail → BootstrapRecoveryView`.
- Bootstrap sequences (web `store.tsx` `runBootstrap`; iOS `AppState.bootstrapUserSession`) both
  have a natural point to add `ensure_entitlement` + fetch in parallel with `loadAll`.
- `role` enum is household-scoped (`owner|member`) with a v1 comment deferring 'admin' — D5
  deliberately does not touch it.
- Migration conventions: `YYYYMMDDHHMMSS_name.sql`, enums → tables → indexes → helpers → RLS →
  policies → RPCs; SECURITY DEFINER precedent: `accept_invite`, `is_household_member`.
- Settings sections are ordered identically on both surfaces (Household, Budgets, Cards, Currency,
  Language, Appearance, Account) — the subscription row lands after Cards on both (spec US7).
- i18n: web = 5 hand-written catalogs keyed by English source; iOS = `Localizable.xcstrings`;
  catalog-parity is CI-checked. ~30 new keys expected.
- Web CI (`web-ci.yml`) triggers on `web/**` + `shared/test-vectors/**` only — needs `services/**`
  and `supabase/functions/**` added, plus a `services/billing` install+test step.
- 017 lessons imported at design time: `aria-live`/`role="status"` on async failure copy;
  `accessibilityValue` (not label-replacement) for dynamic values; ≥44px touch targets on all new
  controls; error surfaces must be reachable *behind* gates (the paywall renders its own failure
  copy inline).

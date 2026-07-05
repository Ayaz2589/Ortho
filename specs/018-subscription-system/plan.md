# Implementation Plan: Subscription System — Free Month, Paid Plans, Admin Bypass

**Branch**: `018-subscription-system` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-subscription-system/spec.md`

## Summary

Every user gets a server-recorded **31-day free month** starting at their first bootstrap after
rollout (created by a new idempotent `ensure_entitlement()` SECURITY DEFINER RPC — clients can
*trigger* trial creation but can never write entitlement state). After it ends, an unentitled user
hits a **calm, blocking paywall** on both surfaces (web: a new gate in the `(app)` Shell, exactly
where the loading/error gates already live; iOS: a full-screen gate in the `Ortho_iOSApp` root
switch, the `BootstrapRecoveryView` shape). Subscribing happens on **Stripe Checkout** (monthly or
yearly, prices live only in Stripe), managed later via the **Stripe Customer Portal**; iOS links
out to the same checkout (US-storefront rules; no StoreKit in v1, provider-adapter seam preserved).
Entitlement truth is **one service-role-only Postgres table** (`entitlements`, keyed by
`access_expires_at` + derivation-time leeway) fed by **Ortho's first server-side code**: four
Supabase Edge Functions (`stripe-webhook` with signature verification + idempotent event
processing via an append-only `billing_events` table; authenticated `billing-checkout`,
`billing-portal`, `billing-plans`). The event→entitlement state machine lives in an
**extraction-ready `services/billing/` package** — pure runtime-agnostic TypeScript, zero
Ortho/Supabase imports, its own Vitest suite — sync-copied into `supabase/functions/_shared/`
with a byte-identical drift test (the golden-vector ethos applied to deployment). Clients derive
one gate fact (admin | trialing | active | grace | lapsed) from the row via a **hand-mirrored
TS ↔ Swift derivation pair locked by identical literal tests** (the 017 `InviteCodec` pattern —
deliberately *not* a golden vector). Admin = `status='admin'` in the same table, operator-granted
by runbook SQL. Everything requiring live Stripe/hosted Supabase ships as `[OPERATOR-PENDING]`
scripts + runbook (017 pattern); the branch is merge-safe with those pending.

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 (web + `services/billing`); Deno (Supabase Edge
Functions runtime; function files are thin adapters); Swift 5.9 / SwiftUI (iOS, iOS 26); SQL
(Postgres 15, Supabase migrations).

**Primary Dependencies**: Web — Next.js 16 (modified; middleware is `proxy.ts`), `@supabase/ssr` +
`@supabase/supabase-js`, Vitest 3, Tailwind v4. Edge functions — `npm:stripe` (v22+, used *only*
inside `supabase/functions/`; **must** use `constructEventAsync` + `createSubtleCryptoProvider` —
sync `constructEvent` throws in Deno) and `jsr:@supabase/supabase-js`. `services/billing` — **zero
runtime dependencies** (pure TS; Vitest as devDep only). iOS — SwiftUI + supabase-swift (no new
package; checkout opens externally via `UIApplication.open`).

**Storage**: Two **new** tables — `entitlements` (one row per user; service-role-write-only;
client `SELECT` own row via RLS) and `billing_events` (append-only audit/idempotency; **no**
client policies) — plus two new enums and one SECURITY DEFINER RPC (`ensure_entitlement`).
**Zero changes to existing tables** (FR-030). New migration follows house ordering
(enums → tables → indexes → helpers → RLS enable → policies → RPCs).

**Testing**: TDD throughout (Constitution VI). `services/billing` — its own Vitest suite: every
state transition, idempotency/dedup, out-of-order convergence (SC-007 replay property), the
`_shared/` sync drift lock, and the cross-surface literal vectors. Web — Vitest behavior tests
(bootstrap entitlement flow, gate states incl. never-paywall-on-load-failure, paywall a11y +
semantics, Settings row per state, i18n key parity ×5) against the existing PostgREST-faithful
mock harness (extended for `entitlements`, `rpc`, `functions.invoke`). iOS — XCTest literal-vector
suite for the Swift derivation mirror + gating unit tests; compile/UI feedback via
`.github/workflows/ios-ci.yml` (macOS runner) and the `-uiDemo` screenshot artifact. Web CI gains
`services/**` path trigger + a `services/billing` test step.

**Target Platform**: iOS 26 app; modern browsers (three web breakpoints); Supabase hosted project
`brujhxmtzfgowimprueo` for the Postgres + Edge Functions deploy (operator-executed).

**Project Type**: Monorepo — mobile + web over one shared Supabase backend, plus (new with this
feature) a root `services/` workspace for extraction-ready backend packages and the repo's first
`supabase/functions/`. Outside the golden-vector harness (no money/date-engine changes); the new
cross-surface derivation logic is locked by the lighter identical-literal-test mechanism instead.

**Performance Goals**: Bootstrap adds one RPC + one single-row select, issued in parallel with the
existing `loadAll()` fan-out — no perceptible startup cost. Paywall decision is pure local
derivation (no network). Post-payment entitlement flip visible within minutes via webhook, and on
demand via "Check again" (SC-003 ≤ 5 min).

**Constraints**: Linux sandbox **cannot reach Stripe or hosted Supabase** — all live steps are
`[OPERATOR-PENDING]` scripts + runbook; nothing in CI or tests may hit the network. iOS is
CI-verified only (batch all iOS changes into one push). Public repo — no secrets committed;
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / price IDs live in Supabase function secrets,
never in client env. `stripe-webhook` deploys with `verify_jwt=false` (Stripe signature IS the
auth) — recorded in `supabase/config.toml`. Linux-arm64 sandboxes need the native Vitest/Next
binaries preinstalled (see 015 plan). Never run a production build while a shared dev server runs.

**Scale/Scope**: 1 migration (2 enums, 2 tables, 1 RPC); 1 new root package (`services/billing`,
~5 source modules + suite); 4 edge functions + `_shared/` sync; web — ~2 new lib modules,
1 paywall component, 1 Settings section, store bootstrap branch, ~30 i18n keys ×5 catalogs +
mock-harness extension; iOS — ~1 API struct, 1 derivation mirror, 1 paywall view, 1 Settings
section, AppState wiring, ~30 xcstrings keys; 2 operator scripts + runbook; docs (index/web/
supabase/ios) + PARITY.md rows. Web suite grows from 731; no golden-vector changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ Pass | Paywall + Settings rows reuse existing tokens and primitives (web `ReadingColumn`/section cards/hairlines; iOS `AppTheme` + Settings row language). No new colors; plan prices render as plain tabular `$X.XX`. |
| II. Calm Over Dense (NON-NEGOTIABLE) | ✅ Pass | Paywall is one quiet screen: headline ("Your free month has ended"), two plan rows, check-again, quiet sign-out. No urgency banners, no strikethrough pricing, no red. Dunning notice is a Settings-level hairline row, never a takeover. |
| III. Right Form Factor Per Canvas | ✅ Pass | Web: centered, width-capped gate inside the existing Shell (same slot as loading/error states). iOS: full-screen gate in the root switch (the `BootstrapRecoveryView` shape). Checkout/portal are the provider's hosted pages — no in-app payment UI to design. |
| IV. Plainspoken Voice & Money Formatting | ✅ Pass | "1 month free", "Your free month has ended", "Renews March 3". Prices `$X.XX`, tabular, never abbreviated; no "Save 25%" upsell framing (spec FR-028). |
| V. Accessible & Interaction-Complete | ✅ Pass | Paywall controls are real buttons, keyboard-reachable, sand focus ring, ≥44px targets; status changes announced via `role="status"`/`aria-live` (a 017-review lesson applied from the start); iOS uses `accessibilityValue` for dynamic status text (another 017 lesson). |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ Pass | Failing tests precede code at every layer: core state machine (including the SC-007 replay/reorder property), client derivation literal vectors on both surfaces, gate behavior, Settings states, i18n parity. No money/date engine is touched; golden vectors untouched (FR-030) — justified because entitlement logic is policy, not finance math; the mirrored derivation gets the literal-test lock instead. |

**Result**: PASS pre-design. One deliberate divergence recorded for PARITY.md (not a constitution
violation): the two surfaces reach checkout differently (web: same-tab redirect to Stripe; iOS:
external browser link-out) — form-factor-appropriate, same hosted checkout, same entitlement row.

**Post-design re-check (after Phase 1)**: PASS — design artifacts introduce no new violations; no
Complexity Tracking entries required. The one structural novelty (first server-side code) is an
architecture addition the constitution doesn't govern; its risk is contained by the extraction
boundary, the drift lock, and the operator runbook.

## Project Structure

### Documentation (this feature)

```text
specs/018-subscription-system/
├── plan.md              # This file
├── research.md          # Phase 0 — consolidated verified research + load-bearing decisions
├── data-model.md        # Phase 1 — enums, tables, RPC, state machine, derivation rules
├── quickstart.md        # Phase 1 — local validation + [OPERATOR-PENDING] runbook
├── contracts/
│   ├── entitlement-state.md   # Cross-surface derivation contract + literal test vectors (TS↔Swift lock)
│   ├── billing-functions.md   # HTTP contracts for the four edge functions
│   └── stripe-events.md       # Event → transition mapping, idempotency & ordering rules
├── checklists/
│   └── requirements.md  # Spec quality checklist (done)
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
services/billing/                        # NEW — extraction-ready billing core (owner mandate)
├── package.json                         # name @ortho/billing-core; zero runtime deps; vitest devDep
├── tsconfig.json                        # strict; no DOM/Deno/Node libs — runtime-agnostic
├── README.md                            # the extraction contract: what this package may/may not import
├── src/
│   ├── index.ts                         # public surface re-exports
│   ├── states.ts                        # EntitlementStatus/GateState types + LEEWAY_HOURS=48, DUNNING_GRACE_DAYS=14, TRIAL_DAYS=31
│   ├── derive.ts                        # deriveGateState(row, now) — the client-mirrored pure fn
│   ├── machine.ts                       # applyBillingEvent(entitlement, normalizedEvent) — the server state machine
│   ├── normalize.ts                     # NormalizedBillingEvent shape + provider-agnostic guards (ordering, admin-wins)
│   └── stripe.ts                        # Stripe payload → NormalizedBillingEvent translator (pure; payloads in, no SDK)
└── test/
    ├── derive.test.ts                   # every derivation branch + the shared literal vectors
    ├── machine.test.ts                  # every transition; admin-wins; never-downgrade-on-first-failure
    ├── replay.test.ts                   # SC-007: duplicate + reordered streams converge
    ├── stripe-translate.test.ts         # fixture payloads → normalized events
    └── shared-sync.test.ts              # drift lock: src/ ≡ supabase/functions/_shared/billing/ byte-identical

supabase/
├── config.toml                          # + [functions.stripe-webhook] verify_jwt = false
├── migrations/
│   └── 20260705130000_subscription_entitlements.sql   # NEW — enums, entitlements, billing_events, RLS, ensure_entitlement()
└── functions/                           # NEW — repo's first edge functions (thin Deno adapters)
    ├── _shared/billing/                 # generated byte-copy of services/billing/src (sync script + drift test)
    ├── stripe-webhook/index.ts          # sig verify (constructEventAsync) → dedup insert → machine → service-role upsert
    ├── billing-checkout/index.ts        # auth'd; {plan} → ensure Stripe customer → Checkout session → {url}
    ├── billing-portal/index.ts          # auth'd; stored customer → Portal session → {url}
    └── billing-plans/index.ts           # auth'd; live price lookup → {monthly:{amountCents,..}, yearly:{..}}

web/
├── lib/
│   ├── entitlements.ts                  # NEW — mirrors services/billing derive.ts (client copy; literal-locked)
│   ├── billing.ts                       # NEW — functions.invoke wrappers (checkout/portal/plans) + ensure/fetch entitlement
│   └── store.tsx                        # bootstrap: ensure_entitlement RPC + entitlement fetch (parallel with loadAll); state + refreshEntitlement()
├── components/
│   ├── Paywall.tsx                      # NEW — the blocking gate content (plans, check again, quiet sign out)
│   └── settings/SubscriptionSection.tsx # NEW — status row + subscribe/manage action + dunning hint
├── app/(app)/layout.tsx                 # Shell: gate === 'lapsed' → <Paywall/> (after load, before children)
├── app/(app)/settings/page.tsx          # mount SubscriptionSection after Cards
├── lib/i18n/{bn,es,ja,zh,ko}.ts         # ~30 new keys each
├── scripts/ops/
│   ├── billing-probe.ts                 # [OPERATOR-PENDING] read-only: migration applied? functions live? prices configured?
│   └── billing-smoke.ts                 # [OPERATOR-PENDING] guided test-mode checkout→webhook→flip verification
└── test/                                # new specs + mock-harness extension (entitlements table, rpc, functions.invoke)

iOS/Ortho-iOS/
├── Shared/EntitlementLogic.swift        # NEW — Swift mirror of derive.ts (identical literal tests)
├── Services/EntitlementsAPI.swift       # NEW — ensure_entitlement RPC, select own row, invoke checkout/portal/plans
├── App/AppState.swift                   # entitlement state + refresh; bootstrap wiring; gate fact
├── App/Ortho_iOSApp.swift               # root switch: lapsed → PaywallView (BootstrapRecoveryView shape)
├── Features/Paywall/PaywallView.swift   # NEW — plans (from billing-plans), link-out, check again, quiet sign out
├── Features/Settings/SettingsView.swift # subscription section after Cards (+ SubscriptionSectionView.swift NEW)
├── Localizable.xcstrings                # ~30 new keys ×6 locales
└── Ortho-iOSTests/EntitlementLogicTests.swift  # NEW — the shared literal vectors

.github/workflows/web-ci.yml             # + services/** , supabase/functions/** path triggers; + services/billing test step
```

**Structure Decision**: The billing core is a **root-level package** (`services/billing/`), not a
`web/lib` module, because extraction to its own repo is an owner requirement — the package boundary
(own `package.json`, no upward imports) is the enforcement mechanism. Edge functions cannot safely
import outside `supabase/functions/` at deploy time, so the core is **sync-copied** into
`functions/_shared/billing/` by a script and locked byte-identical by a test — the same
generated-then-asserted discipline the repo already trusts for golden vectors and i18n catalog
parity. Client-side derivation is a **hand-mirrored TS↔Swift pair** (web copies `derive.ts`; iOS
mirrors it in Swift) locked by the shared literal vectors in `contracts/entitlement-state.md`,
exactly like 017's `InviteCodec` — mirroring is unavoidable (Swift can't import TS) and the repo
has a proven lock for it.

## Complexity Tracking

No constitution violations to justify. Two scope-level complexity notes, accepted deliberately:

| Addition | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| First server-side code (4 edge functions) | Stripe webhooks require a server endpoint; entitlement writes must be unforgeable by clients (FR-017/018) | Next.js API routes would couple billing to the web host (which has no deployment story) and serve only one surface; client-written entitlements would make the paywall decorative |
| `_shared/` sync-copy + drift test | Deploy-time bundling of out-of-tree imports is unverifiable from this sandbox; extraction mandate forbids the core living inside `supabase/` | A single source location either breaks extraction (core buried in supabase/) or risks a broken deploy the operator only discovers live |

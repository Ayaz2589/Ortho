# Tasks: Subscription System — Free Month, Paid Plans, Admin Bypass

**Input**: Design documents from `specs/018-subscription-system/` (plan.md, spec.md,
research.md, data-model.md, contracts/, quickstart.md)

**Tests**: TDD is owner-mandated (and Constitution VI). Every behavior task is preceded by its
failing-test task; a test task is done when the test exists AND fails for the right reason; an
implementation task is done when its tests pass with the rest of the suite green.

**Conventions**: web suite baseline 731 green + `npx tsc --noEmit` clean; golden vectors
zero-drift at all times (FR-030). iOS cannot compile locally — write iOS tasks to completion,
batch into ONE push, verify via `ios-ci.yml` (task T045). `[P]` = parallelizable (different
files, no incomplete dependency).

## Phase 1: Setup

- [x] T001 Scaffold `services/billing/` package: `package.json` (name `@ortho/billing-core`, private, zero runtime deps, vitest devDep, scripts `test`/`sync:functions`), strict runtime-agnostic `tsconfig.json` (no DOM/Node/Deno libs), `README.md` stating the extraction contract (may import NOTHING from web/, iOS/, supabase/), empty `src/index.ts`; `npm install` runs clean.
- [x] T002 [P] Extend `.github/workflows/web-ci.yml`: add `services/**` and `supabase/functions/**` to `on.push.paths`/`on.pull_request.paths`; add a job step `cd services/billing && npm ci && npm test && npx tsc --noEmit` before the web steps.

## Phase 2: Foundational (blocks all user stories)

**Core derivation + literal lock (contracts/entitlement-state.md)**

- [x] T003 Write failing tests `services/billing/test/derive.test.ts`: all 19 literal vectors V01–V19 embedded verbatim, the canonical-serialization digest assertion (`88715c83…a48e2`), plus per-branch boundary cases (strict `<` at both window edges).
- [x] T004 Implement `services/billing/src/states.ts` (types + `LEEWAY_HOURS=48`, `DUNNING_GRACE_DAYS=14`, `TRIAL_DAYS=31`) and `src/derive.ts` (`deriveGateState(row, nowIso)`) until T003 passes; export from `src/index.ts`.

**Core state machine (contracts/stripe-events.md)**

- [x] T005 [P] Write failing tests `services/billing/test/machine.test.ts`: every transition row of the mapping table; guard order (unmatched → stale → admin-wins); `payment_failed` iff active/past_due else noop; `subscription_deleted` leaves expiry; admin row receives full subscribe-fail-cancel stream untouched except reference ids.
- [x] T006 [P] Write failing tests `services/billing/test/replay.test.ts` (SC-007): property-style — shuffled + duplicated fixture streams (incl. the four mandated fixtures in the contract) converge to the clean-stream row.
- [x] T007 [P] Write failing tests `services/billing/test/stripe-translate.test.ts`: fixture Stripe payloads (checkout.session.completed, invoice.paid with line periods, invoice.payment_failed, subscription.updated per status incl. incomplete→noop, deleted, paused, trial_will_end, unknown type) → exact `NormalizedBillingEvent`s; price-id→plan mapping; user resolution order (metadata → client_reference_id → customer lookup input).
- [x] T008 Implement `services/billing/src/normalize.ts` (NormalizedBillingEvent + guard pipeline), `src/machine.ts` (`applyBillingEvent`), `src/stripe.ts` (pure payload translator, price-id map passed in) until T005–T007 pass.

**Deployment copy + drift lock (plan D7)**

- [x] T009 Implement `services/billing/scripts/sync-to-functions.mjs` (`npm run sync:functions`: byte-copy `src/*.ts` → `supabase/functions/_shared/billing/`) + failing-then-green `test/shared-sync.test.ts` asserting byte-identity of every file; run the sync, commit the copy.

**Database (data-model.md §1–4)**

- [x] T010 Write `supabase/migrations/20260705130000_subscription_entitlements.sql`: enums `entitlement_status`+`billing_plan`; `entitlements` + `billing_events` exactly per data-model; RLS enable both; single `entitlements_select_own` policy; zero policies on `billing_events`; `ensure_entitlement()` SECURITY DEFINER RPC (insert-if-absent, `now()+interval '31 days'`, returns row) granted to `authenticated` only; house section ordering + comments.

**Client mirrors + harness**

- [x] T011 [P] Write failing web tests `web/test/entitlements.test.ts` (same 19 vectors + digest) then implement mirror `web/lib/entitlements.ts` (copy of derive.ts + constants; no import from services/ — plan D7).
- [x] T012 [P] Implement iOS mirror `iOS/Ortho-iOS/Shared/EntitlementLogic.swift` + `iOS/Ortho-iOS/Ortho-iOSTests/EntitlementLogicTests.swift` (same 19 vectors + digest over the canonical serialization; ISO-8601 parsing via fixed formatter; injected `now`).
- [x] T013 [P] Extend the web mock harness (`web/test/helpers/`): `entitlements` table with PostgREST-faithful behavior (select-own only; INSERT/UPDATE/DELETE from client role rejected like RLS), `rpc('ensure_entitlement')` fake (insert-if-absent semantics, returns row), `functions.invoke` fake (`billing-checkout`/`billing-portal`/`billing-plans` with configurable responses/failures). Contract test: client-role writes to entitlements are refused.

**Checkpoint**: core green + migration written + mirrors locked — every story below is unblocked.

## Phase 3: User Story 1 — A free month starts automatically (P1) 🎯 MVP

**Goal**: entitlement row exists from first bootstrap; app unchanged during trial; state exposed.
**Independent test**: fresh mock user boots → `ensure_entitlement` called once → gate `trialing`; second boot doesn't reset; load-failure routes to recovery, never paywall.

- [x] T014 [US1] Write failing tests in `web/test/entitlement-bootstrap.test.tsx`: bootstrap invokes `rpc('ensure_entitlement')` and stores the returned row; gate derived `trialing` for fresh user; re-boot idempotent (no second insert, expiry unchanged); RPC/network failure ⇒ `bootstrapFailed` recovery path and NOT the paywall (FR-008); `refreshEntitlement()` refetches and re-derives.
- [x] T015 [US1] Implement in `web/lib/store.tsx`: `entitlement` + derived `gateState` in AppState; `ensure_entitlement` RPC issued in parallel with `loadAll()` during `runBootstrap`; `refreshEntitlement()`; failure wiring per FR-008. T014 green.
- [x] T016 [P] [US1] Implement `iOS/Ortho-iOS/Services/EntitlementsAPI.swift` (`ensureEntitlement()` RPC call returning the row DTO, `fetchOwn()`, DTO with CodingKeys matching data-model columns) — struct style mirrors existing `Services/` APIs.
- [x] T017 [US1] Implement iOS `App/AppState.swift` wiring: `entitlement` published state + `gateState` (via EntitlementLogic), `ensureEntitlement` awaited inside `bootstrapUserSession` alongside `loadAllFromServer()`; failure ⇒ existing `bootstrapDidFail` recovery (never paywall); `refreshEntitlement()`; sign-out resets entitlement state (017 lesson).

**Checkpoint**: US1 fully testable — trial lifecycle works end-to-end against mocks.

## Phase 4: User Story 2 — Trial ends → paywall → subscribe → back in (P1)

**Goal**: lapsed users fully blocked; Stripe checkout round-trip restores access.
**Independent test**: mock row with expired trial → paywall blocks everything; mock `billing-checkout` → url; flip mock row to active + "Check again" → unblocked.

- [x] T018 [P] [US2] Implement `supabase/functions/stripe-webhook/index.ts` per contracts/billing-functions §1: raw-body `constructEventAsync` + `createSubtleCryptoProvider`, dedup insert into `billing_events`, user resolution, `_shared/billing` machine, service-role upsert, outcome codes; 200/400/500 semantics exactly as contracted.
- [x] T019 [P] [US2] Implement `supabase/functions/billing-checkout/index.ts` and `supabase/functions/billing-plans/index.ts` per contract §2/§4 (auth resolve via `getUser`, get-or-create customer with `metadata.user_id`, session params incl. `subscription_data.metadata.user_id`, `allow_promotion_codes`; plans: price lookup + 60s cache; `not_configured` 503 path) + `supabase/config.toml` `[functions.stripe-webhook] verify_jwt = false`.
- [x] T020 [P] [US2] Write failing tests `web/test/paywall.test.tsx`: gate `lapsed` renders Paywall INSTEAD of children for every route (Shell-level); paywall shows plan rows with amounts from mocked `billing-plans` (`$X.XX`, no hardcoded price anywhere — assert none in source copy), "Check again" refetches + unblocks when row flips, quiet sign-out works, plans-unavailable calm state on invoke failure with retry, failure copy in `role="status"` aria-live region, all controls real buttons ≥44px, no paywall flash for entitled users during loading.
- [x] T021 [US2] Implement `web/lib/billing.ts` (`startCheckout(plan)` → invoke + same-tab navigate, no auto-retry; `openPortal()`; `fetchPlans()`) and `web/components/Paywall.tsx` (constitution-compliant: headline "Your free month has ended", two plan rows, check again, quiet sign out; tokens only) ; mount in `web/app/(app)/layout.tsx` Shell after load/error branches (`gateState === 'lapsed'`). T020 green.
- [x] T022 [US2] Add return-from-checkout handling in `web/app/(app)/settings/page.tsx` reading `?checkout=success|cancelled` (calm status line + immediate `refreshEntitlement()`; no celebratory takeover), with test in `web/test/paywall.test.tsx`.

**Checkpoint**: MVP complete — a real user could trial, lapse, pay, and return (pending operator deploy).

## Phase 5: User Story 3 — Subscribers manage their own billing (P2)

- [x] T023 [P] [US3] Implement `supabase/functions/billing-portal/index.ts` per contract §3 (`no_billing_account` 409; return_url to settings).
- [x] T024 [US3] Write failing tests (in `web/test/subscription-settings.test.tsx`): active subscriber sees Manage → `openPortal()` invoked and navigates to returned url; canceled-but-paid-through renders gate `active` with "ends on <date>" copy (stored-status-driven); portal failure shows calm inline copy (aria-live). Then implement the manage action inside `web/components/settings/SubscriptionSection.tsx` (component created fully in T031; this task lands the billing actions + these tests — coordinate, don't duplicate).

## Phase 6: User Story 4 — Admins never see a paywall (P2)

- [x] T025 [P] [US4] Write tests: web (`web/test/entitlement-bootstrap.test.tsx` extension) — admin row ⇒ gate `admin`, never Paywall even with ancient expiry, no subscribe affordances outside Settings; core already locks V01/V02 + admin-wins (T003/T005 — verify referenced fixtures exist, add if gap). Implement any missing branches in `web/lib/store.tsx` gate wiring (expected: none — derivation covers it; this task is the proof).
- [x] T026 [P] [US4] Verify quickstart §3.8 admin-grant SQL against the migration (column names/enum literal), and add the grant/revoke snippet pair to `web/scripts/ops/billing-smoke.ts` output text (script itself lands in T035).

## Phase 7: User Story 5 — A failed renewal never cuts access abruptly (P2)

- [x] T027 [US5] Write failing tests: gate `grace` gives FULL app access (Shell renders children) + calm Settings dunning notice with portal link, `aria-live="polite"`, never red, never blocking (extends `web/test/subscription-settings.test.tsx`); stored `past_due` beyond grace ⇒ paywall (already vector-locked V14 — assert Shell behavior too). Implement the grace notice in `web/components/settings/SubscriptionSection.tsx` + any store wiring. (Core transitions were locked in T005/T006.)

## Phase 8: User Story 6 — iOS paywall + link-out, one source of truth (P2)

*(All iOS tasks compile-verified only by CI — complete T028–T030 + T016/T017/T012 as ONE batch before the push task T045.)*

- [x] T028 [US6] Implement `iOS/Ortho-iOS/Features/Paywall/PaywallView.swift`: full-screen gate (BootstrapRecoveryView shape, AppTheme tokens): headline, two plan rows (amounts from `billing-plans` via EntitlementsAPI; loading + calm unavailable states), "Check again" (`refreshEntitlement`), quiet Sign out (escape hatch — 017 lesson: no trapped blocking screens); plan buttons open the checkout URL via `UIApplication.shared.open` (external browser); dynamic status text uses `accessibilityValue`; targets ≥44pt.
- [x] T029 [US6] Wire the gate in `iOS/Ortho-iOS/App/Ortho_iOSApp.swift` root switch: `.signedIn` && !bootstrapDidFail && `gateState == .lapsed` ⇒ `PaywallView()`; entitled/grace/admin ⇒ `RootTabView()`; `-uiDemo` seeded mode never gates (guard). Extend `EntitlementsAPI` with `createCheckout(plan:)`/`createPortal()`/`fetchPlans()` functions-invoke calls.
- [x] T030 [US6] Add scenario coverage where testable sans simulator: `Ortho-iOSTests` unit tests for AppState gate selection logic (lapsed⇒paywall flag, grace⇒no gate, admin⇒no gate, bootstrap-failure⇒recovery not paywall) using injected fixtures.

## Phase 9: User Story 7 — Settings status row + full i18n (P3)

- [x] T031 [US7] Write failing tests `web/test/subscription-settings.test.tsx` (state copy per: trialing d-remaining, active-monthly renews, active-yearly renews, grace notice, canceled ends-on, lapsed subscribe, admin no-sub-needed) then implement `web/components/settings/SubscriptionSection.tsx` mounted after Cards in `web/app/(app)/settings/page.tsx` (row + action per state; owner of the T024 manage action and T027 grace notice).
- [x] T032 [P] [US7] Implement `iOS/Ortho-iOS/Features/Settings/SubscriptionSectionView.swift` + mount after Cards in `SettingsView.swift`: same states/copy/actions (subscribe ⇒ paywall-style plan sheet or direct checkout link-out; manage ⇒ portal URL external).
- [x] T033 [US7] Add every new English key to the five web catalogs `web/lib/i18n/{bn,es,ja,zh,ko}.ts` (translated, not English placeholders) and matching keys ×6 locales to `iOS/Ortho-iOS/Localizable.xcstrings`; catalog-parity suite green; audit zero hardcoded user-facing strings in new components.

## Phase 10: Polish & Cross-Cutting

- [x] T034 [P] Write `web/scripts/ops/billing-probe.ts` `[OPERATOR-PENDING]`: read-only checks per quickstart §2.6 (RPC present, tables reachable service-role, four functions respond, prices resolve) with red/green report; refuses to run without explicit env.
- [x] T035 [P] Write `web/scripts/ops/billing-smoke.ts` `[OPERATOR-PENDING]`: guided interactive walk of quickstart §3 incl. admin grant/revoke snippets (T026) and replay check.
- [x] T036 [P] Docs: update `docs/index.md` (big-picture: first server-side code, `services/`, functions), `docs/supabase.md` (entitlements/billing_events/RPC/functions/secrets), `docs/web.md` (billing lib, paywall gate, ops scripts), `docs/ios.md` (EntitlementsAPI, paywall gate, link-out).
- [x] T037 [P] `PARITY.md`: add spec-018 capability rows (derivation TS↔Swift↔core with literal-lock digest; paywall/Settings surfaces) + divergence entries (web same-tab redirect vs iOS external link-out; iOS plan sheet form factor).
- [x] T038 Re-run FULL local gates (quickstart §1): services/billing tests+tsc, sync drift, web `npm test` (731+new, zero failures) + `npx tsc --noEmit`, `npm run gen:vectors` zero-drift, `npm run build` (only if no shared dev server), catalog parity.
- [x] T039 Adversarial multi-agent review (6 dimensions: web correctness, Swift compile/logic, security — webhook/entitlement forgery/redirects, parity/i18n, constitution/a11y, test quality) → triage → apply confirmed fixes TDD-style → re-run T038.
- [x] T040 Update this ledger + spec `Status:` + write `.claude/context-summaries` note if session ends; commit series follows house style (spec → core/backend → web → iOS → docs).
- [x] T045 Push branch (bypass-proxy per CI-SETUP.local.md), open PR (base `full-holistic-audit-parity`, status-banner body incl. `[OPERATOR-PENDING]` list), watch `web-ci` + `ios-ci` to green (budget: ≤2 iOS fix-up rounds, each a full batch). DONE: PR #9; Web CI runs 4+5 ✅; iOS CI run 40 ❌ (3× missing `await` on iOS-26-async `UIApplication.open`) → one batch fix (2e241e2) → run 41 ✅. One of two budgeted rounds used. T030 remains [OPERATOR-PENDING].

## Dependencies & execution order

```
Setup (T001–T002)
  → Foundational core (T003→T004; T005/T006/T007→T008; T009 after T004+T008)
  → DB (T010) ∥ mirrors+harness (T011, T012, T013)
  → US1 (T014→T015; T016→T017)          [needs T004, T010 shape, T011–T013]
  → US2 (T018/T019 ∥ T020→T021→T022)    [needs US1 + T008/T009/T010]
  → US3 (T023 ∥ T024) , US4 (T025, T026) , US5 (T027)   [after US2; mutually independent]
  → US6 (T028→T029→T030)                [after US1 iOS + contracts; UI reuses billing-plans]
  → US7 (T031 ∥ T032 → T033)            [T031 hosts US3/US5 web surfaces — see task notes]
  → Polish (T034–T040, T045; T038 before T039 before T045)
```

Parallel opportunities: T005/T006/T007 together; T011/T012/T013 together; T018/T019/T020
together; T023/T025/T026/T027 wave; T031/T032 together; T034–T037 wave. iOS tasks
(T012, T016, T017, T028–T030, T032, xcstrings half of T033) form ONE CI batch regardless of
phase position.

## Implementation strategy

MVP = Phases 1–4 (US1+US2): trial, block, pay, restore — a shippable monetization loop.
US3–US7 layer management, admin, dunning, iOS, and polish onto the same entitlement fact
without reopening earlier work. Stop-anywhere checkpoints after each phase; the branch stays
merge-safe throughout because live-system steps are operator-pending by design (FR-029).
Numbering note: T041–T044 were reserved for the review pass; used as follows.
- [x] T041 Review fix pass (backend): dahlia dual-shape translator + apiVersion pins, failure-aware webhook dedup/re-claim, read-error 500s, paid-before-row heal, checkout ensure/metadata fixes, normalize.ts .ts-import, tests-tsconfig CI gate.
- [x] T042 Review fix pass (web): paywall checkout-return + honest check-again, plans live region + payload validation, focus management, singular day, one-shot params, unparseable-expiry fail-open, harness live-RLS shapes, memory-client parity, +2 i18n keys ×5.
- [x] T043 Review fix pass (iOS): microsecond timestamp parsing + tests, single-fire announcements, in-session entitlement refresh, honest check-again, singular day, comment/contract citations, +2 xcstrings keys.
- [x] T044 Contracts/PARITY sync: stripe-events failure modes + API version binding + resolution order, entitlement-state unparseable rule, quickstart endpoint version pin, PARITY checkout-return divergence.

## Merge-time addendum (2026-07-16, reconciliation onto post-021 main)

- [x] T046 Reconcile the branch onto main (specs 019–023 landed since the fork; spec 021
  retired the native SwiftUI app in favor of the Capacitor-wrapped web build). Resolved the
  7 conflicts (shell `layout.tsx` paywall gate composed with the 021/023 splash + biometric-lock
  shell; `store.tsx` entitlement state composed with the 023 store-context split; docs/PARITY
  tails). **The entire native-Swift lift (T012, T016/T017, T028–T030, T032, the xcstrings half of
  T033 — `EntitlementLogic.swift`, `EntitlementsAPI.swift`, `PaywallView.swift`,
  `SubscriptionSectionView.swift`, `EntitlementGateTests`/`EntitlementLogicTests`, +27 xcstrings
  keys) was DROPPED at merge**: the frozen app receives no feature work, and the shipped iOS
  client (Capacitor shell) gets the whole feature from the web bundle. The entitlement
  literal-vector lock is now two-way (`services/billing/src/derive.ts` ↔ `web/lib/entitlements.ts`);
  vectors + digest unchanged. Checkout link-out on iOS needs no native code: Capacitor's
  navigation policy opens any non-app-origin top-level navigation (the Stripe URL from
  `window.location.assign`) in the external browser — verified against
  `@capacitor/ios` `WebViewDelegationHandler.swift` at merge.

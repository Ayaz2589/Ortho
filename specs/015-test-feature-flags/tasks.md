---
description: "Task list for Test-Build Feature Flags (Test Data + Auth Bypass)"
---

# Tasks: Test-Build Feature Flags (Test Data + Auth Bypass)

**Input**: Design documents from `/specs/015-test-feature-flags/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — FR-018 requires automated behavior tests (web Vitest; iOS XCTest).

**Organization**: Grouped by user story. US1 (test data, no poisoning) is the MVP; US3 (production
safety) shares the gating primitives with the Foundational phase.

## Conventions

- Two surfaces: `iOS/Ortho-iOS/**` (verified via CI only — Linux can't build iOS) and `web/**`
  (verified locally with `cd web && npm test`).
- New **app** Swift files auto-join the target (filesystem-synchronized groups); new **test** Swift
  files MUST be added to the test target in `iOS/Ortho-iOS.xcodeproj/project.pbxproj`.
- Web runs a modified Next.js — middleware is `proxy.ts`. Read `node_modules/next/dist/docs/` before
  touching routing.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Confirm baseline: `cd web && npm test` is green before any change; on Linux-arm64 install native binaries first (`@rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save`). Note the iOS CI baseline run id.
- [ ] T002 [P] Create the `iOS/Ortho-iOS/Config/` folder to hold the new flag files (app target is filesystem-synced, so no pbxproj edit needed for app files).

**Checkpoint**: Toolchain ready; baseline green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: All user stories depend on these shared primitives (test-build detection, flag
registry, refreshed sample dataset).

### Test-build detection

- [ ] T003 [P] Create `iOS/Ortho-iOS/Config/TestBuild.swift` — `enum TestBuild { static var isTestBuild: Bool }` returning true when `#if DEBUG` OR `Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"` (TestFlight), false in App Store Release. (contract C-FF-3)
- [ ] T004 [P] Create `web/lib/test-build.ts` — `isTestBuild()` = `process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'` with fallback `process.env.NODE_ENV !== 'production'`; written so the literal comparison dead-code-eliminates in a production build. (C-FF-3)

### Flag registry, persistence, production force-off

- [ ] T005 [P] Create `iOS/Ortho-iOS/Config/FeatureFlags.swift` — `@Observable` store, `@AppStorage("ff_useTestData")`/`@AppStorage("ff_bypassAuth")`; getters return `false` unless `TestBuild.isTestBuild`; `effectiveUseTestData = useTestData || bypassAuth`. Inject into the SwiftUI environment in `Ortho_iOSApp.swift`. (C-FF-1, C-FF-2, C-FF-4, C-FF-5)
- [ ] T006 [P] Create `web/lib/flags.ts` — `readFlags()/writeFlags()` over `localStorage['ortho.flags']` (JSON) mirroring `components/settings/appearance.ts`; `readFlags()` returns `{useTestData:false,bypassAuth:false}` unless `isTestBuild()`; `writeFlags` also sets/clears the `ortho_bypass_auth` cookie; export `effectiveUseTestData(f)`. (C-FF-1, C-FF-2, C-FF-4, C-FF-5)

### Refreshed sample dataset — iOS

- [ ] T007 [P] Add `Person.sample` to `iOS/Ortho-iOS/Models/Person.swift` — two People (maya/jordan) with `householdID = Household.homeSample.id`, `linkedUserID` = matching sample user id, `colorKey`, `sortOrder`, `removedAt: nil`. (data-model §2)
- [ ] T008 Modernize `Transaction.sample`/`makeSample` in `iOS/Ortho-iOS/Models/Transaction.swift` — retype owners to `Set<Person.ID>`, set `paidBy`, widen `daysAgo` to span ≥3 months, add ≥1 `.transfer` (reimbursement) row and joint/split rows. (depends T007; FR-009..011)
- [ ] T009 [P] Add `Budget.sample` to `iOS/Ortho-iOS/Models/Budget.swift` — ≥2 budgets on categories present in the sample transactions. (FR-010)
- [ ] T010 [P] Add `RentalPayment.sample` to `iOS/Ortho-iOS/Models/RentalPayment.swift` — ≥2 payments so the Housing rental view is non-empty. (FR-010)
- [ ] T011 Update `AppState.init` default params in `iOS/Ortho-iOS/App/AppState.swift` to seed `people = Person.sample`, `budgets = Budget.sample`, `rentalPayments = RentalPayment.sample` (and keep users/cards/property). (depends T007–T010)

### Refreshed sample dataset — web

- [ ] T012 [P] Create `web/lib/testdata/seed.ts` — Person-centric in-memory dataset (people, transactions with `owner_ids`+`shares`+`paid_by`+`created_at`/`updated_at`, cards, budgets, a property, rental payments) using the field shapes from `web/test/helpers/fixtures.ts`, WITHOUT importing vitest; spans ≥2 months. (FR-009..011)
- [ ] T013 Create `web/lib/testdata/memory-client.ts` — in-memory Supabase-shaped client (`auth.getUser/onAuthStateChange`; `from(table).select/eq/in/order/limit/single/insert/update/delete/upsert`; `rpc`) adapted from `web/test/helpers/supabase-mock.ts` WITHOUT the vitest import, pre-seeded from `seed.ts`. (depends T012; C-TD-1)

**Checkpoint**: Primitives exist; user stories can begin.

---

## Phase 3: User Story 1 - Exercise the app with disposable test data (Priority: P1) 🎯 MVP

**Goal**: A **Use test data** switch runs the whole app on the isolated in-memory dataset; no live
read/write; real data untouched.

**Independent Test**: On a test build, enable the flag, mutate transactions, confirm no live write
and that disabling restores real data unchanged.

### Tests for User Story 1 (write first)

- [ ] T014 [P] [US1] `web/test/flags/flags.test.ts` — read/write round-trip; production force-off (readFlags returns all-false when isTestBuild is false). (C-FF-4)
- [ ] T015 [P] [US1] `web/test/settings/flags-section.test.tsx` — section renders under a test env and is ABSENT under a production env; toggling **Use test data** persists to `localStorage['ortho.flags']`. (C-FF-3, C-FF-5)
- [ ] T016 [P] [US1] `web/test/store/test-data-isolation.test.tsx` — with the flag on, the real browser client (`createBrowserClient`) is never constructed and no write escapes the in-memory fake; toggling off restores live bootstrap. (C-TD-1, C-TD-3, SC-001, SC-002)
- [ ] T017 [P] [US1] `iOS/Ortho-iOSTests/SampleDataTests.swift` — Person-keyed owners resolve (no placeholder), member balances non-empty, tx span ≥2 months, no sample UUID present in any create payload; ADD file to the test target in `project.pbxproj`. (SC-003, FR-011, FR-012)
- [ ] T018 [P] [US1] `iOS/Ortho-iOSTests/TestDataIsolationTests.swift` — with `testDataEnabled` true, mutators complete without invoking the API layer (inject a spy/no-op API seam); ADD file to `project.pbxproj`. (C-TD-1)

### Implementation for User Story 1

- [ ] T019 [US1] `iOS/Ortho-iOS/App/AppState.swift` — add `testDataEnabled` (from injected `FeatureFlags.effectiveUseTestData`); wrap the `Task { try await …API… }` server hop in every optimistic mutator (transactions add/update/delete, cards, properties, budgets, rental payments, people) with `if !testDataEnabled { … }`; early-return `loadAllFromServer`/`loadXFromServer` and the DEBUG importers under the flag. (C-TD-1, C-TD-2)
- [ ] T020 [US1] `iOS/Ortho-iOS/App/Ortho_iOSApp.swift` — seed the sample `AppState` (People + budgets + rental payments) when `FeatureFlags.effectiveUseTestData` at launch, alongside the existing `-uiDemo` path. (R6)
- [ ] T021 [US1] `iOS/Ortho-iOS/Features/Settings/SettingsView.swift` + new `iOS/Ortho-iOS/Features/Settings/FeatureFlagRowView.swift` — add a **Feature Flags** (Developer) section gated on `TestBuild.isTestBuild` with a **Use test data** toggle row bound to `FeatureFlags`; reuse `sectionLabel` + surface card + `RowSeparator` + a grey caption. (FR-001, FR-017)
- [ ] T022 [US1] `web/lib/supabase/client.ts` — return the `memory-client` instance when `isTestBuild() && effectiveUseTestData(readFlags())`; otherwise the real `createBrowserClient`. (C-TD-1)
- [ ] T023 [US1] `web/lib/store.tsx` — key bootstrap on the effective flag; when on, load from the memory client and skip live hydration; when the flag flips, re-bootstrap cleanly so real data returns intact. (C-TD-2, C-TD-3, C-TD-5)
- [ ] T024 [US1] `web/components/settings/flags-section.tsx` (NEW, self-gated on `isTestBuild()`) rendered from `web/app/(app)/settings/page.tsx` — a **Developer** section with a **Use test data** row using `SectionCard`/`ChoiceRow`; toggling calls `writeFlags`. (FR-001, FR-017)
- [ ] T025 [US1] Add i18n keys `"Developer"`, `"Use test data"`, and the caption `"Only visible on test builds."` to the English source and all five catalogs (`web/lib/i18n/{bn,es,ja,zh,ko}.ts`) so `web/test/i18n/catalog-parity.test.ts` passes. (FR-004, FR-017)

**Checkpoint**: MVP — test-data isolation works and is tested on both surfaces.

---

## Phase 4: User Story 2 - Enter the app without signing in (Priority: P2)

**Goal**: A **Bypass auth** switch opens the app directly on the test dataset, no sign-in; bypass
implies test data; real session left intact.

**Independent Test**: With no session, enable bypass, relaunch → tabs shown on seed, no live traffic;
disable → normal auth gate returns.

### Tests for User Story 2 (write first)

- [ ] T026 [P] [US2] `web/test/store/auth-bypass.test.tsx` — with the bypass cookie + test env, an app-route request is not redirected to `/sign-in` and the store boots populated from the seed; toggling bypass off restores the redirect and the SIGNED_OUT watcher. (C-TD-4)
- [ ] T027 [P] [US2] `iOS/Ortho-iOSTests/FeatureFlagsTests.swift` — `bypassAuth` implies `effectiveUseTestData`; getters force-false off test builds; persistence round-trip; ADD file to `project.pbxproj`. (C-FF-2, C-FF-4, C-FF-5)

### Implementation for User Story 2

- [ ] T028 [US2] `iOS/Ortho-iOS/App/Ortho_iOSApp.swift` — when `FeatureFlags.bypassAuth`, render `RootTabView()` directly, skip `observeAuthChanges()`, and skip `ensureCurrentUser`/`bootstrapUserSession`, leaving any real session untouched. (C-TD-4, FR-013..015)
- [ ] T029 [US2] `web/proxy.ts` — skip the `/sign-in` redirect when `isTestBuild()` AND the `ortho_bypass_auth` cookie is set; otherwise unchanged. (C-TD-4, FR-016)
- [ ] T030 [US2] `web/lib/store.tsx` — under bypass, skip `auth.getUser()`, seed from the memory client, and neuter the `onAuthStateChange` `SIGNED_OUT` hard-redirect. (C-TD-4, FR-016)
- [ ] T031 [US2] `web/components/settings/flags-section.tsx` + `web/lib/flags.ts` — add the **Bypass auth** row; toggling sets/clears the `ortho_bypass_auth` cookie and (since bypass implies test data) reflects the effective state. (FR-013, FR-014)

**Checkpoint**: Both stories work independently.

---

## Phase 5: User Story 3 - Flags invisible & inert in production (Priority: P1)

**Goal**: On a production build/deploy the Developer section is absent and any persisted "on" value
is ignored — structurally, not by convention.

**Independent Test**: Build/run the production configuration; section absent; a pre-set "on" flag
changes nothing.

### Tests for User Story 3 (write first)

- [ ] T032 [P] [US3] `web/test/flags/production-off.test.tsx` — with the production env signal, `<FlagsSection/>` renders nothing, `readFlags()` returns all-false even when `localStorage['ortho.flags']` is pre-set "on", and `proxy.ts` ignores the bypass cookie. (C-FF-4, C-TD-6, SC-004)
- [ ] T033 [P] [US3] Extend `iOS/Ortho-iOSTests/FeatureFlagsTests.swift` — simulate the non-test-build path and assert `FeatureFlags` getters read `false` despite a pre-set UserDefaults value. (C-FF-4, SC-004)

### Implementation for User Story 3

- [ ] T034 [US3] Audit pass: confirm every flag-honoring branch is wrapped so it dead-code-eliminates in production (web: literal `isTestBuild()`/`process.env` comparison guards `client.ts`, `store.tsx`, `proxy.ts`, `flags-section.tsx`) and compiles/branches out on iOS (`TestBuild.isTestBuild` + `FeatureFlags` force-false). Fix any path that honors a flag without the gate.

**Checkpoint**: Production safety proven by tests on both surfaces.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Update `PARITY.md` — record the per-surface gating divergence (iOS compile/TestFlight-receipt vs web build-env) as an intentional, non-vectored divergence. (FR-020)
- [ ] T036 [P] Update `docs/ios.md` and `docs/web.md` — the Developer/Feature-Flags section, the isolation seam (iOS mutator guard / web client swap), the refreshed sample data, and the production-gating gotchas.
- [ ] T037 `cd web && npm test` — full suite green including all new specs; fix any fallout; confirm `lib/` coverage threshold holds.
- [ ] T038 Production build safety check (web): `NEXT_PUBLIC_VERCEL_ENV=production npm run build` produces a bundle without the Developer section; hand-set flag/cookie ignored. (SC-004)
- [ ] T039 Push branch (draft PR) and watch iOS CI: `GH_TOKEN=placeholder gh run watch --exit-status`; download the `simulator-screenshots` artifact and confirm the refreshed sample data renders (non-empty balances, budgets, housing) — re-baseline expectations.
- [ ] T040 Run `quickstart.md` validation end to end (web automated + manual; iOS CI); check off Done-when.

### Operator-pending (cannot run in a Linux sandbox)

- [ ] T041 [Operator] On a TestFlight test device, confirm the Developer section appears and both flags work; on an App Store/Release build confirm the section is absent and pre-set flags are inert. (SC-004, FR-002)

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** blocks everything.
- **US1 (P1)** depends on Foundational. **US2 (P2)** depends on Foundational + US1's seed/isolation.
  **US3 (P1)** depends on Foundational (the force-off primitives) and validates them.
- **Polish (P6)** depends on all desired stories.
- Within Foundational: T007 → T008; T007–T010 → T011; T012 → T013.
- Within US1: tests (T014–T018) before impl (T019–T025); T019 depends on T005+T011; T022 depends on T006+T013.

## Parallel Opportunities

- Foundational: T003/T004 (detectors), T005/T006 (registries), T007/T009/T010 and T012 all `[P]`
  (different files); the two surfaces are fully independent.
- US1 tests T014–T018 all `[P]`. iOS vs web implementation tracks run in parallel.
- Polish T035/T036 `[P]`.

## Parallel Example: Foundational

```text
# Detectors + registries + sample factories, both surfaces at once:
T003 iOS TestBuild.swift      | T004 web lib/test-build.ts
T005 iOS FeatureFlags.swift   | T006 web lib/flags.ts
T007 iOS Person.sample        | T009 iOS Budget.sample | T010 iOS RentalPayment.sample | T012 web seed.ts
```

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: test-data isolation on both surfaces, tested. Stop
  and validate (`npm test` green; iOS CI green; no live writes).
- Then **US2** (auth bypass), then **US3** (production-safety tests + audit), then **Polish**
  (PARITY.md, docs, screenshots, quickstart).
- iOS lands in batched pushes to keep CI cycles short; each push watched to green.

## Notes

- `[P]` = different files, no dependency. `[USn]` maps to the spec's user stories.
- iOS "tests fail first" is validated in CI (Linux can't build iOS); write test → impl → push → watch.
- Never write the sample dataset to the live backend; the no-live-writes tests are the guardrail.
- Commit after each task or logical group; keep real Amex captures / secrets out of commits.

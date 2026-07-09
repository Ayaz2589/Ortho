# Tasks: Capacitor iOS Consolidation

**Input**: Design documents from `/specs/021-capacitor-ios-consolidation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Explicitly requested — spec's "Delivery approach" and the constitution's Principle VI
mandate TDD. Every task touching ported/new business logic has a failing-test task immediately
before its implementation task.

**Environment note**: This repo's Linux sandbox cannot build or run iOS (`docs/index.md` §5).
Swift-authoring tasks below are written and reasoned about here but their build/runtime correctness
is confirmed by `capacitor-ios-ci.yml` on a macOS runner (Phase 2), mirroring how `iOS/Ortho-iOS/`
work has always been verified. Tasks marked **[CI-VERIFY]** cannot be locally confirmed passing in
this environment — implement them fully, then rely on the pushed CI run for pass/fail. Tasks marked
**[OPERATOR-PENDING]** require a physical device, an App Store Connect action, or another
human-in-the-loop step and cannot be completed by an agent at all.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (native shell/auth/UX), US2 (scan), US3 (native affordances), US4 (safe
  engineering transition) — maps to spec.md's four user stories

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the Capacitor project so later phases have somewhere to add code.

- [ ] T001 Add Capacitor dependencies to `web/package.json`: `@capacitor/core`, `@capacitor/ios`; dev
  dependency `@capacitor/cli`
- [ ] T002 Run `npx cap init Ortho AyazUddin.Ortho-iOS --web-dir out` from `web/` to create
  `web/capacitor.config.ts` (reuse the existing bundle id exactly, per spec FR-015 — confirmed
  `AyazUddin.Ortho-iOS` from `iOS/Ortho-iOS.xcodeproj/project.pbxproj`)
- [ ] T003 Set `capacitor.config.ts` `ios.contentInset: 'never'`, `ios.scheme: 'App'`,
  `server.iosScheme: 'https'` per research.md Decision 7
- [ ] T004 Run `npx cap add ios` from `web/` (Swift Package Manager, the Capacitor 8 default — do
  not pass `--packagemanager Cocoapods`) to generate `web/ios/App/`
- [ ] T005 [P] Add `web/ios/App/App/public/`, `web/ios/App/build/`, and Xcode user-state paths to a
  new `web/ios/App/.gitignore`; commit `App.xcodeproj`, `Info.plist`, `Assets.xcassets` as tracked
  files (mirrors how `iOS/Ortho-iOS.xcodeproj` is committed today)
- [ ] T006 [P] Remove the now-meaningless `"start": "next start"` script from `web/package.json`
  (static export ships no Node server)
- [ ] T007 Set `output: 'export'` and `images: { unoptimized: true }` in `web/next.config.ts`
  (research.md Decision 2); remove the now-inert `images.remotePatterns` Supabase-storage entry
- [ ] T008 [P] Confirm `npm run build` in `web/` fails cleanly right now (expected — `proxy.ts` isn't
  deleted yet) so Phase 2's fix is verifiably the thing that makes it pass

**Checkpoint**: Capacitor project scaffolded; static export not yet buildable (expected — Phase 2 fixes it).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Get the app to a state where it builds under static export AND a signed-in user can
reach any screen at all. Every user story below needs this to be independently demoable — none of
US1–US4 can be tested without a buildable, reachable app shell.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T009 [P] Write failing tests in `web/test/sign-in.test.tsx` for: signed-out visitor on a
  protected route → redirected to `/sign-in`; signed-in user on `/sign-in` → redirected to
  `/dashboard`; `bypassAuth` test-flag path still works reading `localStorage` (no cookie) — per
  contracts implied by research.md Decision 2 and quickstart.md Scenario 2
- [ ] T010 Delete `web/proxy.ts` (unsupported under static export; research.md Decision 2)
- [ ] T011 [P] Delete `web/lib/supabase/server.ts` (confirmed dead code by repo-wide grep in
  research-report-full.md §2)
- [ ] T012 Add the signed-out guard to `web/app/(app)/layout.tsx`: after `runBootstrap()`'s existing
  `supabase.auth.getUser()` call, `router.replace('/sign-in')` on `!authUser`, short-circuited by the
  existing `isTestBuild() && readFlags().bypassAuth` check; keep `loading` true until resolved
  (depends on T009 failing correctly first)
- [ ] T013 Add the signed-in-redirect-away guard to `web/app/sign-in/page.tsx`: mount-time
  `getUser()` check, `router.replace('/dashboard')` if a user is already present (depends on T009)
- [ ] T014 Convert `web/app/page.tsx` from a Server Component `redirect()` to a `'use client'`
  component calling `useRouter().replace('/dashboard')` on mount (research.md Decision 2)
- [ ] T015 Remove `BYPASS_AUTH_COOKIE` and its `document.cookie` write from `web/lib/flags.ts`'s
  `writeFlags()`; read `readFlags().bypassAuth` directly from `localStorage` in the new guards
  (depends on T012, T013)
- [ ] T016 Run `web/test/sign-in.test.tsx` and confirm T009's tests now pass (TDD close-out for the
  auth-gate migration)
- [ ] T017 [P] Add `.github/workflows/capacitor-ios-ci.yml`: `npm ci` → `next build` → `npx cap sync
  ios` → `xcodebuild build -project web/ios/App/App.xcodeproj -scheme App -destination "generic/platform=iOS Simulator"`,
  triggered on push/PR touching `web/**` (research.md Decision 8)
- [ ] T018 Run `cd web && npm run build` locally and confirm it now succeeds (closes T008's
  expected-failure loop) — the deepest available local verification; full native build correctness
  is **[CI-VERIFY]** via T017's workflow

**Checkpoint**: App builds under static export; a signed-in user can reach every route; CI has a
build signal. User story implementation can now begin.

---

## Phase 3: User Story 1 - Use the whole app natively on iPhone (Priority: P1) 🎯 MVP

**Goal**: The wrapped app feels like a native iPhone app — persistent login, correct safe areas,
correct keyboard behavior, no browser-style scroll/selection artifacts, themed status bar/splash.

**Independent Test**: Install a Capacitor build on a physical iPhone; navigate every destination;
force-quit and relaunch and confirm still signed in; confirm no content is ever obscured by
status bar/notch/home indicator/keyboard (spec User Story 1 acceptance scenarios).

### Tests for User Story 1

- [ ] T019 [P] [US1] Write failing tests in `web/test/auth/keychainStorage.test.ts` for the
  `SupabaseAuthStorageAdapter` contract (`getItem`/`setItem`/`removeItem` round-trip against a mocked
  `@aparajita/capacitor-secure-storage`) per `contracts/session-storage-adapter.md`

### Implementation for User Story 1

- [ ] T020 [US1] Add `@aparajita/capacitor-secure-storage` to `web/package.json`
- [ ] T021 [US1] Implement `web/lib/auth/keychainStorage.ts` satisfying the adapter contract; choose
  a `kSecAttrAccessible*ThisDeviceOnly` accessibility class so reinstall starts a fresh session
  (contracts/session-storage-adapter.md) — depends on T019 failing correctly first, then T020
- [ ] T022 [US1] Wire the adapter into `web/lib/supabase/client.ts`'s `createBrowserClient` call:
  `storage: Capacitor.isNativePlatform() ? keychainStorageAdapter : undefined`,
  `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false` (depends on T021)
- [ ] T023 [US1] Add `@capacitor/app` to `web/package.json`; register an `appStateChange` listener
  (`isActive && supabase.auth.getSession()`) in `web/lib/store.tsx` to close the idle-liveness gap
  documented in `docs/parity-audit-2026-07-02.md` (contracts/session-storage-adapter.md)
- [ ] T024 Run `web/test/auth/keychainStorage.test.ts` and confirm T019's tests now pass
- [ ] T025 [P] [US1] Add `@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/splash-screen`
  to `web/package.json`; add `@capacitor/assets` as a dev dependency
- [ ] T026 [US1] Add `viewport-fit=cover` to the viewport meta in `web/app/layout.tsx`; apply
  `env(safe-area-inset-*)` padding on the outer app shell only (tab bar, header — per
  research-report-full.md §7, not per-screen)
- [ ] T027 [P] [US1] Set `Keyboard` config `resize: 'body'` in `capacitor.config.ts`; audit every
  form (transaction add/edit, property add/edit, settings) for `100vh`-based layouts that would break
  under body-resize and fix them
- [ ] T028 [P] [US1] Add `-webkit-touch-callout: none; user-select: none;` to the app shell in
  `web/app/globals.css`, explicitly re-enabled on inputs/textareas and genuinely copyable content
  (transaction IDs, addresses)
- [ ] T029 [P] [US1] Add `touch-action: manipulation` to the design-system Button/Link/tab-bar-item
  primitives (not per-screen)
- [ ] T030 [US1] Set `UIViewControllerBasedStatusBarAppearance = YES` in
  `web/ios/App/App/Info.plist`; drive `StatusBar.setStyle()`/`setBackgroundColor()` from the same
  handler that flips Ortho's light/dark CSS tokens, with `overlaysWebView: true`
- [ ] T031 [US1] Generate app icon + splash assets via `npx capacitor-assets generate --ios` from a
  1024×1024 source (light) + a `splash-dark.png` variant matching Ortho's dark theme; set
  `launchAutoHide: false` in `capacitor.config.ts` and call `SplashScreen.hide()` manually after
  first meaningful paint (post auth-check + first route render) in `web/app/(app)/layout.tsx`
- [ ] T032 [US1] Confirm Capacitor's default `scrollView.bounces = false` is in effect (no
  `overscroll-behavior: none` CSS — WKWebView ignores it); re-verify inner `overflow: auto`
  containers (e.g. a modal transaction list) keep their own scroll behavior unaffected
- [ ] T033 [US1] [OPERATOR-PENDING] Run quickstart.md Scenario 5 (native-feel manual checklist) on a
  physical iPhone; record pass/fail per item — this is spec SC-004 and cannot be completed without
  device hardware

**Checkpoint**: User Story 1 is fully functional and independently testable — the app builds, a
user can sign in and stay signed in, and every screen respects native chrome. **[CI-VERIFY]** for
build correctness (T017's workflow); **[OPERATOR-PENDING]** for T033's device pass.

---

## Phase 4: User Story 2 - Scan a receipt or bank statement on-device (Priority: P2)

**Goal**: Camera capture, PDF import, and on-device OCR/parsing produce the same structured
transaction candidates the native app produces today, with zero image/document data leaving the
device.

**Independent Test**: Run the existing library of sample receipts/statements through the new flow
and confirm equivalent results to today's native app (spec User Story 2 acceptance scenarios).

### Fixture capture (prerequisite for TDD below)

- [ ] T034 [US2] [CI-VERIFY] On a macOS runner, run the still-intact `ScanTextExtractor.swift`
  against each of the 13 fixtures in `iOS/Ortho-iOS/Resources/ScanFixtures/` and serialize each
  result's `ScanDocumentText` to `shared/scan-fixtures/<name>.json` (one-time capture; research.md
  Decision 6, quickstart.md Scenario 6) — cannot run in this Linux sandbox

### Tests for User Story 2 (write first, against T034's frozen fixtures)

- [ ] T035 [P] [US2] Write failing tests in `web/test/scan/scanHeuristics.test.ts`: transliterate the
  ~dozen literal-string/date `ScanHeuristics` unit tests from `iOS/Ortho-iOSTests/ScanParserTests.swift`
  (`testStatementRow*`, `testBareDate`, `testStackedRows*`, `testFallback*`, `testCRSuffixIsCredit`,
  `testHistoryTierBeatsRuleTable`, `testYearInferenceAcrossBoundary`, `testWithinBatchTwinsBothSurvive`,
  etc.) — no fixture dependency, direct 1:1 port
- [ ] T036 [P] [US2] Write failing tests in `web/test/scan/scanParser.test.ts` and
  `web/test/scan/scanFixtures.test.ts`: port `ScanParserTests.swift`'s `assertFixture` harness to run
  the (not-yet-written) TS parser against each `shared/scan-fixtures/*.json` from T034 and diff every
  `ParsedCandidate` field against the corresponding `iOS/Ortho-iOS/Resources/ScanFixtures/<name>.expected.json`
- [ ] T037 [P] [US2] Write failing tests in `web/test/scan/scanInference.test.ts` for duplicate
  claiming and category inference against a constructed `ScanContext` (data-model.md)

### Implementation for User Story 2 — TypeScript port (parallel with the Swift plugin below)

- [ ] T038 [P] [US2] Create `web/lib/scan/scanModels.ts`: `ScanDocumentText`/`Line`/`Table`/`Page`,
  `ParsedCandidate`, `ScanParseResult`, `ScanContext`, `GuessedField` per data-model.md
- [ ] T039 [US2] Implement `web/lib/scan/scanHeuristics.ts` (merchant cleanup, amount/currency/date
  parsing incl. month-name forms, statement-row and stacked-app-list reconstruction, grand-total
  detection, category rule table, payment-row detection), ported from
  `iOS/Ortho-iOS/Services/Scan/ScanHeuristics.swift` — depends on T035 failing correctly, then T038
- [ ] T040 [US2] Implement `web/lib/scan/scanParser.ts` (tiered receipt-vs-statement decision), ported
  from `ScanParser.swift` — depends on T036, T039
- [ ] T041 [US2] Implement `web/lib/scan/scanInference.ts` (duplicate-claiming against
  `web/lib/store.tsx` transaction/merchant history, category inference), ported from
  `ScanInference.swift` — depends on T037, T038
- [ ] T042 Run `web/test/scan/scanHeuristics.test.ts`, `scanParser.test.ts`, `scanFixtures.test.ts`,
  `scanInference.test.ts` and confirm T035–T037 now pass

### Implementation for User Story 2 — native Scan plugin

- [ ] T043 [P] [US2] [CI-VERIFY] Create `web/ios/App/App/Plugins/Scan/ScanPlugin.swift`: a
  `@CapacitorPlugin(name: "Scan", permissions: [...])` subclass of `CAPPlugin` exposing
  `capture`/`extractPDF`/`refineMerchant`/`rescue`/`checkPermissions`/`requestPermissions` per
  `contracts/scan-plugin-api.md`
- [ ] T044 [P] [US2] [CI-VERIFY] Port `iOS/Ortho-iOS/Features/Transactions/Scan/ScanCaptureView.swift`'s
  AVFoundation capture + live-OCR-gated shutter + `CIPerspectiveCorrection` deskew logic (including
  `cgOrientation(for:)` verbatim) into `web/ios/App/App/Plugins/Scan/ScanCaptureController.swift`,
  invoked by `ScanPlugin.capture()`
- [ ] T045 [P] [US2] [CI-VERIFY] Port `ScanTextExtractor.swift` (image preprocessing, Vision OCR
  structured+classic paths, PDFKit extraction both branches) into
  `web/ios/App/App/Plugins/Scan/ScanTextExtractor.swift`, returning the `ScanDocumentText` JSON
  contract exactly, invoked by `ScanPlugin.capture()`/`extractPDF()`
- [ ] T046 [P] [US2] [CI-VERIFY] Port `ScanRefiner.swift` (FoundationModels polish/rescue, iOS 26+
  gated, silent-null on unavailable) into `web/ios/App/App/Plugins/Scan/ScanRefiner.swift`, invoked by
  `ScanPlugin.refineMerchant()`/`rescue()` — preserves spec FR-010's on-device-only, silent-degrade
  requirement; do NOT substitute a cloud LLM (spec Assumptions)
- [ ] T047 [US2] Add `NSCameraUsageDescription` to `web/ios/App/App/Info.plist` (T043 depends on this
  existing for the permission alias to resolve)

### Implementation for User Story 2 — file picker + UI wiring

- [ ] T048 [P] [US2] Add `@capawesome/capacitor-file-picker` to `web/package.json` for Files-app PDF
  picking (`@capacitor/camera` alone only reaches Photos, per research.md Decision 7)
- [ ] T049 [US2] Create `web/lib/scan/scanPlugin.ts`: typed `Capacitor.registerPlugin<ScanPlugin>('Scan')`
  wrapper matching `contracts/scan-plugin-api.md` — depends on T043
- [ ] T050 [US2] Port `ScanSession.swift`'s Phase state machine (idle→parsing→receiptPrefilled |
  interstitial→reviewing→summary|failed) and Disposition tracking, including the payment-row
  always-pre-skip rule and toggle-controlled duplicate pre-skip, into a React reducer in
  `web/lib/scan/scanSession.ts` (data-model.md) — depends on T040, T041
- [ ] T051 [P] [US2] Port `StatementInterstitialView.swift` into
  `web/components/scan/ScanInterstitial.tsx` (row/duplicate/payment counts, skip-duplicates toggle,
  Start review)
- [ ] T052 [P] [US2] Port `ScanSummaryView.swift` into `web/components/scan/ScanSummary.tsx`
  (added/skipped/duplicates-left-out counts, zero-count segments omitted, Done)
- [ ] T053 [US2] Wire camera capture, photo-library pick, and file-picker PDF import into the
  existing transaction-add flow (mirroring `AddTransactionSheet.swift`'s orchestrator role), applying
  accepted `ParsedCandidate` fields onto the open form via the existing optimistic add path — depends
  on T049, T050, T051, T052

**Checkpoint**: User Story 2 is independently functional. TS parser correctness is locally verifiable
(T042); the native plugin and full capture UX are **[CI-VERIFY]** only in this environment.

---

## Phase 5: User Story 3 - Native session security and conveniences (Priority: P3)

**Goal**: Face ID/Touch ID gates session access, haptics on key interactions, native share sheet,
and (functionally delivered in US2, verified here) Files-app PDF picking.

**Independent Test**: On a device with Face ID/Touch ID enrolled, background/foreground the app and
confirm a biometric prompt gates access; trigger share and confirm the native sheet; confirm haptic
feedback on a confirmation action (spec User Story 3 acceptance scenarios).

### Tests for User Story 3

- [ ] T054 [P] [US3] Write failing tests in `web/test/auth/biometricGate.test.ts`: on a device with
  no biometric enrollment, the gate never blocks reaching data; on a device with enrollment, the gate
  requires a successful check before rendering protected content

### Implementation for User Story 3

- [ ] T055 [US3] Add `@aparajita/capacitor-biometric-auth` to `web/package.json`; add
  `NSFaceIDUsageDescription` to `web/ios/App/App/Info.plist` (required or App Store rejects)
- [ ] T056 [US3] Implement the biometric gate in `web/app/(app)/layout.tsx` (or a new
  `web/components/BiometricGate.tsx` wrapping it): check availability, prompt on
  foreground-after-background, fall through ungated when unavailable — depends on T054, T055
- [ ] T057 [US3] Run `web/test/auth/biometricGate.test.ts` and confirm T054's tests now pass
- [ ] T058 [P] [US3] Add `@capacitor/haptics` to `web/package.json`; wire impact/notification
  feedback into key confirmation/deletion interactions (transaction save, transaction delete,
  property delete) per FR-012
- [ ] T059 [P] [US3] Add `@capacitor/share` to `web/package.json`; wire the native share sheet into
  existing export/share affordances per FR-013
- [ ] T060 [US3] [OPERATOR-PENDING] On a device with Face ID/Touch ID enrolled, confirm the
  biometric prompt gates return-from-background; on a device with no enrollment, confirm no block —
  cannot be verified without device hardware

**Checkpoint**: User Stories 1–3 all independently functional.

---

## Phase 6: User Story 4 - Safe, reversible engineering transition (Priority: P4)

**Goal**: Automated checks and documentation stop enforcing a two-implementation model; the frozen
native app remains a verifiable rollback path.

**Independent Test**: A routine unrelated change doesn't fail CI because of the frozen app; the
maintainer can manually trigger a compile check of the frozen app; docs describe one implementation
(spec User Story 4 acceptance scenarios).

- [ ] T061 [US4] Narrow `.github/workflows/ios-ci.yml` to `workflow_dispatch`-only triggers (remove
  push/PR path triggers); reduce its job to `xcodebuild build` only (drop `xcodebuild test`) per
  research.md Decision 8
- [ ] T062 [P] [US4] Delete `web/test/i18n/catalog-parity.test.ts` (reads the frozen
  `Localizable.xcstrings`; research.md Decision 9) — confirm `npm test` in `web/` still passes after
  removal
- [ ] T063 [US4] Copy the current `PARITY.md` verbatim to `docs/archive/PARITY-2026-07-08.md` before
  editing it (preserve the pre-021 audit trail)
- [ ] T064 [US4] Rewrite the live `PARITY.md` as a web(+Capacitor iOS)-vs-CLI matrix: strike the iOS
  column throughout, retire/relabel the "Golden-vector enforcement" row as "regression fixtures,
  web-only," rewrite "How parity is enforced" and "Known divergences → Apps" as historical, and
  specifically rewrite the scan-feature paragraph (today says "iOS only... not a product-surface
  divergence" — now "a native plugin used by the one remaining client") — depends on T063
- [ ] T065 [P] [US4] Add a one-line changelog banner to `PARITY.md`: "Last reconciled: spec 021,
  Capacitor consolidation — iOS/Ortho-iOS/ frozen, golden-vector harness repurposed as TS regression
  fixtures"
- [ ] T066 [P] [US4] Update `docs/index.md`: repoint the routing table at Capacitor/web as the iOS
  delivery vehicle; update the golden-vector/three-surface description
- [ ] T067 [P] [US4] Re-scope `docs/ios.md`: "read only when touching the frozen legacy app or the
  scan plugin's original Swift source"; add a short section pointing at
  `web/ios/App/App/Plugins/Scan/` as the live scan implementation
- [ ] T068 [P] [US4] Update `docs/web.md`: document the Capacitor build (scaffold location,
  `capacitor.config.ts`, the Scan plugin bridge, the static-export auth-gate replacement,
  Keychain session storage)
- [ ] T069 [P] [US4] Update `docs/shared.md`: reframe `shared/test-vectors/` as a single-implementation
  regression suite (not a cross-language lock); document the new `shared/scan-fixtures/` directory
  and its one-time-capture provenance (T034)
- [ ] T070 [P] [US4] Update `README.md`'s architecture blurb to describe one canonical implementation
  delivered per-canvas (Capacitor iOS shell + responsive web), not two implementations
- [ ] T071 [US4] Confirm `iOS/Ortho-iOS/` has zero diffs from this feature's branch point (`git diff
  main...HEAD -- iOS/Ortho-iOS/` is empty) — verifies FR-016's "unmodified in behavior" requirement
- [ ] T072 [US4] [OPERATOR-PENDING] Manually trigger the narrowed `ios-ci.yml` via
  `workflow_dispatch` once and confirm it still reports a clear pass/fail (spec User Story 4
  acceptance scenario 2) — requires a live GitHub Actions run outside this session's automated flow

**Checkpoint**: All four user stories independently functional; engineering transition is
documented and verifiable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final regression pass and closing the loop on anything deferred during story work.

- [ ] T073 Run `cd web && npx tsc --noEmit` and fix any type errors introduced across Phases 2–6
- [ ] T074 Run `cd web && npm test` (full suite) and confirm green, including the new
  `web/test/scan/*`, `web/test/auth/*`, and `web/test/sign-in.test.tsx` suites
- [ ] T075 Run `cd web && npm run gen:vectors && git diff --stat shared/test-vectors/` and confirm
  zero drift (quickstart.md Scenario 7) — proves research.md Decision 9's retirement plan didn't
  break the regression-fixture mechanism
- [ ] T076 Run `cd web && npm run build` (static export) one final time end-to-end (quickstart.md
  Scenario 1)
- [ ] T077 [P] Update `.specify/memory/constitution.md`'s Additional Constraints line if any
  wording drifted during implementation (should already be consistent from the v2.0.0 amendment —
  this is a final consistency check, not new work)
- [ ] T078 [OPERATOR-PENDING] Complete quickstart.md Scenario 8 (session survives force-quit on a
  Capacitor build) on a physical device once T017's CI produces an installable build
- [ ] T079 [OPERATOR-PENDING] Complete the Phase 1 rollout bundle from research.md Decision 11:
  internal TestFlight distribution, dark-launched alongside the still-live native app — an
  App Store Connect / operator action outside this session's scope

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. **BLOCKS all user stories** — nothing is reachable
  to test without a buildable app + working auth gate.
- **User Story 1 (Phase 3)**: Depends on Phase 2 only. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Phase 2 only (not on US1) — the TS parser port (T035–T042)
  has zero dependency on the native-feel work in Phase 3 and can genuinely run in parallel with it;
  the native plugin (T043–T047) is independent of everything except its own fixture prerequisite
  (T034).
- **User Story 3 (Phase 5)**: Depends on Phase 2 only; T060's device verification benefits from US1
  already being on-device but is not blocked by it.
- **User Story 4 (Phase 6)**: Depends on Phase 2 (the migration must exist before docs can describe
  it truthfully) but not on US1–US3's completion — it can start as soon as the Capacitor scaffold
  and auth migration exist.
- **Polish (Phase 7)**: Depends on all of Phases 3–6 being complete.

### Parallel Opportunities

- Within Phase 4 (US2): the TypeScript port (T035–T042) and the Swift plugin (T043–T047, after T034)
  are fully parallel tracks — different files, joined only at T049/T053's wiring step, matching
  plan.md's stated intent ("TypeScript-portable work can proceed in parallel with Swift-plugin work
  once the contracts/scan-plugin-api.md interface is fixed").
- Phases 3, 4, 5, and 6 can all start together once Phase 2 completes, if staffed — each is
  independently testable per its own Independent Test criterion.
- All `[P]`-marked tasks within a phase touch disjoint files and can run concurrently.

### Within Each User Story

- Tests (T009, T019, T035–T037, T054) are written and confirmed failing before their corresponding
  implementation tasks, per the constitution's Principle VI and the spec's Delivery approach.
- Models/types (e.g. T038) before logic that consumes them (T039–T041).
- Implementation before integration/wiring (e.g. T049–T053 after T038–T047).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: quickstart.md Scenarios 1, 2, 4 locally/CI; Scenario 5 on-device
   (T033, operator-pending).
4. This is a legitimate, demoable MVP: a signed-in user can use the whole app natively on iPhone,
   even before scanning or biometrics land.

### Incremental Delivery

1. Setup + Foundational → app builds, auth works.
2. + User Story 1 → native-feel MVP, demo-able.
3. + User Story 2 → scanning restored, demo-able.
4. + User Story 3 → biometrics/haptics/share, demo-able.
5. + User Story 4 → engineering transition complete, CI/docs no longer misleading.
6. Polish → full regression pass, ready for the Phase 1 rollout (research.md Decision 11).

### Notes

- Commit after each task or logical group, consistent with this repo's existing per-feature commit
  granularity (see prior specs' commit history for the pattern: `feat(web/021): ...`,
  `feat(ios/021): ...`, `docs(021): ...`).
- No push-notification, deep-link, or Android tasks are included anywhere above — explicitly out of
  scope per spec FR-019 (research.md Decision 10).

# Tasks: Cross-Platform Parity Remediation

**Feature**: `008-parity-remediation` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Tests are REQUIRED here (Constitution Principle VI): shared golden vectors asserted by **both** suites.
`[P]` = parallelizable (different files, no incomplete deps). Paths are repo-relative.

Conventions: web from `web/` (`export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`), iOS from `iOS/`.
CLI tools (vitest/tsx/xcodebuild/supabase) need `dangerouslyDisableSandbox`.

---

## Phase 1: Setup

- [ ] T001 Confirm the **production** Supabase email OTP code length (Supabase dashboard → Auth → Email, or the length of a real emailed code) and record the canonical value in `specs/008-parity-remediation/research.md` (R4). Local `supabase/config.toml` says 6 but the working iOS 8-digit gate implies otherwise — DO NOT change any gate until this is confirmed.

## Phase 2: Foundational (blocking — enables iOS vector verification for all stories)

- [X] {t} (Xcode hand-off — no safe CLI tooling; File ▸ New ▸ Target ▸ Unit Testing Bundle) Add an XCTest unit-test target to `iOS/Ortho-iOS.xcodeproj`: product type `com.apple.product-type.bundle.unit-test`, `TEST_HOST` = the `Ortho-iOS` app, include the four `iOS/Ortho-iOSTests/*ParityTests.swift` in Compile Sources, add `shared/test-vectors/*.json` to that target's Copy Bundle Resources, and add a test-enabled scheme so `xcodebuild test` runs. (R9)
- [X] T003 Verify `xcodebuild test -project iOS/Ortho-iOS.xcodeproj -scheme Ortho-iOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO` compiles+runs the parity tests. Expected initial state: split/filter/mortgage PASS, **insight tests FAIL** (ID drift) — this is the red state US3 fixes.

---

## Phase 3: User Story 1 — Stay signed in, trust the data (Priority: P1) 🎯 MVP

**Goal**: iOS restores a valid session before the gate renders, refreshes (not drops) expired sessions, tears down on sign-out, and reconciles OTP length + platform-lock with web.

**Independent test**: Sign in, force-quit, relaunch → real data with no sign-in/empty flash; expired session → silent refresh; sign-out → no stale data.

- [X] T004 [US1] In `iOS/Ortho-iOS/App/AppState.swift`, add an auth phase (`launching`/`signedIn`/`signedOut`) and restore `supabase.auth.currentSession` synchronously at init so the phase is known before the first gate render. (R1, FR-001/003)
- [X] T005 [US1] In `iOS/Ortho-iOS/Ortho_iOSApp.swift`, gate the `WindowGroup` on the auth phase, rendering a neutral launch view during `launching` (no `SignInView` flash). (R1, FR-003)
- [X] T006 [US1] In `iOS/Ortho-iOS/App/AppState.swift` `observeAuthChanges`, replace the `isExpired → session=nil` drop with `try await supabase.auth.refreshSession()`; only go `signedOut` when refresh fails. (R2, FR-002)
- [X] T007 [US1] In `iOS/Ortho-iOS/App/AppState.swift` `signOut()`, after `auth.signOut()` clear all domain arrays (`transactions/cards/properties/rentalPayments/budgets/people/households`), `currentHouseholdID`, and `bootstrappedAuthID`. (R3, FR-004)
- [X] T008 [US1] Add `iOS/Ortho-iOS/Services/PlatformLocksAPI.swift` (upsert `platform='ios'` at bootstrap, delete on sign-out, detect an active `web` lock) and wire it into `AppState` bootstrap + `signOut` + a calm "active on another device" state, mirroring web. (R5, FR-006)
- [ ] T009 [US1] (BLOCKED on T001 — production OTP length unconfirmed; iOS left at working 8-gate) Reconcile OTP length: source the verify-gate length/clamp/placeholder/subtitle from one constant == the T001-confirmed length in `iOS/Ortho-iOS/Features/Auth/SignInView.swift` and the web sign-in (`web/app/(app-or-auth path)/.../page.tsx`); fix the iOS subtitle to state the real length. (R4, FR-005) — depends T001
- [ ] T010 [US1] (MANUAL — needs simulator sign-in) Build (`xcodebuild build`) and run quickstart Story 1 scenarios on the simulator: cold-launch restore, expired-refresh, sign-out teardown, OTP, platform-lock. (SC-001/002, FR-007)

**Checkpoint**: Returning users reach their data on cold launch; sign-out is clean. MVP deliverable.

---

## Phase 4: User Story 2 — Splits & people correct and identical (Priority: P2)

**Goal**: Multi-owner income splits on iOS, lossless custom-split edit/copy round-trip, and iOS person rename/recolor — all matching web and golden-vector-locked.

**Independent test**: Custom income split entered on web reads to the cent on iOS and survives a no-op resave; iOS can rename+recolor a person.

- [X] T011 [P] [US2] Add a pure `seedSplit(amountCents, orderedOwners, storedCents) -> {method, values}` to `web/lib/splits.ts` (method=even iff stored == even computeShares, else value with exact cents). (C1, R7)
- [X] T012 [P] [US2] Mirror `seedSplit` in `iOS/Ortho-iOS/Features/Transactions/TransactionSplits.swift` with identical semantics. (C1, R7)
- [X] T013 [US2] Extend `web/scripts/gen-vectors.ts` with income-split + custom-split **edit-prefill** cases and regenerate `shared/test-vectors/transaction-splits.json` (`npm run gen-vectors`). (C1) — depends T011
- [X] T014 [US2] Web Vitest: assert `seedSplit` + income + custom-split round-trip against `transaction-splits.json` in `web/test/` (test-first; red → green). — depends T013
- [X] T015 [US2] iOS XCTest: extend `iOS/Ortho-iOSTests/TransactionSplitParityTests.swift` to assert `seedSplit` + new cases against the same vectors (red → green). — depends T002, T013
- [X] T016 [US2] In `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift`, drop the `kind == .expense` gate so multi-owner **income** shows the split editor and persists shares; fix the caption. (R6, FR-008) — depends T012
- [X] T017 [US2] In `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift`, seed the edit/copy form via `seedSplit` (set `splitMethod=.value` from exact stored cents for custom splits) so re-save round-trips losslessly. (R7, FR-009) — depends T012
- [X] T018 [US2] Add `setPersonColor(_:colorKey:)` to `iOS/Ortho-iOS/App/AppState.swift` (optimistic local update + rollback via `HouseholdsAPI.updatePerson`), mirroring `renamePerson`. (R8, FR-011)
- [X] T019 [US2] Add an edit affordance in `iOS/Ortho-iOS/Features/Settings/HouseholdView.swift`: give `UserRowView` an `onTap` opening an edit sheet (reuse `AddUserSheet` name+swatch UI seeded from the person) whose Save calls `renamePerson`/`setPersonColor`. (R8, FR-011) — depends T018
- [ ] T020 [US2] Validate: both suites green on the new split vectors; manual custom-split round-trip + person rename/recolor per quickstart Story 2. (SC-003/004)

**Checkpoint**: No silent split divergence; people fully editable on iOS.

---

## Phase 5: User Story 3 — Parity automatically enforced (Priority: P3)

**Goal**: iOS insight IDs match the canonical contract and the regenerated vectors; all insight rules covered; the harness (from Phase 2) gates drift.

**Independent test**: `xcodebuild test` green; a deliberate divergence turns it red.

- [X] T021 [US3] Rename the iOS InsightEngine rule-ID prefixes to the canonical web scheme in `iOS/Ortho-iOS/.../InsightEngine*.swift` (e.g. `cashflow-deficit`, `cashflow-savings`) and drop the periodKey suffix from the outlier. (R10, FR-014)
- [ ] T022 [US3] Extend `web/scripts/gen-vectors.ts` to fire all insight rules and regenerate `shared/test-vectors/insights.json`; keep web Vitest green. (R10, FR-014)
- [X] {t} (awaits T002) [US3] Make `iOS/Ortho-iOSTests/InsightParityTests.swift` green against the regenerated `insights.json` (was red from T003). — depends T002, T021, T022
- [X] {t} (awaits T002) [US3] Drift guard: temporarily diverge one vector-locked iOS function, confirm `xcodebuild test` FAILS, then revert. (SC-005, FR-013)

**Checkpoint**: Parity is self-defending on both clients.

---

## Phase 6: User Story 4 — Wide/desktop web shows everything (Priority: P3)

**Goal**: Web ≥1024px reuses shared components (per-owner detail, dashboard drill-down) and a working language→locale picker.

**Independent test**: On a ≥1024px window, split detail shows per-owner amounts; dashboard shows drill-downs; language changes formatting.

- [X] T025 [P] [US4] In `web/components/web/TransactionsDesktop.tsx`, render the shared `components/transactions/TransactionDetailBody.tsx` in the detail pane (per-owner cents + percent). (R11, FR-015)
- [X] T026 [P] [US4] In the web desktop dashboard component, render the shared `SpendByCategoryCard` / `PerOwnerBreakdownCard` / `InsightsCardStack` into its grid instead of trimmed variants. (R11, FR-016)
- [X] T027 [P] [US4] Lift language into `web/lib/store.tsx`: map options → BCP-47 locale, persist, and drive the store `locale` (System → `navigator.language`) so `Intl` formatters re-render. (R12, FR-017)
- [X] T028 [US4] Web tests in `web/test/`: desktop detail shows per-owner shares; language selection drives locale formatting (behavior, not pixels). — depends T025, T027
- [ ] T029 [US4] Validate quickstart Story 4 at ≥1024px (visual + behavior).

**Checkpoint**: Desktop is *more room*, not less capability.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T030 Run the full gates: `cd web && npm test` (green) and `cd iOS && xcodebuild test ...` (green) — both suites pass with money/split/date covered. (SC-007)
- [ ] T031 Update iOS docs minimally (`iOS/ARCHITECTURE.md`, `iOS/Tasks.md`) for the reconciled behaviors; note the ~25 cosmetic gaps are a separate out-of-scope polish PR.
- [ ] T032 Final cross-cluster parity spot-check (same task → same outcome on web + iOS) per SC-008.

---

## Dependencies & Execution Order

- **Setup (T001)** → blocks T009 (OTP).
- **Foundational (T002–T003)** → blocks all iOS vector tasks (T015, T023, T024) and US3.
- **US1 (P1)** is independent of US2/US3/US4 except T009←T001 — deliver first (MVP).
- **US2**: T011/T012 (`seedSplit`) → T013 (vectors) → T014/T015 (tests) → T016/T017 (UI); T018 → T019.
- **US3**: T021 + T022 → T023; needs T002.
- **US4** is fully independent (web-only) — can run anytime; T025/T026/T027 are `[P]`.
- **Polish (T030–T032)** last.

## Parallel Opportunities

- T011 ‖ T012 (web vs iOS `seedSplit`).
- T025 ‖ T026 ‖ T027 (three disjoint web files) — and this whole US4 block can run in parallel with the iOS-heavy US1/US2/US3.
- US4 (web) can proceed concurrently with US1 (iOS) since they share no files.

## Implementation Strategy

1. **MVP = US1** (auth/session): the active blocker — restores trust that you can reach your data.
2. Then **US2** (data correctness) — stop the silent split divergence + enable person editing.
3. Then **US3** (enforce) — lock everything with the now-running iOS vectors.
4. **US4** (web desktop) in parallel throughout (web-only, no iOS contention).
5. Polish gates last.

Total: 32 tasks (US1: 7, US2: 10, US3: 4, US4: 5, Setup: 1, Foundational: 2, Polish: 3).

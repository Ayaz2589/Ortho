# Implementation Plan: Cross-Platform Parity Remediation

**Branch**: `008-parity-remediation` (working on `main`) | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-parity-remediation/spec.md`

## Summary

Close the four high-impact web↔iOS divergence clusters from the parity audit: (1) iOS auth/session
hardening (synchronous session restore, refresh-not-drop, full sign-out teardown, OTP-length +
platform-lock reconciliation), (2) split + people data correctness (multi-owner income splits,
lossless custom-split edit prefill, iOS person rename/recolor), (3) wiring the iOS XCTest parity
target so the shared golden vectors actually run, plus reconciling insight IDs, and (4) making the
web ≥1024px layouts reuse shared components (per-owner detail, dashboard drill-down) and a working
language→locale picker. Approach: behavior is reconciled to a single canonical definition per
divergence, every pure-logic / data-representation change is mirrored in both TS and Swift and locked
by a **shared golden vector asserted by both suites** (Constitution Principle VI). No schema changes.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js 16 (web); Swift 5.9 / SwiftUI, iOS 17+ (iOS)

**Primary Dependencies**: web — Next App Router, Tailwind v4, `@supabase/ssr` + supabase-js; iOS —
supabase-swift (Auth + PostgREST), Observation (`@Observable AppState`)

**Storage**: Supabase Postgres (USD cents). Tables already exist: `transactions`, `transaction_shares`
(person_id + amount_cents), `household_people`, `platform_locks`. **No migrations in this feature.**

**Testing**: web — Vitest (`npm test` → `vitest run`) with golden vectors under `shared/test-vectors/`;
iOS — XCTest. The four `iOS/Ortho-iOSTests/*ParityTests.swift` already exist but are **not wired into
an Xcode test target** (Cluster 3 fixes this). Both suites assert the SAME `shared/test-vectors/*.json`.

**Target Platform**: iOS app (phone-first) + web (compact/medium/expanded breakpoints 0–639 / 640–1023 / 1024+)

**Project Type**: Mobile app + web app sharing a Supabase backend and a shared golden-vector contract

**Performance Goals**: No new perf targets — reconciliation only. Session restore must not add a
perceptible cold-launch delay beyond a brief neutral launch state.

**Constraints**: Constitution Principle VI (test-first, money/date golden-vector-locked, deterministic,
no network in tests); design tokens only; no schema change; preserve the four destinations and the
existing phone/iOS information density (no iOS desktop-style layouts).

**Scale/Scope**: 2 clients, 4 clusters, ~19 FRs. Touches: iOS `App/AppState.swift`,
`Ortho_iOSApp.swift`, `Features/Auth/SignInView.swift`, `Features/Transactions/AddTransactionSheet.swift`,
`Features/Settings/HouseholdView.swift` + `AddUserSheet.swift` + `UserRowView.swift`,
`Services/HouseholdsAPI.swift` (+ a new platform-lock service), `Analytics/InsightEngine`, the xcodeproj
test target; web `components/web/TransactionsDesktop.tsx`, `DashboardDesktop`, `lib/store.tsx`, the
language picker; and `shared/test-vectors/` + `web/scripts/gen-vectors.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | New iOS edit-person sheet + web desktop reuse of shared components use existing tokens/components only; no new palette. |
| II. Calm Over Dense | ✅ PASS | Launch/splash state is a neutral calm state (no shimmer, Principle IV); desktop reuses shared cards — *room to breathe*, no new density. |
| III. Right Form Factor Per Canvas | ✅ PASS | iOS stays phone-first (no desktop layouts added); web desktop reuses shared bodies inside its existing drawer/grid. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | OTP copy reconciled to the true length; no alarmist states; money stays cents→render, tabular. |
| V. Accessible & Interaction-Complete | ✅ PASS | New iOS person-edit affordance is a real control with ≥44px target; web language picker becomes functional + keyboard-reachable. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ PASS (and reinforced) | Every reconciled pure-logic/data change ships a shared golden vector asserted by **both** suites; Cluster 3 is precisely about making the iOS suite actually enforce this. New vectors: income split, custom-split edit-prefill, full insight-rule coverage. Deterministic, injected reference dates, no network. |

**Result**: No violations. The feature *strengthens* Principle VI (it makes the unenforced iOS vectors
enforce). No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/008-parity-remediation/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (canonical behavior per divergence)
├── data-model.md        # Phase 1 — entities + data representations + state transitions
├── quickstart.md        # Phase 1 — how to validate each story
├── contracts/
│   └── parity-contracts.md   # Cross-client behavioral + golden-vector contracts
└── tasks.md             # Phase 2 (/speckit-tasks) — NOT created here
```

### Source Code (repository root)

```text
web/
├── app/(app)/{dashboard,transactions,housing,settings}/   # routes
├── components/web/TransactionsDesktop.tsx                  # Cluster 4: reuse shared detail body
├── components/web/Dashboard*.tsx                           # Cluster 4: reuse shared cards
├── components/transactions/TransactionDetailBody.tsx       # shared per-owner detail (reused on desktop)
├── lib/store.tsx                                           # Cluster 4: language→locale; auth/session ref
├── lib/splits.ts, lib/finance/insights.ts                 # parity sources of truth
├── scripts/gen-vectors.ts                                 # extend: income split, custom-split, all insights
└── test/                                                   # Vitest

iOS/Ortho-iOS/
├── Ortho_iOSApp.swift                                      # Cluster 1: synchronous gate + launch state
├── App/AppState.swift                                      # Cluster 1: restore/refresh/teardown; Cluster 2: setPersonColor
├── Features/Auth/SignInView.swift                          # Cluster 1: OTP length + copy
├── Features/Transactions/AddTransactionSheet.swift         # Cluster 2: income split + custom-split prefill
├── Features/Settings/{HouseholdView,AddUserSheet,UserRowView}.swift  # Cluster 2: edit person
├── Services/HouseholdsAPI.swift (+ PlatformLocksAPI.swift) # Cluster 1: platform_locks
├── Analytics/ (InsightEngine)                              # Cluster 3: canonical insight IDs
└── Ortho-iOSTests/*ParityTests.swift                       # Cluster 3: wire into XCTest target

iOS/Ortho-iOS.xcodeproj                                     # Cluster 3: add unit-test target + bundle vectors
shared/test-vectors/*.json                                 # the cross-client contract (regenerated)
```

**Structure Decision**: Existing mobile-app + web-app monorepo with a shared golden-vector contract.
No new top-level structure; this feature edits existing files and adds (a) an iOS `PlatformLocksAPI`,
(b) an iOS person-edit sheet, (c) an Xcode unit-test target, and (d) new/extended golden vectors.

## Implementation Approach by Cluster

Detailed decisions live in `research.md`; data shapes in `data-model.md`; contracts in
`contracts/parity-contracts.md`. Summary of the technical approach:

**Cluster 1 — Auth/session (iOS)**
- Synchronous restore: read `supabase.auth.currentSession` in `AppState` init (or a `@State` launch
  task that completes before the gate) so `Ortho_iOSApp` can decide signed-in/out without waiting on the
  async `authStateChanges` first emission; add an explicit `.launching` phase rendering a neutral splash.
- Replace the `isExpired → session = nil` drop in `observeAuthChanges` with
  `try await supabase.auth.refreshSession()`; only fall to signed-out when refresh truly fails.
- `signOut()`: after `auth.signOut()`, clear all domain arrays + `currentHouseholdID` + `bootstrappedAuthID`
  (or do this whenever the session transitions to nil) so re-sign-in re-bootstraps cleanly.
- OTP length: source from one shared constant per client; **confirm the production length first** (see
  research — local `config.toml` says 6, but the working iOS 8-gate implies production differs); reconcile
  the gate + clamp + placeholder + subtitle copy on both clients to the confirmed value.
- platform_locks: add `PlatformLocksAPI` (upsert `platform='ios'` at bootstrap, delete on sign-out, evict
  when an active `web` lock is present) mirroring web's wiring, OR remove web's machinery — decision in research.

**Cluster 2 — Split + people correctness**
- iOS `AddTransactionSheet`: drop the `kind == .expense` gate on the split editor so multi-owner income
  splits like web; fix the caption.
- Custom-split edit/copy prefill: when seeding the form from a stored tx, detect a non-even split (compare
  `effectiveShares` to even `computeShares`) and seed `splitMethod = .value` from the exact stored cents so
  re-save round-trips losslessly. Mirror web's existing detection. Lock with a new edit-prefill vector.
- iOS person edit: add `AppState.setPersonColor` (optimistic + rollback via `HouseholdsAPI.updatePerson`,
  mirroring `renamePerson`); give `UserRowView` an `onTap` opening an edit sheet (reuse `AddUserSheet` UI
  seeded from the person) wired to `renamePerson` + `setPersonColor`.

**Cluster 3 — Enforce parity**
- Add an XCTest unit-test target to `Ortho-iOS.xcodeproj` (TEST_HOST = Ortho-iOS), add the four
  `*ParityTests.swift` to Compile Sources, add `shared/test-vectors/*.json` to that target's Copy Bundle
  Resources, add a test-enabled scheme so `xcodebuild test` runs.
- Reconcile iOS `InsightEngine` IDs to the canonical web scheme (from the README contract); drop the
  outlier's periodKey suffix. Extend `gen-vectors.ts` to fire all insight rules so every rule is vectored.

**Cluster 4 — Web desktop capability**
- `TransactionsDesktop` detail pane → render shared `TransactionDetailBody` (per-owner cents + percent).
- `DashboardDesktop` → render shared `SpendByCategoryCard` / `PerOwnerBreakdownCard` / `InsightsCardStack`
  into its grid cells instead of trimmed variants.
- Language: lift language into `lib/store.tsx`, map options → BCP-47 locale, drive the store `locale` (used
  by `Intl` formatters) and persist; "System" → `navigator.language`.

## Complexity Tracking

> No Constitution violations — section intentionally empty.

The only non-trivial mechanical risk is editing `Ortho-iOS.xcodeproj` to add a test target (pbxproj
surgery). Mitigation: prefer creating the target via a deterministic pbxproj edit validated by
`xcodebuild -list` + a green `xcodebuild test`; the project uses objectVersion 77 filesystem-synchronized
groups, so source/resource membership is largely automatic once the target + scheme exist.

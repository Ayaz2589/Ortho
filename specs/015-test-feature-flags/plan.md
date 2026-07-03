# Implementation Plan: Test-Build Feature Flags (Test Data + Auth Bypass)

**Branch**: `015-test-feature-flags` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-test-feature-flags/spec.md`

## Summary

Add a **Developer** feature-flag section to Settings on both surfaces with two switches — **Use
test data** and **Bypass auth** — that let a tester exercise the whole app against an isolated,
in-memory sample dataset without ever writing to the shared live Supabase backend, and (bypass)
without signing in. The section and every code path the flags gate are **compiled/environment-gated
out of production** (iOS: `#if DEBUG` OR TestFlight sandbox receipt, forced `false` in App Store
Release; web: `NEXT_PUBLIC_*` build-env gate that dead-code-eliminates from the prod bundle, plus a
cookie so the server-side `proxy.ts` gate can honor bypass). Test-data isolation is achieved by
gating the network half of every optimistic mutator (iOS) / swapping the single Supabase client
handle for an in-memory fake (web) — never by writing a "test household" to the live tables. The
work also **modernizes the outdated sample dataset** (it predates the User→Person owner migration):
introduce `Person.sample`, set `paidBy`, add `Budget`/`RentalPayment` samples, widen the date span
to multiple months, and keep owners Person-keyed so balances/settle-up/splits resolve. Feature is
outside the golden-vector harness; PARITY.md records the per-surface gating divergence. iOS is
verified via CI (Linux sandbox can't build iOS); web via `npm test` locally.

## Technical Context

**Language/Version**: Swift 5.9 / SwiftUI (iOS, iOS 26); TypeScript 5 / Node 22 + Next.js 16 +
React 19 (web)

**Primary Dependencies**: SwiftUI + supabase-swift (iOS); Next.js 16 (modified — see
`web/AGENTS.md`), `@supabase/ssr` + `@supabase/supabase-js`, Vitest 3, Tailwind v4 (web). **No new
runtime dependency introduced.**

**Storage**: No backend/schema change. New per-device/browser flag persistence only —
iOS `@AppStorage`/`UserDefaults` (keys prefixed `ff_`); web `localStorage` (key `ortho.flags`) via
a `flags.ts` module mirroring `components/settings/appearance.ts`, plus a `ortho_bypass_auth`
cookie for the `proxy.ts` gate. Sample dataset is purely in-memory.

**Testing**: Web — Vitest (`cd web && npm test`), new behavior tests for the Developer section,
flag persistence, production force-off, and no-live-writes-in-test-mode; iOS — XCTest via
`.github/workflows/ios-ci.yml` (macOS runner) plus the `-uiDemo` simulator-screenshot artifact
(the refreshed sample data will visibly change these — expect re-baseline).

**Target Platform**: iOS 26 app (DEBUG + TestFlight test builds carry the section; App Store
Release does not); modern browsers on non-production web deploys (dev/preview).

**Project Type**: Monorepo — mobile app + web app over one shared Supabase backend, normally
parity-locked by golden vectors. This feature is **outside** that harness (no money/date math).

**Performance Goals**: N/A beyond existing budgets. Enabling a flag → fully populated test app in
< 10 s (SC-005). No added latency to the normal (flags-off) path — the flag checks are cheap
boolean reads and, in production, dead-code-eliminated.

**Constraints**: Linux sandbox cannot build/test iOS — iOS verification is CI-only (draft PR;
`ios-ci.yml` runs on PRs touching `iOS/**`). Live shared backend — the **no-live-writes** guarantee
is the central safety requirement and is tested. Public repo — no secrets in committed files. The
web app runs a modified Next.js: middleware is `proxy.ts` (not `middleware.ts`); read
`node_modules/next/dist/docs/` before touching routing. Linux-arm64 sandboxes need the native
binaries (`@rolldown/binding-linux-arm64-gnu`, `lightningcss-linux-arm64-gnu`,
`@tailwindcss/oxide-linux-arm64-gnu`, `@next/swc-linux-arm64-gnu`) installed before `vitest`/`next`.

**Scale/Scope**: 2 flags; 1 refreshed sample dataset per surface; ~1 new Settings section per
surface; iOS — new `FeatureFlags` store + `TestBuild` detector + `Person.sample`/`Budget.sample`/
`RentalPayment.sample` + modernized `Transaction.sample` + guarded mutators in `AppState`; web —
new `flags.ts` + `TestBuild` gate + in-memory Supabase fake (adapted from `test/helpers/`) + store
bootstrap branch + `proxy.ts` cookie check + Developer section in Settings. No DB migration, no new
golden vector, no new dependency.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ Pass | New Settings section reuses existing tokens (`AppTheme` / `globals.css`) and section/row primitives (`sectionLabel`+surface card / `SectionCard`+`ChoiceRow`). No new colors, no new palette. |
| II. Calm Over Dense (NON-NEGOTIABLE) | ✅ Pass | One extra Settings section of at most 2–3 rows + a grey caption; hairline dividers; no gradients/shadows/saturated status color. Matches the existing DEBUG "Developer" section rhythm. |
| III. Right Form Factor Per Canvas | ✅ Pass | iOS uses the native Settings list idiom; web uses `ReadingColumn` (560px) with the same section pattern. No layout invention. |
| IV. Plainspoken Voice & Money Formatting | ✅ Pass | Copy is plain ("Use test data", "Bypass auth", "Only visible on test builds"). No money-format change. Reuse the pre-seeded i18n keys where they fit; add English source + all five catalogs. |
| V. Accessible & Interaction-Complete | ✅ Pass | Rows are real semantic controls (SwiftUI `Button`/`Toggle`; web `<button>`/`role=switch`), keyboard-reachable, sand focus ring on web, ≥44px touch targets. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ Pass | Behavior-first: web Vitest specs for gating/persistence/production-off/no-live-writes precede the code; iOS XCTest for the flag store + sample-data integrity + no-network-in-test-mode. No golden vectors needed (no finance/date math) — FR-019. |

**Result**: PASS. No violations; Complexity Tracking not required. One design-level note carried
into research: the two surfaces necessarily gate by *different* mechanisms (compile-time vs
build-env) — this is an intentional, documented per-surface divergence (FR-020), not a constitution
deviation.

## Project Structure

### Documentation (this feature)

```text
specs/015-test-feature-flags/
├── plan.md              # This file
├── research.md          # Phase 0 — the load-bearing decisions (gating, isolation, toggle semantics)
├── data-model.md        # Phase 1 — flag registry + refreshed sample dataset shape
├── quickstart.md        # Phase 1 — how to validate each surface
├── contracts/
│   ├── feature-flags.md     # The flag registry contract (names, defaults, gating, force-off)
│   └── test-data-store.md   # The isolation contract (no live reads/writes in test mode)
├── checklists/
│   └── requirements.md  # Spec quality checklist (done)
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
iOS/Ortho-iOS/
├── App/
│   ├── Ortho_iOSApp.swift          # gate: choose seeded-vs-empty AppState; skip observeAuthChanges under bypass
│   ├── AppState.swift              # guard the Task{} network hop in every mutator on testDataEnabled; skip bootstrap under bypass
│   └── RootTabView.swift           # (unchanged; already reads -uiDemoTab)
├── Config/                          # NEW
│   ├── FeatureFlags.swift          # NEW — @Observable flag store, @AppStorage-backed, forced-false in Release
│   └── TestBuild.swift             # NEW — isTestBuild = #if DEBUG || TestFlight sandboxReceipt; false in App Store
├── Features/Settings/
│   ├── SettingsView.swift          # add the Developer→Feature Flags section (toggle rows) under the test-build gate
│   └── FeatureFlagRowView.swift    # NEW — toggle row matching the Settings row language
├── Models/
│   ├── Person.swift                # NEW Person.sample factory
│   ├── Transaction.swift           # modernize .sample: Person owners, paidBy, wider dates, transfer rows
│   ├── Budget.swift                # NEW Budget.sample
│   ├── Property.swift              # (has .sample) — add RentalPayment.sample alongside
│   └── RentalPayment.swift         # NEW RentalPayment.sample
└── Ortho-iOSTests/
    ├── FeatureFlagsTests.swift     # NEW — gating, persistence, Release force-off
    ├── SampleDataTests.swift       # NEW — Person-keyed owners, non-empty balances, month span, no sample UUID escapes
    └── TestDataIsolationTests.swift# NEW — mutators issue no network call when testDataEnabled

web/
├── lib/
│   ├── flags.ts                    # NEW — readFlags/writeFlags (localStorage 'ortho.flags') + cookie for bypass; mirrors appearance.ts
│   ├── test-build.ts               # NEW — isTestBuild() from NEXT_PUBLIC_* / NODE_ENV (build-time, dead-code-eliminable)
│   ├── testdata/
│   │   ├── seed.ts                 # NEW — Person-centric in-memory dataset (from test/helpers/fixtures.ts, no vitest import)
│   │   └── memory-client.ts        # NEW — in-memory Supabase-shaped fake (from test/helpers/supabase-mock.ts, no vitest import)
│   ├── supabase/client.ts          # return the in-memory fake when the test-data flag is on (test build only)
│   └── store.tsx                   # bootstrap branch: seed from memory client / skip getUser under bypass; neuter SIGNED_OUT redirect
├── proxy.ts                        # honor the bypass cookie (test-build env only) to skip the /sign-in redirect
├── components/settings/
│   ├── flags-section.tsx           # NEW — Developer section, gated on isTestBuild()
│   └── rows.tsx / ChoiceRows.tsx   # reuse SectionCard/ChoiceRow (add a switch-style row if wanted)
├── app/(app)/settings/page.tsx     # render <FlagsSection/> (self-gates)
├── lib/i18n/{en source + bn,es,ja,zh,ko}.ts  # add "Developer"/"Use test data"/"Bypass auth"/caption keys (catalog-parity lock)
└── test/
    ├── settings/flags-section.test.tsx   # NEW — visibility gating (test vs prod env), toggle persistence
    ├── flags/flags.test.ts               # NEW — read/write, production force-off
    └── store/test-data-isolation.test.tsx# NEW — with flag on, no live client is constructed / no writes escape
```

**Structure Decision**: Monorepo, two surfaces edited in parallel-but-independent trees. iOS gates
at **compile/receipt time** (`TestBuild.isTestBuild`), web gates at **build-env time**
(`isTestBuild()`), and both persist flags with each surface's native preference mechanism. The
isolation seam differs per surface by necessity: iOS guards the `Task { …API… }` network hop inside
`AppState` mutators (the in-memory arrays already drive the UI under `@Observable`); web swaps the
single `createClient()` handle for an in-memory fake (the seam its own tests already exploit via
`vi.mock`). Neither approach constructs a live-backend call in test mode — that is the contract in
`contracts/test-data-store.md`.

## Complexity Tracking

> No constitution violations — section intentionally empty.

The only notable complexity is the **per-surface asymmetry** of gating and isolation, which is
inherent to the platforms (Swift compile flags vs JS build env; a concrete `SupabaseClient` SDK
type that can't be faked at the client level vs a `createClient()` factory that can). This is
documented, not hidden, and recorded in PARITY.md per FR-020.

# Quickstart: Validating the Capacitor iOS Consolidation

Prerequisites and runnable scenarios that prove this feature works end-to-end. This is a validation
guide, not an implementation guide — see `tasks.md` for the build-out itself.

## Prerequisites

- Node 22 (`.nvmrc`), `cd web && npm install`.
- `web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see
  `CI-SETUP.local.md` if present).
- **macOS + Xcode required for anything native** (building `web/ios/App`, running the Scan plugin,
  capturing scan fixtures). This Linux sandbox can validate everything up to and including the
  static export and the ported TypeScript scan-parser tests, but not the native plugin itself or a
  simulator/device run — that feedback comes from `capacitor-ios-ci.yml` on a macOS runner, mirroring
  today's `ios-ci.yml` pattern (`docs/index.md` §5).

## Scenario 1 — Static export builds with no server dependency

```bash
cd web
npm run build          # next build, output: 'export' → web/out/
```

**Expected**: build succeeds with zero references to `proxy.ts` (deleted), `web/out/` contains a
fully static site, and `next build`'s output log shows no Route Handler / Server Action warnings
(there were none to begin with — see research.md Decision 2).

## Scenario 2 — Client-side auth gate behaves like the old server-side gate

```bash
cd web && npm test -- sign-in
```

**Expected**: covers (a) a signed-out visitor hitting a protected route is redirected to
`/sign-in`, (b) a signed-in user hitting `/sign-in` is redirected to `/dashboard`, (c) the
`bypassAuth` test-flag path still works reading `localStorage` directly (no cookie). These replace
`proxy.ts`'s prior behavior at the three call sites in research.md Decision 2 / plan.md Project
Structure.

## Scenario 3 — Ported scan parser matches the native app's fixture behavior

```bash
cd web && npm test -- scan
```

**Expected**: the new `web/test/scan/` suite, running against `shared/scan-fixtures/*.json` (frozen
`ScanDocumentText` captured once from the still-intact native extractor — see Scenario 6), produces
the same `ParsedCandidate` results the existing `ScanParserTests.swift` asserts today, satisfying
spec SC-003. Includes the ~dozen pure `ScanHeuristics` unit tests transliterated directly (no fixture
dependency).

## Scenario 4 — Capacitor scaffold builds on macOS CI

Triggered on push/PR touching `web/**` via the new `capacitor-ios-ci.yml` (see plan.md):

```bash
cd web
npm run build
npx cap sync ios
xcodebuild build -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator'
```

**Expected**: `** BUILD SUCCEEDED **`, mirroring the existing `iOS/Ortho-iOS` verification pattern
in `iOS/ARCHITECTURE.md`'s own Verification section.

## Scenario 5 — Native-feel checklist (manual, on a physical device — required before any TestFlight submission)

Run through spec User Story 1's acceptance scenarios on a real iPhone (not just Simulator — several
keyboard/bounce issues are documented as reproducing only on hardware, research.md report §7):

1. Force-quit and relaunch while signed in → lands on data, no re-auth prompt (FR-003).
2. Every screen: no content under the status bar/notch/home indicator (FR-004).
3. Focus a text field on every form (transaction add/edit, property add/edit, settings) → field
   never hidden by keyboard (FR-005).
4. Scroll any list to its edge → no rubber-band bounce, no text-selection callout (FR-006).
5. Toggle device appearance light/dark → status bar and launch screen match (FR-007).

This is spec SC-004 ("zero violations before any public release") — track results as a checklist
artifact when this scenario is actually run (not fabricated from this guide).

## Scenario 6 — Capturing frozen scan fixtures (one-time, macOS)

Before or alongside porting the Scan plugin, run the still-intact `ScanTextExtractor.swift` against
each fixture in `iOS/Ortho-iOS/Resources/ScanFixtures/` and serialize its `ScanDocumentText` output
to JSON under `shared/scan-fixtures/<name>.json`. This is a one-time capture — `iOS/Ortho-iOS/` is
frozen and this script is not meant to be re-run routinely; see research.md Decision 6.

## Scenario 7 — Golden-vector regression suite still passes

```bash
cd web && npm test && npm run gen:vectors && git diff --stat shared/test-vectors/
```

**Expected**: full suite green, `git diff` empty (no drift) — confirms Decision 9's retirement plan
kept the regression-fixture mechanism intact and working, only reframed in documentation/CI trigger
scope, not broken.

## Scenario 8 — Session persists like a native app (device, post-plugin-integration)

1. Sign in via the 8-digit OTP flow on the Capacitor build.
2. Force-quit the app (swipe up, not just background).
3. Relaunch.

**Expected**: still signed in, no re-entry of credentials (FR-003, SC-002) — validates the Keychain
storage adapter (contracts/session-storage-adapter.md) actually persists across process death, which
cookie/localStorage-based storage in a WKWebView is not guaranteed to do.

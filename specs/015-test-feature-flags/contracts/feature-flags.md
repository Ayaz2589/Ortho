# Contract: Feature Flag Registry & Gating

Binding rules for the flag system on both surfaces. Tests assert these.

## C-FF-1 — Flags exist and default OFF

- Flags: `useTestData`, `bypassAuth`. Both default `false`.
- A fresh install / cleared storage reads both as `false`.

## C-FF-2 — Effective test-data derivation

- `effectiveUseTestData = useTestData || bypassAuth`.
- The data layer keys off `effectiveUseTestData`; the UI shows the raw `useTestData` toggle.
- Turning `bypassAuth` ON while `useTestData` is OFF still yields test data.

## C-FF-3 — Test-build gating (visibility)

- The Developer/Feature-Flags Settings section renders **iff** the surface reports a test build:
  - iOS: `TestBuild.isTestBuild` (`#if DEBUG` OR TestFlight sandbox receipt).
  - web: `isTestBuild()` (`NEXT_PUBLIC_VERCEL_ENV !== 'production'`, fallback `NODE_ENV !== 'production'`).
- On a non-test build the section is absent (iOS: compiled/branched out; web: dead-code-eliminated).

## C-FF-4 — Production force-off (the safety invariant)

- On a non-test build, `useTestData` and `bypassAuth` MUST read `false` **regardless of any persisted
  value** (a value written on an earlier test build, or a hand-edited `localStorage`/cookie).
- Therefore no test-data seeding or auth-bypass code path is reachable in production.
- iOS: the `FeatureFlags` getters return `false` unless `TestBuild.isTestBuild`.
- web: `readFlags()` returns `{false,false}` unless `isTestBuild()`; `proxy.ts` ignores the cookie
  unless `isTestBuild()`.

**Test**: set the persisted value to "on", force the non-test-build signal, assert behavior is
identical to flags never existing (FR-003, SC-004).

## C-FF-5 — Persistence

- Flag state persists across relaunch on a test build.
- iOS keys: `ff_useTestData`, `ff_bypassAuth` (UserDefaults). web: `localStorage['ortho.flags']`
  (JSON) + `ortho_bypass_auth` cookie mirroring `bypassAuth`.
- Namespaced away from existing prefs (iOS `appearance`/`language`; web
  `appearance`/`currency`/`language`/`fxRates`/`fxRatesFetchedAt`/`localUsers`).

## C-FF-6 — UI conforms to the design system

- Rows use existing Settings section/row primitives and tokens only; no new colors; hairline
  dividers; a grey caption "Only visible on test builds." Real semantic toggle controls,
  keyboard-reachable, ≥44px touch targets, sand focus ring on web (constitution I/II/V, FR-017).

## C-FF-7 — Extensibility

- The registry is a small typed list so a future flag is one entry + one row, no re-architecture.

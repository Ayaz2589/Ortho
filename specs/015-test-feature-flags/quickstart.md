# Quickstart: Validating Test-Build Feature Flags

How to prove the feature works on each surface. References `contracts/feature-flags.md` and
`contracts/test-data-store.md`.

## Web (local, Linux sandbox OK)

Prereqs: `cd web && npm install` (on Linux-arm64 also
`npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save`).

**Automated (authoritative):**

```bash
cd web && npm test
```

New specs must cover:
- `test/flags/flags.test.ts` — read/write round-trip; production force-off (C-FF-4).
- `test/settings/flags-section.test.tsx` — section renders under a test env, absent under
  production env (C-FF-3); toggling persists (C-FF-5).
- `test/store/test-data-isolation.test.tsx` — with the flag on, the real browser client is never
  constructed and no write escapes the in-memory fake (C-TD-1); toggling off restores live bootstrap
  (C-TD-3).

Full suite must stay green (baseline was 619+ tests) and `lib/` coverage at threshold.

**Manual (optional):** run `npm run dev`, open Settings → Developer, toggle **Use test data**, add a
transaction, confirm it appears and that no request hit Supabase (network tab / no new row). Toggle
off → real data returns unchanged. Toggle **Bypass auth**, reload → lands on the tabs without
sign-in.

## iOS (CI only — Linux cannot build iOS)

Push to the branch (draft PR) and watch:

```bash
GH_TOKEN=placeholder gh run watch --exit-status
```

`.github/workflows/ios-ci.yml` builds and runs XCTest. New test files
(`FeatureFlagsTests`, `SampleDataTests`, `TestDataIsolationTests`) must be added to the test target
in `project.pbxproj` (test target is not filesystem-synced; new **app** files are auto-included).

XCTest must cover:
- Flag store defaults + persistence + Release force-off (C-FF-1, C-FF-4, C-FF-5).
- Sample-data integrity: Person-keyed owners, non-empty member balances, ≥2-month span, no sample
  UUID in any create payload (C-TD-1, C-TD-3; SC-003).
- Mutators issue no API call when `testDataEnabled` (C-TD-1) — via an injected no-op/spy API seam.

**Visual check:** the CI `simulator-screenshots` artifact is captured in `-uiDemo` mode; the
refreshed sample data will change these across all four tabs — download and eyeball them (balances
non-empty, budgets present, housing populated). Treat the screenshot change as expected and
intentional.

## Production safety check (both surfaces)

- iOS: a Release-config build must not show the Developer section, and a pre-set `ff_useTestData=true`
  in UserDefaults must not change behavior (verified by the Release-path unit test; a full Release
  build check is an operator step).
- web: `NEXT_PUBLIC_VERCEL_ENV=production npm run build` must produce a bundle without the Developer
  section, and a hand-set `localStorage['ortho.flags']` / `ortho_bypass_auth` cookie must be ignored
  (C-FF-4, C-TD-6, SC-004).

## Done when

- `cd web && npm test` green including the new specs.
- iOS CI green; screenshots inspected and re-baselined mentally.
- PARITY.md updated with the per-surface gating divergence note (FR-020).

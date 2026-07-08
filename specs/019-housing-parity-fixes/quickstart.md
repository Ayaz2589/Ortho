# Quickstart: Validating the Housing Parity Fixes

Prerequisites: Node 22 (`.nvmrc`), `cd web && npm install`. iOS validation is CI-only (macOS).

## Web — run the regression suites (test-first)

```bash
cd web

# 1. Timezone-pinned lease/date tests (US1) — the bug only reproduces west of UTC.
#    The tests inject asOf and pin TZ; also sanity-run the whole file under an explicit TZ:
TZ=America/New_York npx vitest run test/housing-lease.test.ts

# 2. Net-rental parity vector (US2) — regenerate then assert.
npm run gen:vectors                       # emits shared/test-vectors/housing-net-rental.json
npx vitest run test/housing-net-rental.parity.test.ts

# 3. Amortization month labels (US4) and rate round-trip (US3)
npx vitest run test/mortgage.parity.test.ts test/property-edit.test.tsx

# 4. Full suite + typecheck — nothing else moved (SC-005)
npm test
npx tsc --noEmit
```

**Expected**: all green; `git diff shared/test-vectors/` shows **only** the new
`housing-net-rental.json` (mortgage/insights/etc. vectors unchanged — zero drift, SC-005).

## Web — eyeball the behavior

- `TZ=America/New_York`: a lease starting on the 1st shows rent-due day = 1 and "Sep 1, 2025" (not
  Aug 31); a payment logged Dec 1 shows "Dec 1"; the closing caption names the right month.
- A multifamily with one vacant unit shows the **same** net figure on the Dashboard and the property
  page (both occupied-only).
- Editing a 6.375% property and saving keeps 6.375%.
- Opening the amortization schedule on a month-end date labels months in order (no missing Feb).

Optional visual check: `npm run dev` and open `/housing` and the dashboard housing card.

## iOS — CI validation (no local Xcode)

```bash
git push origin 019-housing-parity-fixes
GH_TOKEN=placeholder gh run list --workflow=ios-ci.yml --limit 3
GH_TOKEN=placeholder gh run watch <run-id> --exit-status
```

**Expected**: the iOS build compiles the Swift net-rental mirror + the new
`HousingNetRentalParityTests`, the new vector JSON is bundled (via the `project.pbxproj`
Copy-Bundle-Resources entry), and all `*ParityTests` pass. If a "new vector fails only on CI" error
appears, the pbxproj Copy-Bundle entry is missing (`CI-SETUP.local.md` §6).

**Xcode note for the owner**: after pulling these changes, if Xcode warns "backing file modified
outside Xcode," take the **file-system** version — never "Keep Xcode Version" — or the new test/vector
target registrations are dropped.

## Done when

- SC-001…SC-006 hold: dates correct in all timezones; Dashboard == detail net figure (web + iOS via
  vector); no-op edit changes nothing; amortization labels correct at month-end; both suites green with
  zero unrelated vector drift; docs reconciled.

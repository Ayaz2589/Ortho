# Implementation Plan: Housing Correctness & Web↔iOS Parity Fixes

**Branch**: `019-housing-parity-fixes` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-housing-parity-fixes/spec.md`

## Summary

Fix five Housing defects that show wrong data and/or break web↔iOS parity, test-first:
(1) route all web date-only values through a local-calendar parser so lease/payment/closing
dates stop shifting a day in western timezones; (2) unify "net rental income" on the
**occupied-only** computation across the Dashboard and the property page, on both platforms,
pinned by a **new golden vector**; (3) preserve full mortgage-rate precision on property edit;
(4) label the amortization schedule by whole calendar months (clamped) instead of overflowing
`setMonth`; (5) make unit vacancy a **deliberate** state so a rent-earning unit is never dropped.
Fixes 1/3/4 restore web to the already-correct iOS behavior; 2/5 change both surfaces in
lockstep. Then reconcile the docs. The vector-locked mortgage math and the DB schema are
untouched.

## Technical Context

**Language/Version**: TypeScript (web, Next.js App Router + React 19) and Swift (iOS, SwiftUI).
Node 22 (`.nvmrc`).

**Primary Dependencies**: Web — Vitest, Tailwind v4, Supabase JS. iOS — XCTest, SwiftUI,
Apple Charts (amortization chart). Shared — golden test vectors under `shared/test-vectors/`.

**Storage**: Supabase Postgres (`properties`, `mortgage_info`, `lease_info`, `units`,
`rental_payments`). **No schema change** in this feature; date columns are `date`, rate is
`numeric(7,4)`, money is `bigint` USD cents.

**Testing**: Web `npm test` (Vitest); iOS `xcodebuild test` on CI (macOS). New: timezone-pinned
Vitest for lease/date logic; a shared golden vector (`housing-net-rental.json`) asserted by both
a new web `*.parity.test.ts` and a new iOS `*ParityTests.swift`.

**Target Platform**: iOS 26+ app and responsive web (compact→expanded).

**Project Type**: Mobile-canonical + web mirror over one Supabase backend (per `docs/index.md`).

**Performance Goals**: N/A — all changes are O(units) pure computations rendered instantly.

**Constraints**: Linux sandbox **cannot build/test iOS** — iOS is validated via the
`ios-ci.yml` macOS run after push. Money stays integer USD cents; dates are local calendar
dates. The user runs Xcode against this same working tree, so pbxproj/xcstrings edits may
trigger "modified outside Xcode" warnings — they must take the **file-system** version.

**Scale/Scope**: ~8 web files, ~5 iOS files, 1 new shared vector (+ its two consumers +
pbxproj entry), 4 docs. No migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. The only new UI is a "Vacant/Occupied" affordance
  in the unit editor (US5); it must use existing tokens and the calm patterns (no new color; the
  existing `text-destructive` "Vacant" treatment already exists). No palette additions.
- **II. Calm Over Dense** — PASS. No new density; the net-rental change removes a misleading number,
  it doesn't add chrome.
- **III. Right Form Factor** — PASS. No layout/navigation change; the same figure renders on
  compact and expanded canvases.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Net rental keeps money-as-money, `+`/Unicode
  `−`, tabular; **loss is never red** (the net-balance card already uses `--text` for negatives).
- **V. Accessible & Interaction-Complete** — PASS. A vacancy toggle (US5) is a real semantic control
  with a focus ring and ≥44px touch target.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS by construction: every fix is a
  money/date computation and lands **test-first** — timezone-pinned Vitest for dates, a golden
  vector for net-rental asserted on both platforms, an edit-round-trip test for rate precision, and
  a month-label test for amortization. Existing vectors stay green; the mortgage math is untouched.

**No violations — Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/019-housing-parity-fixes/
├── plan.md              # This file
├── research.md          # Decisions D1–D8 (Phase 0)
├── data-model.md        # Entities + the net-rental vector shape (Phase 1)
├── quickstart.md        # How to validate web locally + iOS on CI (Phase 1)
├── contracts/
│   └── housing-logic.md # Pure-function contracts + golden-vector schema (Phase 1)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── format.ts                       # host `parseLocalDate` here (shared local-date parser)
│   └── finance/
│       ├── mortgage.ts                 # FIX US4: calendar-month iteration; import parseLocalDate
│       └── housing.ts                  # NEW: occupiedRentCents(), netRentalCents() — shared, vectored
├── components/
│   ├── housing/
│   │   ├── lease.ts                    # FIX US1: parseLocalDate for rentDueDay/daysUntil*; clamp due day
│   │   ├── RentalCards.tsx             # FIX US1: local parse for lease/payment date display
│   │   ├── MortgageCards.tsx           # FIX US1: local parse for closing-date caption
│   │   ├── MultifamilyCards.tsx        # FIX US2/US5: use shared netRentalCents; deliberate vacancy
│   │   ├── AddPropertyModal.tsx        # FIX US3: full-precision rate round-trip; US5 vacancy toggle
│   │   └── ...
│   ├── dashboard/HousingSnapshotCard.tsx   # FIX US2: use shared netRentalCents (occupied-only)
│   └── web/DashboardDesktop.tsx            # FIX US2: housingSummary() uses shared netRentalCents
├── scripts/gen-vectors.ts              # emit housing-net-rental.json from web/lib/finance/housing.ts
└── test/
    ├── housing-lease.test.ts           # NEW: timezone-pinned lease/date tests (US1)
    ├── housing-net-rental.parity.test.ts   # NEW: asserts the shared vector (US2)
    ├── mortgage.parity.test.ts         # EXTEND: assert amortization month labels (US4)
    └── property-edit.test.tsx          # NEW: rate-precision round-trip (US3)

iOS/Ortho-iOS/
├── Models/Property.swift               # occupiedMonthlyRentCents / vacancy (US2/US5)
├── Shared/HousingMath.swift            # NEW (or in Property.swift): mirror netRentalCents (US2)
├── Features/Dashboard/Widgets/HousingSnapshotCard.swift  # FIX US2: occupied-only net
├── Features/Housing/MultifamilyCards.swift               # (already occupied-only) confirm parity
├── Features/Housing/AddPropertySheet.swift               # verify US3 rate precision; US5 vacancy
└── Ortho-iOSTests/HousingNetRentalParityTests.swift      # NEW: assert the shared vector

shared/test-vectors/housing-net-rental.json   # NEW golden vector (needs pbxproj Copy-Bundle entry)

docs/  → shared.md (date invariant), web.md, ios.md (Housing), PARITY.md (matrix + divergences)
```

**Structure Decision**: Keep the existing mobile-canonical + web-mirror layout. Introduce one new
shared pure module (`web/lib/finance/housing.ts` ↔ Swift mirror) so the net-rental figure has a
single vectored source of truth, exactly like the other cross-surface finance engines.

## Implementation approach (per user story)

- **US1 (dates)**: Promote `parseLocalDate` from `mortgage.ts` into `web/lib/format.ts` (already the
  home of `startOfDay`) and import it in `mortgage.ts`, `lease.ts`, `RentalCards.tsx`,
  `MortgageCards.tsx`. Replace every `new Date('YYYY-MM-DD')` on a stored date column with it. Add a
  month-length clamp in `daysUntilNextRent` so a due day of 31 stays in-month. iOS already correct →
  no iOS change; parity restored.
- **US2 (net rental)**: New `web/lib/finance/housing.ts` with `occupiedRentCents(units)` and
  `netRentalCents(units, mortgagePaymentCents)`. Point `HousingSnapshotCard`, `DashboardDesktop
  .housingSummary`, and `MultifamilyCards.NetBalanceCard` at it (occupied-only). Mirror in Swift and
  switch `HousingSnapshotCard.swift` from all-units to occupied-only. Pin with
  `housing-net-rental.json`, asserted by new web + iOS parity tests. (`MultifamilyCards.swift` is
  already occupied-only — it becomes a consumer of the shared function for parity.)
- **US3 (rate precision)**: In `AddPropertyModal`, load the rate without `.toFixed(2)` (render the
  stored value faithfully, e.g. a trimmed full-precision string) and round-trip it losslessly.
  Verify iOS `AddPropertySheet` doesn't truncate; fix if it does.
- **US4 (amortization labels)**: In `upcomingAmortization`, advance the row month with proper
  calendar addition + day clamp (mirroring Swift's `Calendar.date(byAdding:.month)`), not
  `setMonth(base+i)`. Extend `mortgage.parity.test.ts` to assert the month sequence at a month-end
  `asOf`.
- **US5 (occupancy)**: Make vacancy deliberate in the unit editor (an explicit Vacant/Occupied
  control mapping to the existing "empty tenant ⇒ vacant" storage), so a rent-earning unit isn't
  dropped by a blank optional field. Keep the shared math operating on a resolved `occupied` flag.

## Complexity Tracking

No constitution violations — table omitted.

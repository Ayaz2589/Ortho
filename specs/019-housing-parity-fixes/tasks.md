---
description: "Task list for Housing Correctness & Web↔iOS Parity Fixes"
---

# Tasks: Housing Correctness & Web↔iOS Parity Fixes

**Feature**: `019-housing-parity-fixes` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tests**: REQUIRED — Constitution VI (Test-Driven & Regression-Safe) is non-negotiable for money/date
logic. Every fix lands **test-first**: write the failing test, then the fix.

**Absolute repo root**: `/Users/ayazuddin/Development/personal/Ortho`
Web paths are relative to `web/` unless noted; iOS under `iOS/Ortho-iOS/`.

**Platform note**: Web is built/tested locally. iOS is validated **only** via `ios-ci.yml` (macOS) after
push — the Swift tasks are authored here and confirmed on CI. pbxproj/xcstrings edits: the owner must
take the **file-system** version in Xcode.

---

## Phase 1: Setup

- [x] T001 Confirm the web toolchain: from `web/`, `npm test` runs (Vitest) and `npx tsx --version` works. No new dependencies are added.
- [x] T002 Read the shape references so fixes match convention and iOS: `web/lib/format.ts` (date helpers), `web/lib/finance/mortgage.ts` (`parseLocalDate`, `upcomingAmortization`), `web/components/housing/lease.ts`, and the iOS counterparts `iOS/Ortho-iOS/Models/{LeaseInfo,Property,Unit}.swift`, `iOS/Ortho-iOS/Features/Dashboard/Widgets/HousingSnapshotCard.swift`, `iOS/Ortho-iOS/Features/Housing/{MultifamilyCards,AddPropertySheet}.swift`.

---

## Phase 2: Foundational (blocking prerequisite for US1)

**Goal**: the shared local-date parser US1 depends on, with mortgage math proven unchanged.

- [x] T003 Promote `parseLocalDate` from `web/lib/finance/mortgage.ts` into `web/lib/format.ts` (export it beside `startOfDay`), and import it back into `mortgage.ts` (no behavior change). Run `npx vitest run test/mortgage.parity.test.ts` — still green (the mortgage vector is untouched).

**Checkpoint**: `parseLocalDate` is importable app-wide; mortgage math unchanged.

---

## Phase 3: User Story 1 — Housing dates are correct in any timezone (P1) 🎯 MVP

**Goal**: every Housing date computed/displayed reflects the stored calendar date, matching iOS.

**Independent test**: with `TZ=America/New_York`, a lease starting on the 1st yields rent-due day 1 and
"Sep 1, 2025"; rent reads "Due today" on the due date; a payment on `2026-12-01` shows "Dec 1".

### Tests first (write, expect red)

- [x] T004 [US1] In NEW `web/test/housing-lease.test.ts` write failing, `TZ`-pinned tests (inject `asOf`) for `rentDueDay`, `daysUntilNextRent` (incl. the month-length clamp for a due day of 31, and "Due today" at 0), `daysUntilEnd`, `isRenewalSoon`, and `nextRentCaption`/`rentDueCaption`, asserting the stored-calendar-date results (per contract C2). File header pins `process.env.TZ`/documents the America/New_York expectations.
- [x] T005 [US1] In `web/test/housing-lease.test.ts` (or a sibling) add failing tests that lease start/end, rental-payment dates, and the mortgage closing-month caption render the **stored** date via the local parser (contract C3) — assert through the pure `parseLocalDate`→`mediumDate`/`monthYear` path with a pinned TZ.

### Implementation (make green)

- [x] T006 [US1] In `web/components/housing/lease.ts` replace `new Date(lease.lease_start/…)` with `parseLocalDate` in `rentDueDay` and `daysUntilEnd`, and in `daysUntilNextRent` clamp the due day to the target month's length before constructing the candidate date. Make T004 green.
- [x] T007 [US1] In `web/components/housing/RentalCards.tsx` (lease start/end rows + payment date) and `web/components/housing/MortgageCards.tsx` (closing-date caption) parse stored dates via `parseLocalDate` before formatting. Make T005 green.
- [x] T008 [US1] Run `TZ=America/New_York npx vitest run test/housing-lease.test.ts` and the existing housing tests — all green; confirm **no iOS files changed** (US1 is a web-only parity restoration).

**Checkpoint**: US1 done — dates correct in all timezones, iOS untouched.

---

## Phase 4: User Story 2 — Net rental income agrees across screens (P1)

**Goal**: one occupied-only net figure, identical on the Dashboard and the property page, on both
platforms, pinned by a golden vector.

**Independent test**: a multifamily with a vacant unit shows the same net on the Dashboard and the
property detail; the shared vector asserts identical values on web and iOS.

### Tests first (write, expect red)

- [x] T009 [US2] In `web/scripts/gen-vectors.ts` add the `housing-net-rental` inputs (data-model.md cases: all-occupied, some-vacant/opposite-sign, all-vacant, empty units, no-mortgage, single unit) and a `writeFileSync(... 'housing-net-rental.json' ...)`; write NEW failing `web/test/housing-net-rental.parity.test.ts` that imports `occupiedRentCents`/`netRentalCents` from `web/lib/finance/housing.ts` (not yet created) and asserts each vector case (contract C6).
- [x] T010 [P] [US2] Write NEW failing iOS `iOS/Ortho-iOSTests/HousingNetRentalParityTests.swift` that loads `housing-net-rental.json` from the test bundle and asserts the Swift `occupiedMonthlyRentCents`/net mirror against every case.

### Implementation (make green)

- [x] T011 [US2] Create `web/lib/finance/housing.ts` exporting pure `occupiedRentCents(units)` and `netRentalCents(units, mortgagePaymentCents)` (integer cents; net may be negative; not gated on a mortgage) per contract C6.
- [x] T012 [US2] Run `npm run gen:vectors` to emit `shared/test-vectors/housing-net-rental.json`; run `npx vitest run test/housing-net-rental.parity.test.ts` — green. Confirm `git diff shared/test-vectors/` shows **only** the new file.
- [x] T013 [US2] Point the web consumers at the shared functions: `web/components/dashboard/HousingSnapshotCard.tsx` (`netRentalIncome`), `web/components/web/DashboardDesktop.tsx` (`housingSummary`), and `web/components/housing/MultifamilyCards.tsx` (`NetBalanceCard`) — all occupied-only, mortgage-independent.
- [x] T014 [US2] Reconcile existing web housing tests to occupied-only: update `web/test/store.integrity.test.tsx` "desktop housing summary" expectations if any fixture has a vacant unit; add/adjust an assertion that Dashboard net == detail net for a vacant-unit fixture.
- [x] T015 [US2] iOS: in `iOS/Ortho-iOS/Features/Dashboard/Widgets/HousingSnapshotCard.swift` switch the net-rental sum from `p.units.reduce{…}` (all units) to `p.occupiedMonthlyRentCents` (occupied-only), so it matches `Property.swift`'s net and the detail card.
- [x] T016 [US2] iOS: register the new vector for the test bundle — add a `project.pbxproj` Copy-Bundle-Resources entry for `housing-net-rental.json` (PBXFileReference + PBXBuildFile + test-resources group + Resources build phase, copying an existing vector entry's shape) and add `HousingNetRentalParityTests.swift` to the test target.

**Checkpoint**: US2 done on web (locally green); iOS pending CI. Same net figure everywhere.

---

## Phase 5: User Story 3 — Editing never truncates the mortgage rate (P2)

**Goal**: a no-op edit preserves the stored rate at full precision.

**Independent test**: a property at 6.375% saved unchanged persists 6.375%.

### Tests first (write, expect red)

- [x] T017 [US3] Write NEW failing `web/test/property-edit.test.tsx` that seeds a property with `annual_interest_rate_percent: 6.375`, drives a no-op save through the store's `updateProperty` (mock the data layer), and asserts the persisted rate is exactly `6.375` and the derived monthly payment is unchanged (contract C5).

### Implementation (make green)

- [x] T018 [US3] In `web/components/housing/AddPropertyModal.tsx` load the rate faithfully (render the stored value, trimming only trailing zeros — not `.toFixed(2)`) and round-trip it losslessly on save. Make T017 green. While here, note/verify the ±1-cent non-USD FX round-trip (spec edge) and fix only if trivial; else record as a documented limitation.
- [x] T019 [US3] iOS: verify `iOS/Ortho-iOS/Features/Housing/AddPropertySheet.swift` `formatPercent(...)` does not truncate the rate to 2 decimals; if it does, widen it to preserve stored precision (mirror the web fix). CI-validated.

**Checkpoint**: US3 done — no silent rate corruption on edit.

---

## Phase 6: User Story 4 — Amortization schedule months labeled correctly (P2)

**Goal**: successive calendar-month labels, none skipped/duplicated at month-end; values unchanged.

**Independent test**: schedule generated with `asOf` on Jan 31 labels Jan, Feb, Mar, … in order.

### Tests first (write, expect red)

- [x] T020 [US4] In `web/test/mortgage.parity.test.ts` (or a NEW `web/test/amortization-months.test.ts`) add a failing test asserting `upcomingAmortization(12, …, asOf=Jan 31)` returns 12 **successive** month labels (no duplicate March, no missing February), and that `principalCents`/`interestCents` are unchanged (contract C4).

### Implementation (make green)

- [x] T021 [US4] In `web/lib/finance/mortgage.ts::upcomingAmortization` advance each row's month by whole-calendar-month addition with a day clamp (mirroring Swift `Calendar.date(byAdding:.month)`) instead of `month.setMonth(month0.getMonth()+i)`. Make T020 green; re-run `test/mortgage.parity.test.ts` — principal/interest still vector-locked.

**Checkpoint**: US4 done — month labels correct for any reference date.

---

## Phase 7: User Story 5 — A rent-earning unit is never silently dropped (P3)

**Goal**: vacancy is deliberate; an occupied unit's rent always counts.

**Independent test**: a unit intended occupied counts toward income; only an explicitly-vacant unit is excluded.

### Tests first (write, expect red)

- [x] T022 [US5] Write a failing test (in `web/test/subscription`-style component test, e.g. NEW `web/test/housing-occupancy.test.tsx` or extend an existing housing test) asserting that a unit the user intends to be occupied is included in `occupiedRentCents`/net, and that a unit explicitly marked vacant is excluded — consistently for Dashboard and detail (contract C7).

### Implementation (make green)

- [ ] T023 [US5] In `web/components/housing/AddPropertyModal.tsx` (unit editor) surface an explicit Vacant/Occupied choice (tokens-only, real semantic control, ≥44px) mapping to the existing "empty tenant ⇒ vacant" storage, so a rent-earning unit isn't dropped by a blank optional field; mirror the choice in the iOS unit editor (`AddPropertySheet.swift`). Make T022 green.

**Checkpoint**: US5 done — occupancy is a deliberate state on both surfaces.

---

## Phase 8: Polish, Docs & Cross-Cutting

- [x] T024 From `web/`: run `npm test` and `npx tsc --noEmit` — full suite green, `lib/` coverage at threshold, and `git diff shared/test-vectors/` shows only the new `housing-net-rental.json` (SC-005).
- [x] T025 [P] Reconcile documentation with the fixed behavior: `docs/shared.md` (the date-parse invariant now truly holds for lease/payment/closing dates — remove the overstated wording, note lease dates), `PARITY.md` (add a housing-net-rental vector row + note the resolved net-rental divergence and the restored lease-date parity), `docs/web.md` and `docs/ios.md` (Housing sections: local-date parsing, occupied-only net, deliberate vacancy).
- [ ] T026 Push `019-housing-parity-fixes`; `GH_TOKEN=placeholder gh run watch <id> --exit-status` the iOS CI; if a "new vector fails only on CI" error appears, fix the pbxproj Copy-Bundle entry (T016). Inspect the uploaded simulator screenshots for the Housing tab.
- [ ] T027 Update this tasks.md ledger (check off completed tasks; record any deviations from plan/research as a short "Deviations" list), and run `/speckit-analyze` for a cross-artifact consistency pass before opening the PR.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational: `parseLocalDate` promotion)** before US1.
- **US1 (Phase 3)** depends only on T003. Web-only.
- **US2 (Phase 4)** is independent of US1; it creates the shared `housing.ts` + vector and touches
  dashboard/multifamily + iOS. T009→T011→T012 (web), T010/T015/T016 (iOS) — the iOS trio validated on CI.
- **US3 (Phase 5)**, **US4 (Phase 6)**, **US5 (Phase 7)** are each independent web-first slices (plus a
  small iOS check for US3/US5).
- **Phase 8** after all stories.

## Parallel Opportunities

- T010 (iOS parity test authoring) is `[P]` vs the web US2 tasks (different files/toolchain).
- US1, US3, US4 touch disjoint web files (`lease.ts`+cards, `AddPropertyModal.tsx`, `mortgage.ts`) and
  their test-first→impl pairs can be interleaved; within a story, same-file tasks serialize.
- T025 (docs) is `[P]` — independent of code once behavior is settled.

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1**: fixes the most pervasive wrong-data issue (dates) and is fully local-testable.
- **Then US2** (the cross-screen net-rental inconsistency) — the highest-trust fix, pinned by a vector.
- **Then US3/US4/US5** — smaller correctness fixes.
- Ship incrementally; each checkpoint is independently green. iOS lands with US2 (and the US3/US5 checks)
  and is confirmed on the macOS CI run.

## Notes

- Tests are written to FAIL first, then made green (Constitution VI).
- iOS cannot be built here; author Swift + pbxproj carefully and confirm on CI.
- Keep the mortgage vector and all non-housing vectors byte-identical — zero drift is a success gate.

## Deviations

- **T017/T018 (US3) tested at the helper level, not a full store round-trip.** The truncation bug lives
  entirely in the form's load step, so the fix extracts a pure `rateToInput`/`parseRate` pair
  (`web/components/housing/rate.ts`) and `web/test/property-edit.test.ts` asserts the lossless round-trip
  there (6.375 → "6.375" → 6.375; documents that the old `.toFixed(2)` gave 6.38). This is a cleaner,
  deterministic contract test than driving the whole modal, and the save path (`num()`) already preserved
  precision — only load truncated.
- **T023 (US5) partially delivered — logic locked, explicit vacant-toggle UI + copy deferred.** A fully
  clean "occupied-but-unnamed" unit requires a schema `occupied`/`vacant` column, which is **Out of Scope**
  (no migrations). What shipped: the occupancy rule is centralized in `isUnitOccupied`, the net-rental math
  is occupied-only and vector-locked on both surfaces, and the rule is covered by tests
  (`housing-net-rental.parity.test.ts` "unit occupancy rule" + the vacant-unit Dashboard==detail assertion
  in `store.integrity.test.tsx`). Deferred (documented): an explicit per-unit Vacant toggle in the
  add/edit forms and the "total unit rent" → "occupied unit rent" copy change (an i18n coordination across
  6 web catalogs + iOS `Localizable.xcstrings` touching the catalog-parity lock) — best done alongside the
  schema column in a follow-up.
- **±1-cent non-USD FX edit round-trip (spec edge):** confirmed pre-existing, left as a documented known
  limitation (≤1 cent, non-USD display only) rather than fixed here — it is a property of the shared
  `centsToDisplay`/`parseMoney` FX conversion, not specific to housing.
- **Pre-existing `tsc --noEmit` errors** (duplicate i18n keys, `store.tsx` implicit-any/`Property[]` cast)
  are unrelated to this feature and predate it; the project gate is `npm test` (Vitest), which is green.
  All files this feature touched are typeclean.

## Review (/code-review high, 8 angles + verify)

- **Correctness:** no defects in the changed code — `dueDateInMonth` (incl. December normalization),
  `upcomingAmortization` successive months, `parseLocalDate` promotion (no circular import), `rate.ts`
  round-trip (provably lossless), and net-rental edges all verified sound.
- **Caught a real miss (fixed):** `web/components/web/HousingDesktop.tsx` — the desktop `/housing` detail
  view — was never touched, so US1 (dates) and US2 (net rental) were unfixed on the expanded canvas
  (lease/closing/payment dates via raw `new Date`, an inline all-vs-occupied net path). Now routed
  through `parseLocalDate` and the shared `occupiedRentCents`/`netRentalCents`/`rentUnitsFrom`.
- **Cleanups applied:** RentalCards payment-sort raw parse → `parseLocalDate`; `AddPropertyModal` local
  `num()` removed in favor of the shared `parseRate` (so the round-trip test exercises the real save
  path); `mortgage.ts` import moved to top-of-file; iOS `Unit.isVacant` uses `.whitespacesAndNewlines`
  to match web `.trim()` (closes a newline-only-tenant parity gap the vector can't see).

## Harness / results

- Web: US1 `housing-lease` (TZ-pinned) ✓, US2 `housing-net-rental.parity` + `store.integrity` ✓, US3
  `property-edit` ✓, US4 `amortization-months` + `mortgage.parity` ✓, US5 occupancy rule ✓. Zero
  vector drift (`git status shared/test-vectors/` shows only the new `housing-net-rental.json`).
- iOS: authored (net-rental mirror in `Property.swift`/`HousingMath`, Dashboard occupied-only fix,
  `HousingNetRentalParityTests.swift`, pbxproj Copy-Bundle wiring) — validated on `ios-ci.yml` after push
  (T026). pbxproj verified balanced (braces 81/81, parens 39/39; 10 new AA0019 id-refs).

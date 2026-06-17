# Tasks: Cross-Platform Parity Remediation, Part 2

**Input**: Design documents from `/specs/009-parity-remediation-2/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/parity-contracts-2.md

**Tests**: REQUIRED. This feature is vector-first per Constitution Principle VI — every pure-logic change
ships a shared golden vector asserted by BOTH suites, written/regenerated before or with the fix.

**Organization**: Grouped by user story (US1 P1 → US5 P3). Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`
- **[P]** = different files, no dependency → parallelizable.
- iOS is canonical; web conforms (except R7 mortgage, where both adopt the correct count).

---

## Phase 1: Setup

- [ ] T001 [P] [US5] Add `.nvmrc` (`22`) at repo root and `engines.node` `">=20.19.0 || >=22.12.0"` to
  `web/package.json`; verify `npm test` starts under the pinned Node without `ERR_REQUIRE_ESM` (R10).
- [ ] T002 Confirm the `xcodeproj` Ruby gem is available (`gem list xcodeproj`); round-trip-open
  `iOS/Ortho-iOS.xcodeproj` and re-save with no diff to validate before any edit.

---

## Phase 2: Foundational (blocking — the new vector wiring)

**⚠️ Must complete before US1/US2 vectors can run on iOS.**

- [ ] T003 [US1/US2] Add `CurrencyParityTests.swift` to `iOS/Ortho-iOSTests/` (modeled on
  `TransactionSplitParityTests.swift`: load the bundled JSON, decode, assert each case) and wire it into the
  `Ortho-iOSTests` target's Compile Sources, plus add `shared/test-vectors/currency.json` to that target's
  Copy Bundle Resources — via the `xcodeproj` gem. Verify `xcodebuild -list` and that the (initially empty)
  test compiles.

**Checkpoint**: new test target membership in place; existing split/mortgage/insight tests still wired.

---

## Phase 3: User Story 1 — Same money on both clients (P1) 🎯 MVP

**Goal**: leftover cent, currency conversion, and the transaction+shares write are identical/atomic on both clients.
**Independent Test**: `ownerOrdering` + `currency.json` vectors pass on both suites; `store.test.tsx` forced-failure case passes.

### Owner ordering (R1, C1)
- [ ] T004 [US1] Add pure `orderedOwnerIds(ids: string[]): string[]` (ascending sort) to `web/lib/splits.ts`
  and `func orderedOwnerIds<ID>(_:)` to `iOS/.../TransactionSplits.swift` (sort by `uuidString` for `Person.ID`,
  by `<` for `String`).
- [ ] T005 [US1] Extend `web/scripts/gen-vectors.ts` with an `ownerOrdering` section (scrambled-input cases,
  incl. UUID-form ids, percent leftover, single owner); run `npm run gen:vectors` to write
  `shared/test-vectors/transaction-splits.json`.
- [ ] T006 [US1] Assert `ownerOrdering` in `web/test/splits.parity.test.ts` and
  `iOS/.../TransactionSplitParityTests.swift` (`computeShares(amount, orderedOwnerIds(owners), split) == expected`
  and `orderedOwnerIds(owners) == ordered`). Confirm they pass.
- [ ] T007 [US1] Route share computation through `orderedOwnerIds`: web `lib/format.ts` `effectiveShares`
  fallback + `components/web/TxForm.tsx` share computation; iOS `Models/Transaction.swift` `effectiveShares` +
  `Features/Transactions/AddTransactionSheet.swift` submit. (iOS already sorts in `effectiveShares`; ensure the
  submit/creation path does too.)

### Currency conversion (R2/R5, C2/C3)
- [ ] T008 [US1] In `web/lib/finance/money.ts`: add `roundHalfAwayFromZero`, add `toDisplayAmount(cents,
  currency, rate)` mirroring iOS, and fix `formatMoney` to always divide cents by 100 (drop the
  `fractionDigits===0?1:100` divisor). Keep `toUSDCents` numeric behavior; route its rounding through the helper.
- [ ] T009 [US1] Add a `currency.json` generator block to `gen-vectors.ts` (`toDisplay` + `toUsdCents` cases for
  all 7 currencies at fallback rates + clean half-cent ties); `npm run gen:vectors`.
- [ ] T010 [US1] Assert `currency.json` in new `web/test/currency.parity.test.ts` and
  `iOS/.../CurrencyParityTests.swift`; run both suites; resolve any TS↔Decimal mismatch by adjusting the
  rounding helper or choosing boundary-safe inputs.

### Atomic write (R3, C6)
- [ ] T011 [US1] In `web/lib/store.tsx`: make `writeShares` return `{ ok }`; on failure in `addTransaction`
  delete the just-inserted parent + roll back optimistic state + `setError`; in `updateTransaction` restore
  `prevTx`. No schema change.
- [ ] T012 [US1] Add a `store.test.tsx` case forcing the `transaction_shares` insert to fail; assert no
  share-less parent survives locally and an error is surfaced.

**Checkpoint**: US1 vectors + store test green on both suites.

---

## Phase 4: User Story 2 — Web money locale + zero-decimal (P2)

**Goal**: web money formats per selected locale; zero-decimal currencies show correct magnitude.
**Independent Test**: language switch re-formats money + persists; JPY magnitude correct (quickstart).

- [ ] T013 [US2] Add a `locale` param to `web/lib/finance/money.ts` `formatMoney` (+ `toDisplayAmount`),
  default `en-US`; thread the store's `locale` through `store.tsx` `formatMoney` wrapper. (Zero-fraction
  magnitude already fixed in T008.)
- [ ] T014 [US2] Add/extend a web test (e.g. `money.test.ts`) asserting locale-driven formatting (grouping/
  symbol/decimals) for a non-en-US locale and correct JPY magnitude. (Depends on T008/T013.)

**Checkpoint**: US1 + US2 both green; manual locale check passes.

---

## Phase 5: User Story 3 — Insight + mortgage reconciliations (P2, vector-first)

**Goal**: recurring average, mortgage months-elapsed, and outlier rule identical + vectored.
**Independent Test**: regenerated `insights.json`/`mortgage.json` pass both suites; 8/8 insight rules covered.

- [ ] T015 [US3] Web `lib/finance/insights.ts:217` `Math.round` → `Math.trunc` (match iOS `Int64` division, R6).
- [ ] T016 [US3] Web `lib/finance/mortgage.ts` `monthsElapsed`: clamp closing day to the asOf month's length
  before the `asOf.day < closing.day` decrement (R7). **First empirically confirm iOS
  `Calendar.dateComponents([.month])` output** for the boundary cases (small Swift check) so expected values match.
- [ ] T017 [US3] Add day-29–31 boundary inputs to `MORTGAGE_INPUTS` (closing 2026-01-31 at Feb 27/28, Mar 1/31)
  in `gen-vectors.ts`; add the outlier insight scenario (lowercase-UUID tx ids, ≥5 trailing same-category +
  current-month ≥2× median, income ≥ expenses) (R8). `npm run gen:vectors`.
- [ ] T018 [US3] Run both suites against the regenerated `insights.json` + `mortgage.json`; confirm the
  recurring magnitude reflects truncation, the `outlier-<uuid>` insight appears, and the boundary balance/equity
  match. Adjust until green.

**Checkpoint**: US3 green; every insight rule (1–8) is vectored.

---

## Phase 6: User Story 4 — Desktop web capability (P3)

**Goal**: ≥1024px web shows the Budget Progress widget + lease-renewal banner.
**Independent Test**: `desktop-parity.test.tsx` asserts both; manual ≥1024px check.

- [ ] T019 [P] [US4] Render the shared `BudgetProgressCard` in `web/components/web/DashboardDesktop.tsx`
  (same self-hide-when-no-budgets behavior + relative position as phone).
- [ ] T020 [P] [US4] Render the shared lease `RenewalBanner` in `web/components/web/HousingDesktop.tsx`
  rental/lease branch.
- [ ] T021 [US4] Extend `web/test/desktop-parity.test.tsx` to require the Budget Progress widget (with budgets)
  and the renewal banner (lease in renewal window) on the desktop layouts.

**Checkpoint**: US4 green.

---

## Phase 7: User Story 5 — Sign-in copy (P3)

**Goal**: web sign-in states the 8-digit length (Node pin done in T001).
**Independent Test**: sign-in screen copy reads "8-digit"; `npm test` runs on default Node.

- [ ] T022 [US5] Update the `web/app/sign-in/page.tsx` subtitle to state the 8-digit code length (copy only;
  per `web/AGENTS.md` no Next-API change).

---

## Phase 8: Polish & verification (cross-cutting)

- [ ] T023 Run `cd web && npm run gen:vectors` → confirm a **no-op diff** (vectors committed in sync).
- [ ] T024 Drift check (FR-013): temporarily perturb `orderedOwnerIds` / `toDisplayAmount` / recurring avg /
  `monthsElapsed` and confirm BOTH suites go red; revert.
- [ ] T025 Run `cd web && npm test` (green, under pinned Node) and `cd iOS && xcodebuild test` (green, incl.
  `CurrencyParityTests`); `npx tsc --noEmit` clean.
- [ ] T026 Update `specs/008-parity-remediation/parity-reaudit.md` closure notes (which 009 items are now
  closed) and commit; run `quickstart.md` validation.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001 [P], T002 [P] — immediately.
- **Phase 2 (Foundational)**: T003 depends on T002 — BLOCKS the iOS half of US1/US2 currency vectors.
- **US1 (Phase 3)**: owner-ordering (T004→T007) and currency (T008→T010, needs T003) and atomic (T011→T012)
  are three independent tracks; within each, vector/gen before assert before wire.
- **US2 (Phase 4)**: T013 depends on T008; T014 on T013.
- **US3 (Phase 5)**: T015/T016 independent; T017 after both; T018 after T017.
- **US4 (Phase 6)**: T019/T020 [P]; T021 after.
- **US5 (Phase 7)**: T022 independent (T001 already pinned Node).
- **Phase 8**: after all desired stories.

### Within each story
- Tests/vectors FIRST (gen-vectors + assertions), confirm they exercise the change, then implement until green.
- Regenerate vectors and run BOTH suites after any pure-logic edit.
- Commit after each logical group (per user-story or per fix), pushing to `main` (user preference).

## Implementation Strategy
- **MVP = US1** (the silent-correctness trio) — highest user value; stop & validate before US2+.
- Incremental: US1 → US2 → US3 → US4 → US5, each independently green.

# Tasks: Logic De-duplication

**Input**: `specs/002-logic-dedup/{spec.md, plan.md}`

**Tests**: This feature *is* tests (parity vectors) + a migration. Vitest is run
here; XCTest + SQL are delivered for the maintainer.

## Phase 1: Parity fix (Foundational for US2/US3)

- [ ] T001 [US2] Make TS mortgage calendar-accurate: add day-aware
  `monthsElapsed`, use it in `currentPrincipalBalanceCents`/`equity`/
  `upcomingAmortization`; make `yearsRemaining` calendar-accurate. File:
  `web/lib/finance/mortgage.ts`.

## Phase 2: Shared vectors (US2, US3)

- [ ] T002 [US2] Author `shared/test-vectors/mortgage.json` — payment, balance,
  equity, fraction, maturity, years-remaining, 12-mo amortization; incl. a
  zero-interest case; pinned `asOf`.
- [ ] T003 [US3] Author `shared/test-vectors/insights.json` — scenarios with
  pinned `referenceDate`, expected fired-insight IDs + severity + magnitude.
- [ ] T004 `shared/test-vectors/README.md` — format, intent, how each suite reads it.

## Phase 3: Web suite (US2, US3) — verified here

- [ ] T005 Add Vitest: `vitest` devDep, `vitest.config.ts`, `"test"` script.
- [ ] T006 [US2] `test/mortgage.parity.test.ts` asserts `mortgage.ts` vs vectors.
- [ ] T007 [US3] `test/insights.parity.test.ts` asserts `insights.ts` vs vectors.
- [ ] T008 Run Vitest; fix discrepancies until green.

## Phase 4: iOS suite (US2, US3) — delivered, run on macOS

- [ ] T009 [US2] `iOS/Ortho-iOSTests/MortgageParityTests.swift` vs `mortgage.json`.
- [ ] T010 [US3] `iOS/Ortho-iOSTests/InsightParityTests.swift` vs `insights.json`.
- [ ] T011 README note: add the test target + bundle the vectors in Xcode.

## Phase 5: Postgres aggregations (US1) — delivered, applied by maintainer

- [ ] T012 [US1] `supabase/migrations/20260611_aggregates.sql` — owner_spend,
  category_totals, month_summary, daily_expense RPCs (security definer, member
  check), matching TS semantics.
- [ ] T013 [US1] `web/lib/api/aggregates.ts` — additive RPC wrapper.
- [ ] T014 Document apply + cut-over (migration header + README).

## Phase 6: Verify

- [ ] T015 `tsc --noEmit` clean; Vitest green; summarize maintainer steps.

## Dependencies
- T001 → T002 → T006/T009. T002–T004 → T005–T011. T012 → T013.
- US1 (Postgres) is independent of US2/US3 (vectors) and can ship separately.

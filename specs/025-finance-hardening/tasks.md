---
description: "Task list for Finance Model Hardening (spec 025)"
---

# Tasks: Finance Model Hardening

**Input**: Design documents from `specs/025-finance-hardening/`

**Prerequisites**: plan.md, spec.md

**Tests**: REQUIRED and test-first — this feature is test-driven hardening
(constitution Principle VI). Every production module gets a failing test before
implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- All paths are under the `web/` workspace.

## Phase 1: Setup

- [ ] T001 Confirm the web workspace runs green as a baseline: `cd web && npm test`
  and `npx tsc --noEmit`. Record that `shared/test-vectors/*.json` is clean in git
  (the byte-identical baseline US3 must preserve).

---

## Phase 2: Foundational

No shared foundational code — each user story is an independent, additive slice.
(Intentionally empty; proceed to the stories.)

---

## Phase 3: User Story 1 - Correctness oracle (Priority: P1) 🎯 MVP

**Goal**: Prove the finance math is correct, independent of the generated vectors.

**Independent Test**: `npm test` runs the two new suites green; introducing a
deliberate off-by-one in a covered formula turns at least one red (then reverted).

- [ ] T002 [P] [US1] Write `web/test/finance-goldens.test.ts` — hand-computed
  expected values, each with its derivation in a comment, for `monthlyPaymentCents`
  (incl. zero-interest), `currentPrincipalBalanceCents`, `computeShares` leftover
  placement, `balanceBetween`, `netRentalCents`, and `toDisplayAmount`/`toUSDCents`.
  These assert *derived truth*, not the `shared/test-vectors` fixtures. (≥ 15 assertions.)
- [ ] T003 [P] [US1] Write `web/test/finance-properties.test.ts` — invariants:
  even/percent shares sum to amount (incl. the >100 reclaim), no negative share,
  `computeShares(owners, asInput(seedSplit(...))) === storedCents`, currency
  round-trip within tolerance, `balanceBetween` antisymmetry. Use fixed seeded
  inputs (no `Math.random`). (≥ 6 invariants.)
- [ ] T004 [US1] Run `npm test`; confirm both suites pass. Demonstrate SC-002 once
  (temporarily break a formula → a test fails → revert), noting it in the commit.

**Checkpoint**: The oracle exists and bites. This is the MVP.

---

## Phase 4: User Story 2 - Branded Cents type (Priority: P2)

**Goal**: Express the cents invariant in the type system, additively.

**Independent Test**: `cents.test.ts` green; `tsc --noEmit` passes with no changes
to existing call sites.

- [ ] T005 [US2] Write `web/test/cents.test.ts` FIRST (must fail — module absent):
  `toCents(1299)` → 1299; `toCents(12.5)`/`toCents(NaN)`/`toCents(Infinity)` throw;
  `centsFromDollars(12.99)` → 1299 (round-half-away-from-zero); `isCents`/
  `assertCents` behavior; a type-level check that a `Cents` is assignable to
  `number`.
- [ ] T006 [US2] Implement `web/lib/finance/cents.ts` to make T005 pass: branded
  `type Cents = number & { readonly __cents: unique symbol }`, `toCents`,
  `centsFromDollars` (reuse `roundHalfAwayFromZero`), `isCents`, `assertCents`.
- [ ] T007 [US2] Run `npx tsc --noEmit` — confirm zero ripple (no existing file
  needs editing).

**Checkpoint**: `Cents` available for opt-in adoption; nothing broken.

---

## Phase 5: User Story 3 - Named insight thresholds (Priority: P3)

**Goal**: De-magic the insight cutoffs with no behavior change.

**Independent Test**: `insights.parity.test.ts` passes and `insights.json` is
byte-identical after `npm run gen:vectors`.

- [ ] T008 [US3] Write `web/test/insights-thresholds.test.ts` FIRST (must fail):
  assert `INSIGHT_THRESHOLDS` names every cutoff (MoM floor $20 & 25%, budget
  near 0.85 / under 0.5 / progress 0.7, recurring min-count 3 & 28–35 day band &
  0.8 ratio, outlier 2× & $500 severity, savings 0.2, trend 0.2 & $100 floor,
  mortgage 0.28/0.35) with their exact current values.
- [ ] T009 [US3] Implement `web/lib/finance/insights-thresholds.ts` to satisfy T008.
- [ ] T010 [US3] Refactor `web/lib/finance/insights.ts` to consume
  `INSIGHT_THRESHOLDS` in place of every inline literal — pure substitution, no
  logic change.
- [ ] T011 [US3] Run `npm run gen:vectors`; confirm `git diff shared/test-vectors`
  shows **no change**. Run `npm test` — all parity suites green.

**Checkpoint**: Thresholds centralized; behavior provably identical.

---

## Phase 6: Polish & Verification

- [ ] T012 Update `docs/finance.md` §16 to mark H1 / H3(a) / the thresholds note as
  addressed by spec 025, leaving H2, H3(b), H4 as tracked follow-ups.
- [ ] T013 Full gate: `cd web && npx tsc --noEmit && npm test`; confirm vectors
  clean. Run `/code-review` on the diff; address findings.
- [ ] T014 Commit per logical group and push to the PR #17 branch.

---

## Dependencies & Execution Order

- **US1, US2, US3 are independent** and could be done in any order; recommended
  priority order P1 → P2 → P3.
- Within each story: **test first (must fail) → implement → verify**.
- T011 (vector-unchanged proof) gates US3; T013 gates the whole feature.

## Notes

- No production behavior changes; the unchanged `insights.json` is the guarantee.
- `Cents` is a `number` subtype — deliberately no mass call-site migration in this
  slice (that would be a separate, larger PR).
- Deferred (separate PRs): H2 amortization integer rework, H3(b) DB shares-sum
  constraint, H4 date-regime work.
</content>

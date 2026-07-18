# Tasks: Multi-currency accounting strategy (a decision)

**Feature**: `specs/027-multi-currency-strategy/` | **Branch**: `feat/multi-currency-strategy`

**Input**: plan.md, spec.md, research.md, data-model.md, contracts/reproduction-test.md, quickstart.md

> **Nature of this feature.** A decision with a large implementation tail. The deliverable is a
> written recommendation + one RED reproduction test — **no** schema, migration, or behavior
> change. "Full TDD" here means: write the failing test that describes the intended behavior
> (stable native history) *first*, watch it drift, quarantine it, then ground the recommendation
> in it. The code that would make it pass (option b) is deliberately deferred (research-gated).

## Phase 1: Setup

- [X] T001 Create feature branch `feat/multi-currency-strategy` and spec scaffold under `specs/027-multi-currency-strategy/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md, checklists/). *(done during specify/plan)*
- [X] T002 Verify the money layer under test is present and unmodified: `web/lib/finance/money.ts` exports `toUSDCents`, `toDisplayAmount`, `formatMoney`, `roundHalfAwayFromZero`. *(verified in research.md)*

## Phase 2: Foundational (blocking prerequisite)

- [X] T003 Pin the exact drift numbers against the real functions (run `tsx` against `web/lib/finance/money.ts`) so the test and doc quote identical, verified figures. Output recorded in `research.md` §Verification. *(done)*

## Phase 3: User Story 1 — Prove the drift (RED reproduction test) (P1) 🎯 MVP

**Goal**: A runnable, quarantined regression test that demonstrates non-USD historical totals
drift as FX moves, and confirms USD is drift-free — the evidence the recommendation stands on.

**Independent test**: `cd web && npx vitest run test/multicurrency-instability.test.ts` is green
(the three `test.fails` drift cases threw as expected; the USD control passed). Flipping any
`test.fails` to `test` shows a real `expected 103.70 to be 100`-style failure.

- [X] T004 [US1] Write the RED reproduction test at `web/test/multicurrency-instability.test.ts` per `contracts/reproduction-test.md`: import only `toUSDCents`/`toDisplayAmount`/`formatMoney` from `../lib/finance/money`; add case 1 (rate-movement drift, 100 CAD @1.35→view @1.40) as `test.fails` asserting stability to 100.00.
- [X] T005 [US1] Add case 2 (category-total drift: [100,250,37.55] CAD, entered sum 387.55, viewed @1.40 → 401.90) as `test.fails` in the same file.
- [X] T006 [US1] Add case 3 (rounding-through-USD loss at the SAME rate: 100 CAD @1.35 → 99.99; 1000 JPY @150 → 1001) as `test.fails` in the same file.
- [X] T007 [US1] Add case 4 (USD control: 100 USD @1.0 round-trips to exactly 100.00 with **zero** drift) as a normal passing `it(...)` in the same file, plus a top-of-file doc comment pointing at `specs/027-multi-currency-strategy/` and explaining the `test.fails` quarantine.
- [X] T008 [US1] Run `cd web && npx vitest run test/multicurrency-instability.test.ts` — confirm green (drift reproduced via expected-failures, control passes). Then `cd web && npm test && npx tsc --noEmit` stay green, and `git status shared/test-vectors/` is empty (SC-003, SC-005, NG-003).

**Checkpoint**: US1 done — the drift is proven and CI-safe.

## Phase 4: User Story 2 — The written recommendation (P1)

**Goal**: Expand `docs/future_tasks/9.5-multi-currency-strategy.md` into a decision doc a lead can
act on: today's model, the worked drift example, the two options, option (b)'s cost, the rejected
in-between, the research gate, and one recommendation.

**Independent test**: A reader unfamiliar with the money layer can state the storage unit, the two
conversion points, why history drifts, both options, (b)'s cost surface, the gate, and the
recommendation — from the doc alone (SC-001, SC-004).

- [X] T009 [US2] Rewrite `docs/future_tasks/9.5-multi-currency-strategy.md`: preserve the backlog header (section/priority/track), then add "How money flows today" (USD cents; `toUSDCents` at entry-rate; `toDisplayAmount`/`formatMoney` at current-rate) — FR-005, FR-011.
- [X] T010 [US2] Add the worked drift example with numbers matching the test (CA$100.00 → CA$103.70; category 387.55 → 401.90; JPY/same-rate loss) — FR-006; link the reproduction test as evidence.
- [X] T011 [US2] Add the two options (a US/USD-defer, b native-currency ledger) and option (b)'s concrete cost table (schema, lossy migration, every read/write, vector harness) — FR-007, FR-008.
- [X] T012 [US2] Add "the silent in-between" section rejecting rate-alongside-USD, the research gate (international audience in scope?), and the single recommendation + one-line rationale — FR-009, FR-010, FR-012.

**Checkpoint**: US2 done — the recommendation is complete and self-contained.

## Phase 5: Polish & cross-cutting

- [X] T013 Validate the doc against the quickstart checklist (FR-005..FR-012, SC-001/SC-004) and reconcile any wording drift with `research.md`.
- [X] T014 Confirm `PARITY.md` / `docs/finance.md` need no change (no capability changed) or add a one-line pointer to this decision if warranted; keep `shared/test-vectors/` byte-identical.
- [X] T015 Run the full gate: `cd web && npm test && npx tsc --noEmit`; review `git diff --stat` shows only `specs/027-…`, `web/test/multicurrency-instability.test.ts`, `docs/future_tasks/9.5-…`, and the `CLAUDE.md` plan pointer (SC-005).
- [ ] T016 Commit, push `feat/multi-currency-strategy`, open a PR with the decision summary.

## Dependencies & order

- Setup (T001–T002) → Foundational (T003) → **US1 (T004–T008)** → **US2 (T009–T012)** → Polish (T013–T016).
- US2 depends on US1 only for the verified numbers (already pinned in T003); the doc quotes the
  test, so writing the test first keeps them consistent (TDD).
- **MVP = User Story 1** (the RED test): on its own it proves the problem and is independently
  valuable evidence even before the doc is written.

## Parallel opportunities

- T004–T007 all edit the **same** file (`multicurrency-instability.test.ts`) → **not** parallel; do in sequence.
- T009–T012 all edit the **same** doc → sequential.
- US1 and US2 are separate files and *could* be written in parallel, but US2 quotes US1's numbers, so US1-first is preferred.

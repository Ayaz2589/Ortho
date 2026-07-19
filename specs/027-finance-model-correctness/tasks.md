# Tasks: Finance Model Correctness & Honest Labels (027)

**Input**: Design documents from `specs/027-finance-model-correctness/`

**Branch**: `feat/finance-model-correctness`

**TDD**: Yes — tests are written first (red), then the fix turns them green.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: User story this task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: Confirm baseline and create new test files (empty shells with correct imports).

- [X] T001 Confirm baseline: `cd web && npm test` — all 1,375 tests pass before any change
- [X] T002 [P] Create `web/test/insights-timezone.test.ts` (empty, imports only — A2 test file)
- [X] T003 [P] Create `web/test/import/toTransaction.test.ts` (empty, imports only — A4 test file)

**Checkpoint**: Baseline confirmed green; new test files exist but contribute no tests yet.

---

## Phase 2: Foundational (No blocking prerequisites — all phases independent)

No shared infrastructure is needed. All five work items are logically independent once
the baseline is green. Proceed directly to user story phases.

---

## Phase 3: User Story 1 — Timezone-safe insight bucketing (P1) 🎯

**Goal**: Fix the A2 bug where a date-only transaction string on a month boundary is
miscounted into the wrong month for users west of UTC.

**Independent Test**: `TZ=America/Los_Angeles npx vitest run test/insights-timezone.test.ts` — passes after fix, fails before.

### Tests for User Story 1 (TDD — write FIRST, verify RED)

- [X] T004 [US1] Write non-UTC timezone test in `web/test/insights-timezone.test.ts`:
  - Construct `now = new Date(2026, 5, 15)` (local June 15) and a transaction
    `{ date: "2026-06-01", kind: "expense", amount_cents: 5000, category: "dining", … }`
  - Call `generateInsights([tx], [], [], now)` under `TZ=America/Los_Angeles` (set via
    `process.env.TZ = 'America/Los_Angeles'` at module scope before imports, or
    `vi.stubEnv` inside the test)
  - Assert at least one insight fires using the June expense (e.g., top-category fires
    with `id` containing `"2026-06"`)
  - Run: `TZ=America/Los_Angeles npx vitest run test/insights-timezone.test.ts`
  - **Must be RED before proceeding to T005**

### Implementation for User Story 1

- [X] T005 [US1] Fix `inInterval` in `web/lib/finance/insights.ts`:
  - Add import: `import { parseLocalDate } from '../format'`
  - Change `inInterval` to: detect date-only strings (`!date.includes('T')`),
    parse them via `parseLocalDate(date)` (local midnight); full ISO strings
    remain `new Date(date)` (exact UTC timestamp unchanged)
  - Run the timezone test again — **must be GREEN**

- [X] T006 [US1] Confirm vector integrity after fix:
  - Run `cd web && npm test` — all 1,375 tests (including `insights.parity.test.ts`) pass
  - Confirm `insights.json` vectors are unaffected (no diff — mid-month noon-UTC
    dates contain `'T'` and use the unchanged code path)

**Checkpoint**: `TZ=America/Los_Angeles npx vitest run test/insights-timezone.test.ts` green; `npm test` fully green.

---

## Phase 4: User Story 3 — CLI leftover-cent ordering verified (P2)

**Goal**: Verify (or fix) that the CLI compute path uses `orderedOwnerIds` identically
to the web app, so the leftover cent lands on the same person regardless of `sort_order`.

**Independent Test**: `npx vitest run test/import/toTransaction.test.ts` — passes after verification.

### Tests for User Story 3 (TDD — write FIRST, verify behavior)

- [X] T007 [US3] Write CLI ordering test in `web/test/import/toTransaction.test.ts`:
  - Import `toTransaction` from `web/scripts/import/engine/toTransaction`
  - Import `computeShares`, `orderedOwnerIds` from `web/lib/splits`
  - Construct household context with two members:
    - `A = { id: 'zzzzzzzz-0000-0000-0000-000000000000', sort_order: 0 }`
    - `B = { id: 'aaaaaaaa-0000-0000-0000-000000000000', sort_order: 1 }`
  - Build a `ParsedTransaction` with `amountCents: 101`, `ownerIds: [A.id, B.id]`
    (sort_order order: A first, B second)
  - Call `toTransaction(parsed, "csv", ctx, uuid, now)`
  - Assert `shares[B.id] === 51` and `shares[A.id] === 50` (leftover to lexically-first B)
  - Also assert `shares[A.id] + shares[B.id] === 101` (sum invariant)
  - Run: `npx vitest run test/import/toTransaction.test.ts`

### Implementation / verification for User Story 3

- [X] T008 [US3] Analyze result of T007:
  - If test PASSES: `toTransaction.ts` already calls `orderedOwnerIds` correctly — no code change needed. Proceed to T009.
  - If test FAILS: fix `web/scripts/import/engine/toTransaction.ts` to call `orderedOwnerIds(owners)` before `computeShares`; re-run until green.

- [X] T009 [US3] Update `PARITY.md` "Canonical leftover-cent order" row:
  - If no divergence found: replace "sort_order can differ" note with
    "Verified 2026-07-18 (spec 027): CLI calls `orderedOwnerIds` before
    `computeShares`; test in `web/test/import/toTransaction.test.ts`."
  - If divergence was fixed: document the fix and the test reference.

**Checkpoint**: `npx vitest run test/import/toTransaction.test.ts` green; PARITY.md updated.

---

## Phase 5: User Story 2 — Oracle coverage for risky engines (P2)

**Goal**: Extend the independent golden-oracle suite to cover amortization schedule,
insights rule math, filter month windows, and lease timing.

**Independent Test**: `npx vitest run test/finance-goldens.test.ts test/finance-properties.test.ts` — all new cases pass.

### Tests for User Story 2 (TDD — add to existing oracle files)

- [X] T010 [P] [US2] Extend `web/test/finance-goldens.test.ts` — amortization schedule golden:
  - Add a `describe('finance goldens — amortization schedule')` block
  - Case 1 — month 1, $300k/6%/30y: `principalCents ≈ 29_865, interestCents ≈ 150_000` (±1¢)
    - Derivation: `r=0.005, M=179865¢; interest=300000*0.005*100=150000¢; principal=M−interest=29865¢`
  - Case 2 — month 2 balance check: after month-1 balance = `30_000_000 − 29_865 = 29_970_135¢`;
    month-2 interest = `floor(29_970_135 * 0.005)` = `149_851¢` (±1¢); principal = `M − interest`
  - Call `upcomingAmortization(2, 30_000_000, 6, 30, '2020-01-01', new Date('2020-01-01T00:00:00Z'))`
  - Assert both entries within ±1¢ of the hand-derived values

- [X] T011 [P] [US2] Extend `web/test/finance-goldens.test.ts` — insights rule-3 budget-over golden:
  - Add a `describe('finance goldens — insights rule 3: budget-over')` block
  - Construct a June transaction: `amount_cents: 12_000, category: 'dining', kind: 'expense',
    date: '2026-06-15T12:00:00.000Z'`
  - Budget: `{ category: 'dining', monthly_limit_cents: 10_000 }`
  - Call `generateInsights([tx], [budget], [], new Date('2026-06-15T12:00:00Z'), 6, undefined, 'en-US')`
  - Assert one insight has `id` matching `budget-over-dining-2026-06`, `severity: 'critical'`,
    `magnitude_cents: 2_000`
  - Derivation: `fraction = 12000/10000 = 1.2 ≥ 1.0; over = 12000 − 10000 = 2000¢`

- [X] T012 [P] [US2] Extend `web/test/finance-goldens.test.ts` — insights rule-5 recurring average truncation golden:
  - Construct 3 dining expenses at merchant "Netflix":
    - `date: '2026-01-01T12:00:00.000Z', amount_cents: 3_100`
    - `date: '2026-01-29T12:00:00.000Z', amount_cents: 3_200` (28-day gap)
    - `date: '2026-02-27T12:00:00.000Z', amount_cents: 3_050` (29-day gap — both ∈ [28,35])
  - Call `generateInsights([...], [], [], new Date('2026-03-15T12:00:00Z'))`
  - Assert a `recurring-2026-03` insight fires with `magnitude_cents: 3_116`
  - Derivation: `Math.trunc((3100+3200+3050)/3) = Math.trunc(3116.67) = 3116¢`

- [X] T013 [P] [US2] Extend `web/test/finance-goldens.test.ts` — `monthBounds` filter-window golden:
  - Import `monthBounds` from `web/lib/transactionFilters`
  - Assert `monthBounds('2026-06')` === `{ dateFrom: '2026-06-01T00:00:00.000Z', dateTo: '2026-07-01T00:00:00.000Z' }`
  - Assert `monthBounds('2026-12')` wraps year: `dateTo: '2027-01-01T00:00:00.000Z'`
  - Derivation: half-open UTC month window, independently computed from wall-clock timestamps

- [X] T014 [P] [US2] Extend `web/test/finance-goldens.test.ts` — `daysUntilNextRent` lease-timing golden:
  - Import `daysUntilNextRent` from `web/components/housing/lease`
  - Lease: `{ lease_start: '2026-01-31', lease_end: '2027-01-31', monthly_rent_cents: 200_000 }`
  - `asOf = new Date(2026, 1, 14)` (Feb 14 local) — due day 31 clamps to Feb 28 in non-leap 2026
  - Assert `daysUntilNextRent(lease, asOf) === 14`
  - Derivation: due day = 31 → clamped to Feb's 28 days → Feb 28; days from Feb 14 = 14

- [X] T015 [P] [US2] Extend `web/test/finance-properties.test.ts` — insights invariants:
  - Add a `describe('insights invariants')` block using a seeded transaction pool
  - Invariant 1: `insights.length <= limit` for any valid input and limit ∈ [1..20]
  - Invariant 2: every `insight.id` matches one of the 8 documented id patterns
    (`top-category-*`, `mom-*`, `budget-{over,near,under}-*`, `cashflow-*`,
    `recurring-*`, `outlier-*`, `trend30-*`, `mortgage-ratio-*`)
  - Invariant 3: every `insight.magnitude_cents >= 0`
  - Invariant 4: insights are sorted — no insight at index i has lower severity rank than index i+1
    (`{critical:0, warning:1, info:2, positive:3}`)

- [X] T016 [US2] Run oracle extension and confirm all new cases pass:
  - `npx vitest run test/finance-goldens.test.ts test/finance-properties.test.ts`
  - All new cases green; zero regressions on existing cases

**Checkpoint**: Oracle extended to cover amortization, insights rules, filter windows, lease timing.

---

## Phase 6: User Story 4 — Honest labels for financial approximations (P3)

**Goal**: Relabel "Equity" and "Net rental" in the housing UI to reflect what these
numbers actually compute; add a paid-off threshold to avoid a spurious ~$2 debt display.

**Independent Test**: `npx tsc --noEmit` (no type errors); grep confirms new copy strings present.

### Implementation for User Story 4

- [X] T017 [US4] Audit housing render sites — find where "Equity" and "Net rental" labels appear:
  - `grep -rn "Equity\|equity\|Net rental\|netRental\|netRentalCents\|currentEquityCents" web/components/ web/app/`
  - Note all files and line numbers for the three label changes

- [X] T018 [US4] Add `PAID_OFF_THRESHOLD_CENTS = 500` constant to `web/lib/finance/mortgage.ts`:
  - Export a named constant: `export const PAID_OFF_THRESHOLD_CENTS = 500`
  - Add a JSDoc comment: "A mortgage whose currentPrincipalBalanceCents is ≤ this value
    is considered fully paid off for display purposes — avoids showing a spurious
    floating-point residual (~$2) after the final amortization payment. Math functions
    return the exact value; this threshold is applied in the render layer only."

- [X] T019 [US4] Relabel "Equity" in the housing component(s) found in T017:
  - Change label text from "Equity" to "Principal paid down"
  - Add a subtitle or `title` attribute: "excludes market value appreciation"
  - Apply the `PAID_OFF_THRESHOLD_CENTS` guard in the same render path:
    if `currentPrincipalBalanceCents(…) <= PAID_OFF_THRESHOLD_CENTS` → show "Paid off"
    instead of the balance amount

- [X] T020 [US4] Relabel "Net rental" in the housing component(s) found in T017:
  - Change label text to "Net rental (P&I only)" or add a subtitle "P&I payment only;
    excludes taxes, insurance, maintenance"

- [X] T021 [US4] `npx tsc --noEmit` — confirm no type errors after label changes

**Checkpoint**: `npx tsc --noEmit` green; housing render sites show updated copy.

---

## Phase 7: User Story 5 — Rounding fairness policy documented (P4)

**Goal**: Document the leftover-cent fairness policy explicitly in `splits.ts` and
`PARITY.md` so it is a conscious, auditable product decision.

**Independent Test**: `grep -A 5 "leftover cents go" web/lib/splits.ts` returns the policy comment.

### Implementation for User Story 5

- [X] T022 [US5] Add policy comment to `web/lib/splits.ts` above the leftover distribution loop:
  - Insert above `while (leftover > 0)`:
    ```
    // Leftover cents go to the canonically-first owner in orderedOwnerIds order
    // (ascending UUID string sort) — a deterministic, sub-cent-magnitude fairness
    // choice, not largest-remainder. This is a conscious product decision: the same
    // owner always absorbs the rounding remainder regardless of how owners were
    // entered, ordered, or stored. Locked by the ownerOrdering golden vectors.
    ```

- [X] T023 [US5] Update `PARITY.md` "Canonical leftover-cent order" row:
  - Expand the "Shared source of truth" cell to include:
    "Policy: leftover cent goes to canonically-first owner (lexical UUID sort) —
    a conscious, documented choice (see `splits.ts` comment and
    `specs/027-finance-model-correctness/contracts/cli-ordering.md`)"

**Checkpoint**: Policy comment readable; PARITY.md updated.

---

## Phase 8: Polish & Integration

**Purpose**: Final integration verification, docs update, commit, push, PR.

- [X] T024 `cd web && npm test` — all tests (1,375 original + new) green
- [X] T025 `npx tsc --noEmit` — zero TypeScript errors
- [X] T026 [P] Update `docs/future_tasks/9.4-finance-model-correctness.md`:
  - Mark A2, A4, A3, B3, B4 as ✅ Done with references to this spec
- [X] T027 [P] Update `docs/finance.md` §16 "Known limitations":
  - Note that A2 (timezone insight bucketing) is resolved in spec 027
- [X] T028 Commit all changes with message: `feat(027): finance model correctness & honest labels`
- [X] T029 `git push -u origin feat/finance-model-correctness`
- [X] T030 `GH_TOKEN=placeholder gh pr create --fill` — open PR against main

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 3 (A2)**: Depends on T001 (baseline green). T004 must be RED before T005.
- **Phase 4 (A4)**: Independent of A2 — can start after Phase 1
- **Phase 5 (A3)**: Independent of A2 and A4 — T010–T015 can run in parallel
- **Phase 6 (B3)**: Independent of all above — pure UI copy
- **Phase 7 (B4)**: Independent of all above — pure comment
- **Phase 8 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US1 (A2)**: Phase 1 only
- **US2 (A3)**: Phase 1 only; T010–T015 are fully parallel
- **US3 (A4)**: Phase 1 only
- **US4 (B3)**: Phase 1 only; T017 must precede T018–T020
- **US5 (B4)**: Phase 1 only; fully independent

### Parallel Opportunities

```bash
# After T001 (baseline green), all of these can run concurrently:
T002 + T003              # create test file shells
T004                     # A2 test (red)
T007                     # A4 test
T010 + T011 + T012 + T013 + T014 + T015  # A3 oracle goldens (all parallel)
T017                     # B3 audit
T022 + T023              # B4 policy comment + PARITY.md
```

---

## Implementation Strategy

### TDD Order (per work item)

```
A2: T001 → T002 → T004 (RED) → T005 (GREEN) → T006
A4: T003 → T007 (verify) → T008 → T009
A3: T010–T015 (all parallel) → T016
B3: T017 → T018 → T019 → T020 → T021
B4: T022 → T023
Polish: T024 → T025 → T026 → T027 → T028 → T029 → T030
```

### MVP Scope (A2 fix alone delivers the highest-value correctness fix)

1. T001 (baseline)
2. T002 (create test file)
3. T004 (RED test)
4. T005 (fix — GREEN)
5. T006 (regression check)
6. Done — A2 is shipped; remaining items are independently additive

---

## Notes

- All test IDs (T001–T030) reference this spec. Commit after each logical group.
- The `TZ=` prefix on CLI runs sets the timezone for that process only; the vitest
  config pin (`TZ=UTC` in `vitest.config.ts`) applies to the full suite run.
  Isolate the non-UTC test in its own file so it can be run standalone with an
  explicit TZ override without fighting the global pin.
- Never hand-edit `shared/test-vectors/*.json`; never run `npm run gen:vectors`
  for this feature (no intended behavior change to the vectored engines).

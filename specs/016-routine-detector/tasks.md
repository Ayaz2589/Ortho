# Tasks: Transaction-Based Routine Detector (Prototype)

**Feature**: `016-routine-detector` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Approach**: Test-driven (Constitution VI). For each story, write the failing
Vitest test(s) first, then implement `web/lib/finance/routines.ts` until green.
All work is additive and **outside** the golden-vector harness — no changes to
`insights.ts`, no golden vectors, no iOS.

**Absolute repo root**: `/Users/ayazuddin/Development/personal/Ortho`
All paths below are relative to `web/` unless noted.

**Files touched (whole feature)**:
- `web/lib/finance/routines.ts` (NEW — the detector)
- `web/lib/testdata/routine-demo.ts` (NEW — planted-routine fixture)
- `web/scripts/routines-demo.ts` (NEW — tsx harness)
- `web/test/routines.test.ts` (NEW — Vitest suite)
- `specs/016-routine-detector/tasks.md` (this ledger)

---

## Phase 1: Setup

- [x] T001 Confirm the web toolchain runs in this environment: from `web/`, `npm test` executes (Vitest) and `npx tsx --version` works (tsx is already a devDependency, used by `scripts/gen-vectors.ts`). No new dependencies are added.
- [x] T002 Read the existing shape references so new code matches convention: `web/lib/types.ts` (`Transaction`), `web/lib/testdata/seed.ts` (fixture style + `iso(daysAgo)` clock-independent base), `web/lib/finance/insights.ts` (money-format helper pattern), and `web/scripts/gen-vectors.ts` (tsx harness pattern).

---

## Phase 2: Foundational (blocking prerequisite for all stories)

**Goal**: the shared public surface all stories import. Types + tunable constants
only — no detection logic yet.

- [x] T003 Create `web/lib/finance/routines.ts` with the exported **types** from the contract: `Cadence`, `TimeBucket`, `GroupingKind`, `Routine`, `RoutineParams`, `RoutineReport`, `DetectOptions` (see `contracts/routine-detector.md`). Import `Transaction` from `@/lib/types`.
- [x] T004 In `web/lib/finance/routines.ts` add the exported **tunable constants** with documented defaults (FR-007): `MIN_SUPPORT_N = 3`, `LOOKBACK_WEEKS_M = 12`, `NOON_UTC_SENTINEL_HOUR = 12`, `HOUR_BUCKETS` (research D3 boundaries), `CADENCE_PERIODS` (research D2 period/tolerance table), `CADENCE_MONTHLY_MULTIPLIER` (research D7 table). Each constant carries a one-line comment citing its research decision.

**Checkpoint**: `routines.ts` compiles (types + constants exported); stories can now import.

---

## Phase 3: User Story 1 — Detect routines from transaction history alone (P1) 🎯 MVP

**Goal**: `detectRoutines()` + its pure helpers turn a `Transaction[]` into a
ranked `RoutineReport` using merchant+category grouping, cadence classification,
time-bucketing, and support/regularity confidence.

**Independent test**: `test/routines.test.ts` US1 block asserts cadence, bucket,
count, median amount on a known fixture, no routine from one-offs, and
determinism — with no UI and no network.

### Tests first (write, expect red)

- [x] T005 [US1] In `web/test/routines.test.ts` write failing unit tests for the pure helpers: `normalizeMerchant` (case/whitespace/trailing store-number trimming — research D8), `classifyCadence(sortedDates)` (daily/weekday/weekly/biweekly/monthly/irregular by median gap — research D2), `hourBucket(date)` (returns `null` for exactly noon-UTC sentinel; correct bucket otherwise — research D3), `confidenceScore` (support × regularity, evenly-spaced > erratic — research D5). Use hand-computed expected values and injected fixed dates.
- [x] T006 [US1] In `web/test/routines.test.ts` write failing tests for `detectRoutines()` covering spec US1 acceptance scenarios: (1) weekday-morning merchant → `weekday` cadence + `morning` bucket + correct count + median amount; (2) rotating-merchant weekly groceries → `category` routine, `weekly`, even with no single merchant clearing N; (3) single-occurrence merchant → not surfaced; (4) two runs over the same input+`now` are deep-equal (determinism, FR-010); (5) income + transfer rows ignored (FR-002). Build small inline fixtures with a fixed `now`.

### Implementation (make green)

- [x] T007 [US1] Implement the pure helpers in `web/lib/finance/routines.ts`: `normalizeMerchant`, `classifyCadence`, `hourBucket`, `confidenceScore` (and a small internal `median`/`gapsDays` util). Make T005 pass without touching later behavior.
- [x] T008 [US1] Implement grouping in `web/lib/finance/routines.ts`: filter to `kind === 'expense'` and to the `[now − M weeks, now]` window, then build two candidate streams — `byNormalizedMerchant` and `byCategory` (FR-002/FR-003/FR-006).
- [x] T009 [US1] Implement per-group routine construction in `web/lib/finance/routines.ts`: cadence, time bucket (majority real-hour, else `null` → label omits time phrase), median typical amount, occurrence count, `firstSeen`/`lastSeen`, plainspoken `label`, and `confidence`. Enforce the `>= minSupportN` surface bar and drop `irregular` below the bar (FR-004/FR-005/FR-008/FR-009).
- [x] T010 [US1] Implement category-vs-merchant de-duplication (drop a category routine fully explained by an already-surfaced merchant routine — research D1) and the deterministic ranking + stable tiebreak (confidence → monthly cost → count → kind → identity string — research D6, FR-010) in `web/lib/finance/routines.ts`.
- [x] T011 [US1] Assemble `detectRoutines(transactions, options)` returning `{ routines, monthlyRoutineCostCents (placeholder sum for now), params }`, defaulting `minSupportN`/`lookbackWeeksM` from constants and requiring `options.now`. Run `npx vitest run test/routines.test.ts` — US1 tests green.

**Checkpoint**: US1 done — the core bet is computable and independently tested.

---

## Phase 4: User Story 2 — Validate the bet against sample data (P2)

**Goal**: a richer planted-routine fixture + the existing sparse seed as control,
and a one-command harness that prints ranked routines for a human go/no-go.

**Independent test**: harness runs for both datasets and prints a legible ranked
table; demo surfaces the planted routines, seed stays mostly quiet.

### Tests first (write, expect red)

- [x] T012 [P] [US2] In `web/test/routines.test.ts` add a failing test that runs `detectRoutines` over the demo fixture (T013) with the fixture's fixed reference date and asserts SC-001 (all planted routines surface with correct cadence class) and SC-002 (planted one-off noise does NOT surface).

### Implementation (make green)

- [x] T013 [P] [US2] Create `web/lib/testdata/routine-demo.ts` exporting a builder that returns `Transaction[]` (same shape/`iso(daysAgo)` base as `seed.ts`) planting: weekday coffee (Mon–Fri mornings ~$5), weekday transit (Mon–Fri mornings ~$2.90), weekly groceries (Saturdays, 3 rotating merchants ~$70–90), monthly subscription ($15.99), plus 2–3 genuine one-offs as noise (research D9). Export the fixed reference date used.
- [x] T014 [US2] Create `web/scripts/routines-demo.ts` (plain tsx, no Next/Supabase): import `detectRoutines`, the demo builder, and `buildSeedTables` from `@/lib/testdata/seed` (map its `transactions` rows to `Transaction[]`). Support `--dataset=demo|seed` (default: both). Print a ranked table per dataset — `label · cadence · typical $ · count · confidence` — then an `Estimated monthly routine cost: $X` line, money formatted as money (Constitution IV). Verify `npx tsx scripts/routines-demo.ts` runs and T012 passes.

**Checkpoint**: US2 done — the bet is inspectable from output alone.

---

## Phase 5: User Story 3 — Estimated monthly routine cost roll-up (P3)

**Goal**: convert each routine's typical amount to a monthly-equivalent by cadence
and sum into `monthlyRoutineCostCents`.

**Independent test**: mixed-cadence routine set rolls up to the hand-computed sum;
empty input → 0.

### Tests first (write, expect red)

- [x] T015 [US3] In `web/test/routines.test.ts` add failing tests: `monthlyEquivalentCents(cadence, typicalCents)` returns the documented multiplier product for each cadence (research D7); `detectRoutines` over a mixed-cadence fixture yields `monthlyRoutineCostCents` equal to the hand-computed sum; empty input → `monthlyRoutineCostCents: 0` with `routines: []` (US3 AC-2, never throws).

### Implementation (make green)

- [x] T016 [US3] Implement `monthlyEquivalentCents` in `web/lib/finance/routines.ts` using `CADENCE_MONTHLY_MULTIPLIER`, set each routine's `monthlyEstimateCents`, and compute `monthlyRoutineCostCents` as their integer-cent sum (replacing the T011 placeholder). Run `npx vitest run test/routines.test.ts` — all US1/US2/US3 tests green.

**Checkpoint**: all stories complete.

---

## Phase 6: Polish & Cross-Cutting

- [x] T017 Run the full suite from `web/`: `npm test` — confirm green and that no existing suite moved (SC-006: `insights.*`, golden-vector, and all other tests unchanged). If `lib/` coverage threshold gates, confirm `routines.ts` is covered.
- [x] T018 [P] Run the harness for the go/no-go call: `npx tsx scripts/routines-demo.ts` for both datasets; capture the output and paste it into this tasks.md under a "Harness output" note, then record the go/no-go read on the findings.md bet (does `merchant + cadence` alone feel insightful?).
- [x] T019 [P] Sanity-confirm the additive/no-drift invariant: `git status` shows only the four new files + this ledger + the CLAUDE.md SpecKit pointer changed; `git diff --stat` shows no edits to `insights.ts`, `shared/test-vectors/**`, or `iOS/**`.
- [x] T020 Update this tasks.md ledger (check off completed tasks, note any deviations from plan/research as a short "Deviations" list).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** must finish before any story.
- **US1 (Phase 3)** is the MVP and blocks nothing else logically, but US2 and US3
  build on `detectRoutines`, so US1 should land first.
- **US2 (Phase 4)** depends on US1 (`detectRoutines` exists). T013 (fixture) and
  T012 (its test) are `[P]` vs each other only in authoring; T014 harness depends
  on T013.
- **US3 (Phase 5)** depends on US1 (routine objects exist) and finalizes the
  `monthlyRoutineCostCents` the T011 placeholder stubbed.
- **Phase 6** after all stories.

## Parallel Opportunities

- T013 (`routine-demo.ts`) and the US1 implementation are different files, but US2
  needs US1's `detectRoutines`, so run T013 authoring alongside US1 tests, wire the
  harness after. T018/T019 (`[P]`) are independent read-only verification steps.
- Within a phase, tasks touching the **same** file (`routines.ts`, `routines.test.ts`)
  are NOT `[P]` — they serialize.

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1 (T001–T011)**: proves the bet is computable and locked
  by tests. Could stop here and still answer "is the math sound?".
- **Full validation = + US2 (T012–T014)**: makes the bet *visible* — the actual
  go/no-go deliverable.
- **Polish payoff = + US3 (T015–T016)**: the calm "≈ $X/mo" summary.
- Ship incrementally; each checkpoint is independently green.

## Harness output (T018)

`npx tsx scripts/routines-demo.ts` (reference date = anchor; 12-week window, min support 3):

```
=== DEMO fixture (planted routines) ===
transactions: 135  ·  window: last 12 weeks  ·  min support: 3
  #  confidence  cadence           typical  count  monthly   routine
  1  1.000       weekly/afternoon  $78.50   12     $341.08   Groceries — weekly afternoons
  2  1.000       monthly           $15.99    3     $15.99    Streamly — monthly
  3  0.432       weekday/morning   $5.00    59     $108.50   Blue Bottle Coffee — weekday mornings
  4  0.432       weekday/morning   $2.90    59     $62.93    MTA — weekday mornings
  Estimated monthly routine cost: $528.50

=== SEED (spec-015 sparse control) ===
transactions: 16  ·  window: last 12 weeks  ·  min support: 3
  (no routines detected — stays quiet)
  Estimated monthly routine cost: $0
```

### Go / no-go read on the findings.md bet

**GO.** `merchant + cadence` **alone** — no location, no permission — surfaced all
four planted routines with the right cadence, correct time-of-day where a real
hour existed, and a legible monthly-cost roll-up. The rotating-merchant grocery
run surfaced at the **category** level (no single grocery merchant repeated
enough), which is the exact case findings.md said location wasn't needed for. The
sparse spec-015 seed correctly **stays quiet** (nothing clears support inside the
window), i.e. no false positives. Confidence sensibly separated the perfectly
even weekly/monthly routines (1.000) from the weekday coffee/transit whose
Fri→Mon gaps make spacing less even (0.432). Conclusion: location is genuine
*upside*, not a dependency — the feature de-risks, as the doc predicted.

## Deviations

- **CADENCE_PERIODS type**: the contract listed `Record<Exclude<Cadence,'irregular'>, …>`;
  implemented as `Record<'daily'|'weekly'|'biweekly'|'monthly', …>` because
  `weekday` is *derived* (weekday-restricted daily spacing), not a gap-period entry.
  Behaviorally identical; the code is the source of truth.
- **US2 "one-off" test fixture (T012)**: the first draft used 5 distinct merchants
  that all shared category `entertainment` on consecutive days — which the detector
  (correctly) surfaced as a category routine. Fixed the fixture to genuinely
  non-repeating spend (distinct merchant AND category, spread out). This was a
  test-data bug that actually *validated* the category-grouping path.
- **Seed control result**: within the 12-week window the seed's repeating-ish rows
  (rent ×2, groceries ×2 after the 3rd falls outside the window) all sit below
  N=3, so the control surfaces *zero* routines rather than "a few weak ones" — an
  even cleaner "stays quiet" demonstration than anticipated.
- **Demo size**: the planted fixture yields 135 transactions (≈59 weekday coffee +
  59 transit + 12 grocery + 3 subscription + 2 noise), all clock-independent.

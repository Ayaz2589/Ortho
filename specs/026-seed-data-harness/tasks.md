---
description: "Task list for Seed-Data Harness + Edge-Case Coverage Corpus"
---

# Tasks: Seed-Data Harness + Edge-Case Coverage Corpus

**Input**: Design documents from `/specs/026-seed-data-harness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution Principle VI (Test-Driven & Regression-Safe) is
NON-NEGOTIABLE for money/date logic, and this feature *is* finance-test
infrastructure. Tests are written before the code that satisfies them.

**Organization**: By user story (US1 = corpus engine, US2 = A2/A4 reproduction,
US3 = DB seeding). Each story is an independently testable increment.

**Working dir**: all paths are under `web/` unless noted. Run commands from `web/`.

## Path Conventions

Generator + tests live in `web/test/corpus/` (pure, importable by vitest AND `tsx`
scripts, never reachable from the app bundle — research D6). The seeder is a
`web/scripts/` runner. No `web/lib/` or `web/app/` file imports `test/corpus/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory, scripts, and the second vitest config that later phases need.

- [x] T001 Create the generator directory tree: `web/test/corpus/` with an empty `web/test/corpus/__snapshots__/.gitkeep` and a stub `web/test/corpus/index.ts` (exports to be filled in). Confirm nothing under `web/lib/` or `web/app/` imports it.
- [x] T002 Add npm scripts to `web/package.json`: `"test:tz": "vitest run -c vitest.tz.config.ts"`, `"seed:corpus": "tsx scripts/seed-corpus.ts"`, `"gen:corpus": "tsx scripts/gen-corpus.ts"`.
- [x] T003 [P] Create `web/vitest.tz.config.ts` — copy the default config but set `process.env.TZ = 'America/New_York'` and `include: ['test/**/*.tz.test.ts']`; and in `web/vitest.config.ts` add `'**/*.tz.test.ts'` to `test.exclude` so the default `TZ=UTC` run never picks up the timezone-repro file (research D4).

**Checkpoint**: `npm run test:tz` runs (0 tests, config valid); default `npm test` still green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Deterministic primitives + shared types every story builds on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Write `web/test/corpus/prng.test.ts` asserting a seeded PRNG is deterministic (same seed → same sequence; different seed → different) and never calls `Math.random`. (Fails: no `prng.ts` yet.)
- [x] T005 Implement `web/test/corpus/prng.ts` — `mulberry32(seed)` returning `{ next(): number; int(maxExclusive): number; pick<T>(arr): T; sub(label): Prng }` (label-derived sub-seeds for independent scenarios). Make T004 green.
- [x] T006 [P] Write `web/test/corpus/clock.test.ts` for the fixed-epoch date helpers: month-boundary dates (1st/last) for months of 28/29/30/31 days incl. Feb leap (2028) and non-leap (2027), and a `nonNoonUtc(dateISO, hhmm)` helper that stamps a non-`12:00Z` time. (Fails: no `clock.ts`.)
- [x] T007 Implement `web/test/corpus/clock.ts` — a fixed `EPOCH` anchor (no `Date.now()`), `firstOfMonth`/`lastOfMonth`/`isoAt(y,m,d,hh,mm)` builders, leap-aware month lengths, and `nonNoonUtc`. Make T006 green.
- [x] T008 [P] Define corpus model types in `web/test/corpus/model.ts` — `Corpus`, `CorpusMeta` (no timestamp), `HouseholdScenario`, `HouseholdMember`, `GeneratedTransaction`, `GeneratedProperty`, `TxIntent` (per data-model.md). Re-use `web/lib/types.ts` row shapes; add no duplicate row definitions.
- [x] T009 Define the coverage matrix in `web/test/corpus/coverage.ts` — the `Dimension` union + `DIMENSIONS: readonly Dimension[]` (exact list in data-model.md) + a `coverageOf(corpus): Record<Dimension, string[]>` that reads each scenario's `dimensions`. (Mapping is trivial now; scenarios populate it in US1.)
- [x] T010 [P] Write `web/test/corpus/serialize.test.ts`: `serializeCorpus` is byte-stable (key-order-independent input → identical output), ends with `\n`, and round-trips through `readSnapshot`. (Fails: no `serialize.ts`.)
- [x] T011 Implement `web/test/corpus/serialize.ts` — recursive key-sorted `stableStringify` → `JSON.stringify(sorted, null, 2) + '\n'`; `serializeCorpus`, `writeSnapshot(path?)`, `readSnapshot(path?)` (default `test/corpus/__snapshots__/corpus.snapshot.json`). Make T010 green.

**Checkpoint**: primitives + types + serializer tested and green; no scenarios yet.

---

## Phase 3: User Story 1 — Deterministic edge-case corpus for the test suite (Priority: P1) 🎯 MVP

**Goal**: A pure `generateCorpus(seed)` that emits a byte-stable, fully
share-reconciling corpus covering every FR-004 dimension, consumable in-memory.

**Independent test**: `npm test` — determinism, reconciliation, coverage
completeness, referential integrity, and snapshot match all pass.

### Tests for US1 (write first)

- [x] T012 [P] [US1] Write `web/test/corpus/corpus.test.ts` — the core suite (all currently failing): (a) **determinism** `serializeCorpus(generateCorpus(S)) === serializeCorpus(generateCorpus(S))` (SC-001); (b) **reconciliation** every `GeneratedTransaction` has `sum(shares)===amount_cents` (SC-003); (c) **coverage completeness** every `DIMENSIONS` entry maps to ≥1 label via `coverageOf` (SC-002); (d) **referential integrity** all FKs resolve (data-model rule 2/2b); (e) **size band** scenario count in the low hundreds (SC-007); (f) **currency storage** JPY-lens amounts stay USD cents and display-round to whole yen (research D3); (g) **snapshot** `serializeCorpus(generateCorpus())` equals the committed snapshot (FR-002).
- [x] T013 [P] [US1] Write `web/test/corpus/reuse.test.ts` — a guard that a known leftover-cent case built by the generator equals `computeShares(...)` from `web/lib/splits.ts` directly, proving no forked split math (FR-005/FR-013).

### Implementation for US1

- [x] T014 [US1] Implement `web/test/corpus/builders.ts` — pure builders: `buildHousehold`, `buildPerson` (explicit `sort_order`), `buildMember`, `buildCard`, `buildTransaction` (derives `shares` via `computeShares(amount, orderedOwnerIds(owners), split)` from `web/lib/splits.ts`; sets `owner_ids`, `paid_by`, `date` with explicit time-of-day, `kind`/`category`), `buildProperty`/`buildMortgage`/`buildLease`/`buildUnit`/`buildRentalPayment`, `buildBudget`. No split/currency/order math re-implemented.
- [x] T015 [US1] Implement `web/test/corpus/scenarios.ts` — the labelled coverage scenarios, each tagging its `dimensions`, spanning FR-004: joint & separate-finances households; even/percent/value splits; leftover-cent cases; display-currency lenses USD/EUR/JPY/BDT; month-boundary (1st & last) across 28/29/30/31-day months incl. Feb leap+non-leap; refunds/negatives; sparse & dense months; property with mortgage, with lease, **paid-off** mortgage (schedule complete → residual), multifamily mixed occupancy; budgets in under/near/over bands; recurring merchants across months; the **`order-mismatch`** household (`sort_order` ≠ lexical id, with a leftover-cent even split — feeds US2/A4); and the **`tz-boundary-non-noon`** household (boundary rows at non-`12:00Z` times — feeds US2/A2). Target a few hundred households total by parameterized variation, not clones.
- [x] T016 [US1] Implement `web/test/corpus/generate.ts` — `generateCorpus(seed?)` assembles all scenarios with per-scenario sub-seeds; `toTables(corpus)` flattens to Supabase-shaped table maps in stable order (referential integrity preserved).
- [x] T017 [US1] Finalize `web/test/corpus/coverage.ts` `coverageOf` against real scenarios and fill `web/test/corpus/index.ts` public exports (`generateCorpus`, `toTables`, `serializeCorpus`, `writeSnapshot`, `readSnapshot`, `coverageOf`, `DIMENSIONS`, types) per `contracts/generator-api.md`.
- [x] T018 [US1] Implement `web/scripts/gen-corpus.ts` (the `gen:corpus` runner) — `writeSnapshot(generateCorpus())`; run it to produce and commit `web/test/corpus/__snapshots__/corpus.snapshot.json`.
- [x] T019 [US1] Run `npm test`; make T012 + T013 green (iterate scenarios/builders until every dimension is covered and all reconcile). Confirm `lib/` coverage threshold is unaffected.

**Checkpoint**: US1 done — the corpus engine is a usable, snapshotted test fixture. **MVP.**

---

## Phase 4: User Story 2 — Reproduce the A2 and A4 defects (Priority: P1)

**Goal**: Turn the two suspected defects into automated, repeatable observations
using US1's `order-mismatch` and `tz-boundary-non-noon` scenarios.

**Independent test**: `npm test` shows the A4 divergence; `npm run test:tz`
reproduces the A2 misbucketing (and the same A2 assertion under UTC does not).

### Tests for US2 (these ARE the deliverable)

- [x] T020 [P] [US2] Write `web/test/corpus/splits-divergence.test.ts` (default `TZ=UTC` run) — locate the `order-mismatch` scenario's leftover-cent transaction; compute the leftover-cent recipient with owners ordered by `orderedOwnerIds` (app) vs by `sort_order` (what `import/db/lookups.ts:37` `.order('sort_order')` yields) and assert the recipient **differs** (SC-005 / FR-007). Add a control: an aligned-order household yields the **same** recipient under both orderings.
- [x] T021 [US2] Write `web/test/corpus/insights-timezone.tz.test.ts` (runs only under `vitest.tz.config.ts`) — feed the `tz-boundary-non-noon` transactions to the month-bucketing path in `web/lib/finance/insights.ts` and assert ≥1 boundary row lands in the **wrong** month under `America/New_York` (SC-004 / FR-006). Document it as an **expected-to-change lock** (pins current buggy behavior for the §9.4 fix).
- [x] T022 [US2] Add a UTC-control assertion (in `corpus.test.ts` or a sibling default-run test) that the SAME A2 boundary rows bucket **correctly** under `TZ=UTC`, proving the defect is timezone-gated and explaining why UTC-pinned CI missed it (spec US2 acceptance #2).

### Implementation for US2

- [x] T023 [US2] If needed, add a tiny read-only helper `web/test/corpus/ordering.ts` exposing `bySortOrder(people)` and `byCanonical(people)` so both tests derive owner orderings the same way the CLI/app do (thin wrappers; no new math). Wire exports through `index.ts`.
- [x] T024 [US2] Run `npm test` (A4 green) and `npm run test:tz` (A2 reproduced); confirm both are deterministic and the A2 control passes under UTC.

**Checkpoint**: US2 done — A2 and A4 are reproducible on demand; §9.4 now has failing/locked cases to fix against.

---

## Phase 5: User Story 3 — Seed a development / demo database (Priority: P2)

**Goal**: A guarded runner that populates a local/dev Supabase from the corpus,
idempotently, refusing non-local targets.

**Independent test**: `npm run seed:corpus` against a local stack populates rows;
re-running creates no duplicates; a non-local URL is refused.

### Tests for US3 (write first)

- [x] T025 [P] [US3] Write `web/test/corpus/seed-guard.test.ts` — pure unit test of the safe-target predicate: `localhost`/`127.0.0.1`/`[::1]`/`*.local` allowed; any other host refused unless `--i-understand-this-is-not-local` + `SEED_ALLOW_REMOTE=1`. (Fails: predicate not implemented.)

### Implementation for US3

- [x] T026 [US3] Implement the safe-target predicate `isLocalSupabaseUrl(url)` + opt-in check in `web/scripts/seed-corpus.ts` (or a small `web/test/corpus/seed-guard.ts` it imports, so the test stays pure). Make T025 green.
- [x] T027 [US3] Implement `web/scripts/seed-corpus.ts` per `contracts/seed-cli.md` — args `--seed`, `--dry-run`, `--i-understand-this-is-not-local`; reuse `web/scripts/import/db/client.ts` (`loadEnv`, `makeClient` admin mode) and `web/scripts/import/db/persist.ts` (`persist` for tx+shares); insert households→people→members→cards→properties→mortgage_info→lease_info→units→rental_payments→budgets with `upsert onConflict:id` for idempotence; enforce the guard before any write; print per-table counts.
- [ ] T028 [US3] Validate manually against a local stack (quickstart §4): `supabase start` → `npm run seed:corpus -- --dry-run` (counts, no writes) → `npm run seed:corpus` → confirm app screens render varied households and a second run adds no duplicates. **OPERATOR-RUN — not executable in the CI sandbox** (no local Supabase; the only configured URL is the shared hosted project, which the guard correctly REFUSES). The guard + dry-run counts are verified by `seed-guard.test.ts` and the dry-run smoke (231 households / 15,971 rows, guard REFUSE on the hosted URL).

**Checkpoint**: US3 done — a demo/dev DB can be populated safely and repeatably.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T029 [P] Add `web/test/corpus/no-bundle-import.test.ts` (or extend an existing arch test) asserting no file under `web/lib/` or `web/app/` imports from `test/corpus/` — keeps the corpus out of the shipped bundle (research D6).
- [x] T030 [P] Update docs: add a short "Coverage corpus (spec 026)" note to `docs/web.md` (and a pointer from `docs/index.md`) describing `generateCorpus`, `npm run test:tz`, and `npm run seed:corpus`; mark §9.1 as delivered in `docs/future_tasks/9.1-seed-data-harness-coverage.md` / `index.md`.
- [x] T031 Run the full gate locally: `npm test`, `npm run test:tz`, `tsc --noEmit` (typecheck), and `npm run test:coverage` — confirm green, `lib/` coverage threshold met, and the committed snapshot is up to date (a clean `git diff` after `npm run gen:corpus`).
- [x] T032 [P] Self-review the diff with `/code-review` (high) — 3 findings, all fixed: (1) refund modelled as negative amount violated the DB `amount_non_negative` check → now a positive income credit (`refund-credit`); (2) seeder wrote readable string ids into `uuid` columns → added deterministic `uuidFrom` remap (`test/corpus/ids.ts`); (3) `toTables` unused destructure simplified.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → {**US2 (P4)**, **US3 (P5)**} → **Polish (P6)**.
- **US2 and US3 both depend on US1** (they consume `generateCorpus`/`toTables` and its scenarios) but are **independent of each other** — they can proceed in parallel once US1 is green.
- Within a phase, `[P]` tasks touch different files and can run together. Test tasks precede the implementation they pin (TDD).

## Parallel Opportunities

- Foundational: T004+T006+T008+T010 (four independent files/tests) in parallel; each impl (T005/T007/T011) follows its test; T009 after T008.
- US1: T012 + T013 (two test files) in parallel before T014–T019.
- After US1: run **US2 (T020–T024)** and **US3 (T025–T028)** as two parallel tracks.
- Polish: T029 + T030 + T032 in parallel; T031 last (full gate).

## Independent Test Criteria (per story)

- **US1**: `npm test` — corpus is deterministic, all shares reconcile, all
  dimensions covered, snapshot matches. Delivers systematic edge coverage alone.
- **US2**: `npm test` (A4 divergence) + `npm run test:tz` (A2 misbucket, with UTC
  control) — both defects observable on demand.
- **US3**: `npm run seed:corpus` populates a local DB, idempotent, non-local
  refused.

## Suggested MVP Scope

**US1 (Phase 1–3)** — the deterministic coverage corpus + snapshot. It stands
alone as finance-test infrastructure and is the prerequisite for both US2 and US3.

## Format validation

All tasks use `- [ ] TNNN [P?] [Story?] description + file path`; setup/foundational/
polish carry no story label; US1/US2/US3 tasks carry their labels. ✅

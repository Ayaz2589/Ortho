# Implementation Plan: Seed-Data Harness + Edge-Case Coverage Corpus

**Branch**: `026-seed-data-harness` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-seed-data-harness/spec.md`

## Summary

Build a **pure, deterministic corpus generator** in the web workspace that emits
a deliberately diverse set of household scenarios spanning every branch of
Ortho's finance model, plus a canonical serializer (byte-stable, snapshotted) and
two consumers: an in-memory test fixture and a guarded local/dev-DB seeder.

Technical approach: a small seeded PRNG + a set of pure *builder* functions that
assemble households/members/transactions/shares/properties/mortgages/leases/units/
rental-payments/budgets, driven by a table of **labelled coverage scenarios**.
The generator reuses `web/lib/splits.ts` (never forks split math) and stores money
as USD cents (currency is a *display* concern, exercised via a per-scenario
display-currency label, not a fabricated column). Two coverage scenarios are
constructed specifically to make the **A2** (timezone insight-bucketing) and
**A4** (owner-ordering leftover-cent) defects observable in automated tests —
A2 via boundary-dated rows stored at non-noon-UTC times evaluated under a second
vitest config pinned to `America/New_York`; A4 via a household whose `sort_order`
disagrees with lexical id order.

## Technical Context

**Language/Version**: TypeScript (web workspace; Node ≥ 20.19 / 22.12, run via `tsx`)

**Primary Dependencies**: existing `web/lib` (`splits.ts`, `finance/money.ts`,
`finance/currency.ts`, `finance/insights.ts`, `types.ts`); `@supabase/supabase-js`
(seeding, reused via the import CLI's `db/client.ts` + `db/persist.ts`); `vitest`.

**Storage**: In-memory for the test corpus; a **local/dev Supabase** instance for
the optional seeder (guarded — never a shared/hosted target). No new tables, no
migration — the corpus maps onto the existing schema.

**Testing**: `vitest` (`npm test`, `TZ=UTC` pinned in `vitest.config.ts`). A second
config `vitest.tz.config.ts` pinned to `TZ=America/New_York` runs the A2
reproduction test only. New `npm` scripts: `test:tz`, `seed:corpus`, `gen:corpus`.

**Target Platform**: Node dev/test tooling. The generator **must not be reachable
from the app bundle** (unlike `lib/testdata/seed.ts`, which ships behind
`isTestBuild()`), so it lives outside `lib/`.

**Project Type**: Existing web app (Next.js) + an added dev/test tooling module.

**Performance Goals**: Generation of the full corpus completes fast enough for
test setup (target < 1s wall for a few-hundred-household corpus). Not a
throughput/scale feature.

**Constraints**: Deterministic (no `Date.now()`, no `Math.random()` — seeded PRNG
+ a fixed epoch anchor); byte-stable canonical serialization; every transaction's
shares reconcile to its amount exactly; no forked split/currency/ordering logic;
seeder refuses non-local targets.

**Scale/Scope**: Coverage over volume — on the order of a few hundred deliberately
varied households (not thousands of clones). ~12 labelled coverage dimensions
(FR-004) each represented by ≥ 1 discoverable household.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — *Directly served.*
  The feature is finance-test infrastructure. Work is TDD: failing tests for
  reconciliation, coverage completeness, byte-stability, and the A2/A4
  reproductions precede the generator code. Money/date logic stays locked by
  deterministic fixtures; the committed corpus snapshot is itself a
  regression/pinning artifact. Reference dates are injected (fixed epoch), never
  the real clock. ✅
- **I / II / IV. Design system, calm, voice** — *N/A.* No user-facing UI is added
  (FR: no in-app corpus browser). No colors, type, or copy introduced. Not
  violated. ✅
- **III. Right Form Factor / V. Accessible** — *N/A.* No UI surface. ✅
- **"All money stored as USD cents, converted at render"** (Additional
  Constraints) — *Honored.* The corpus stores USD cents; the multi-currency
  dimension is exercised through the display layer, no per-row currency column
  invented. ✅
- **No second definition of shared concepts** — *Honored.* FR-005/FR-013: split
  math from `splits.ts`, currency from `finance/currency.ts|money.ts`, ordering
  from `orderedOwnerIds`. The generator composes them; it does not re-derive them. ✅

**Result: PASS.** No deviations to justify → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/026-seed-data-harness/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (PRNG, serialization, A2/A4 repro, seeding safety)
├── data-model.md        # Phase 1 — corpus scenario entities + coverage matrix
├── quickstart.md        # Phase 1 — how to run tests, regen snapshot, seed a local DB, run TZ repro
├── contracts/
│   ├── generator-api.md  # generateCorpus / serializeCorpus / coverage-dimension enum
│   └── seed-cli.md       # seed:corpus CLI contract + safe-target guard
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
web/
├── test/
│   └── corpus/                      # the generator — pure TS, importable by tests AND scripts,
│       │                           #   deliberately NOT reachable from the app bundle
│       ├── prng.ts                  # seeded deterministic PRNG (mulberry32); no Math.random
│       ├── clock.ts                 # fixed epoch anchor + date/time builders (no Date.now)
│       ├── model.ts                 # corpus scenario types (HouseholdScenario, Corpus, Dimension)
│       ├── builders.ts              # pure builders: household/member/tx+shares/property/budget
│       ├── scenarios.ts             # the labelled coverage-matrix scenario definitions (FR-004)
│       ├── generate.ts              # generateCorpus(seed): Corpus  (top-level assembly)
│       ├── serialize.ts             # canonical stable serialization (sorted keys) + snapshot IO
│       ├── coverage.ts              # Dimension enum + coverageOf(corpus) mapping for assertions
│       ├── index.ts                 # public exports
│       ├── __snapshots__/corpus.snapshot.json   # committed byte-stable regression artifact
│       ├── corpus.test.ts           # determinism, reconciliation, coverage-completeness, snapshot
│       ├── splits-divergence.test.ts# A4 reproduction (sort_order vs lexical-id leftover cent)
│       └── insights-timezone.tz.test.ts   # A2 reproduction — RUN ONLY under vitest.tz.config.ts
├── scripts/
│   └── seed-corpus.ts               # guarded local/dev-DB seeder (reuses import db/client + persist)
├── vitest.config.ts                 # (existing) excludes *.tz.test.ts from the default run
└── vitest.tz.config.ts              # new — TZ=America/New_York, includes only *.tz.test.ts
```

**Structure Decision**: The generator lives under `web/test/corpus/` — a single
pure module tree imported by both the vitest suite and the `scripts/seed-corpus.ts`
runner, and intentionally **outside `web/lib/`** so it can never be pulled into the
shipped app bundle. `*.test.ts` files sit alongside the pure modules (vitest picks
up only the test files). The A2 reproduction is isolated in a `*.tz.test.ts` file
excluded from the default `TZ=UTC` run and executed by a dedicated
`vitest.tz.config.ts` under `TZ=America/New_York`; this is the only clean way to
demonstrate a timezone-dependent defect given the process-wide `TZ` pin. The
existing `lib/testdata/seed.ts` (the in-app "Use test data" happy-path sample) is
left untouched — the coverage corpus is separate dev/test infrastructure and is
not wired into the in-app flag (polished demo data is §9.2).

## Complexity Tracking

> No constitution violations — this section is intentionally empty.

# Implementation Plan: Transaction-Based Routine Detector (Prototype)

**Branch**: `016-routine-detector` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-routine-detector/spec.md`

## Summary

Build a pure, deterministic TypeScript detector that answers the one question
`findings.md` says to validate first: does `merchant + cadence` **alone** (no
location, no permission, works on bank imports) surface recurring-spend
"routines" that feel insightful? The detector reads the app's existing
`Transaction[]`, groups spend by normalized merchant **and** by category,
classifies each group's cadence (daily/weekday, weekly, biweekly, monthly) from
occurrence spacing, tags a time-of-day bucket only when a transaction carries a
real hour (noon-UTC imports fall back to date-only), scores confidence from
support + spacing regularity, ranks deterministically, and rolls the result up
into an estimated monthly routine cost. A demo fixture with planted routines and
the existing spec-015 seed (as a sparse control) feed both Vitest tests and a
`tsx` harness that prints the ranked routines for a human go/no-go call. It is a
standalone module **outside** the golden-vector parity harness; it touches no
existing insight code, no golden vectors, no schema, and no iOS.

## Technical Context

**Language/Version**: TypeScript 5 on Node 22 (`.nvmrc`), ES modules.

**Primary Dependencies**: None new at runtime. Dev/build: `vitest` (already
present) for tests, `tsx` (already present, used by `scripts/gen-vectors.ts`) for
the harness. The module is framework-free pure TS — no React, no Next.js, no
Supabase — so `web/AGENTS.md`'s "this is not the Next.js you know" caveat does not
bear on the detector; it only matters if the harness reached into Next internals,
which it deliberately does not (plain `tsx` + `console`).

**Storage**: N/A — read-only over in-memory `Transaction[]`. Nothing persisted;
no schema change, no migration, no new column.

**Testing**: Vitest (`npm test` → `vitest run`) with deterministic fixtures and an
injected reference date. Tests live in the central `web/test/` directory (project
convention — e.g. `test/insights.unit.test.ts`, `test/mortgage.parity.test.ts`),
not colocated.

**Target Platform**: Runs anywhere Node runs (Linux sandbox included) — the whole
point of choosing the web/TS surface for this prototype.

**Project Type**: Web monorepo, but this slice is a self-contained pure-`lib`
module + a dev harness + tests. No UI.

**Performance Goals**: Results effectively instant (< 100 ms) for a year of a
two-person household's history (~1–3k rows). Complexity is a couple of linear
passes + per-group sorts; trivially within budget.

**Constraints**: Pure and deterministic (identical input + reference date →
identical output); no network; no reliance on the real clock (reference date is
injected). Money stays in integer USD cents; display formatting reuses existing
helpers where a string is shown.

**Scale/Scope**: One new module (`lib/finance/routines.ts`), one demo fixture
(`lib/testdata/routine-demo.ts`), one harness (`scripts/routines-demo.ts`), one
test file (`test/routines.test.ts`). No changes to existing files except the
managed CLAUDE.md SpecKit pointer.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is front-end/design-centric; most principles bound UI, which this
slice has none of. Mapping each:

- **I. One Design System, Tokens Only** — N/A (no UI, no color/type). No violation.
- **II. Calm Over Dense** — N/A (no UI). The harness output is plain text.
- **III. Right Form Factor Per Canvas** — N/A (no UI).
- **IV. Plainspoken Voice & Money Formatting** — PARTIAL/RELEVANT: any money the
  harness prints reads as money (`$4.50`), amounts never abbreviated, USD cents
  internally. Routine labels use plainspoken phrasing ("weekday mornings"). ✅
- **V. Accessible & Interaction-Complete** — N/A (no interactive UI).
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — CORE: this is pure
  `lib/` money+date logic, exactly the category the constitution says must be
  locked by deterministic tests. Plan is test-first: failing tests describe cadence
  classification, thresholding, confidence ranking, and the monthly roll-up before
  the implementation satisfies them; injected reference date, fixture data, no
  network. `npm test` stays green. ✅

**Additional constraints**: money as USD cents ✅; no schema/Supabase change ✅;
parity — explicitly **outside** the golden-vector harness (like scan and
feature-flags), so no `PARITY.md` capability row and no golden vector is added or
touched ✅.

**Gate result: PASS.** No violations; Complexity Tracking not required.

### Relationship to the existing "Recurring subscriptions" insight

`web/lib/finance/insights.ts` already has *Rule 5 — Recurring subscriptions*
(trailing-6-month, merchant-level, expensed monthly charges) which is
**vector-locked**. The routine detector is a deliberately broader, separate
exploration (category grouping, cadence classes beyond monthly, time-of-day
buckets, spacing-regularity confidence, monthly-cost roll-up). To respect the
golden-vector lock and keep the prototype iterable, the detector **does not import
from, modify, or extend `insights.ts`**; any future convergence is a later,
explicit step. This separation is a design decision, recorded in research.md.

## Project Structure

### Documentation (this feature)

```text
specs/016-routine-detector/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature spec (/speckit-specify output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── routine-detector.md   # Phase 1 output — the module's public contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (already ✅)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── finance/
│   │   └── routines.ts            # NEW — the detector (pure, deterministic)
│   ├── testdata/
│   │   ├── seed.ts                # EXISTING — spec-015 sparse seed (reused as control)
│   │   └── routine-demo.ts        # NEW — richer fixture with planted routines
│   └── types.ts                   # EXISTING — Transaction (read-only input; unchanged)
├── scripts/
│   └── routines-demo.ts           # NEW — tsx harness: prints ranked routines for both datasets
└── test/
    └── routines.test.ts           # NEW — Vitest unit tests (P1/P2/P3 acceptance)
```

**Structure Decision**: A single new pure module under the existing
`web/lib/finance/` (home of `money.ts`, `insights.ts`, `mortgage.ts`), a demo
fixture under the existing `web/lib/testdata/` (home of the spec-015 seed), a
harness under the existing `web/scripts/` (home of `gen-vectors.ts`, run via
`tsx`), and one test file under the central `web/test/` directory. The `@/*`
tsconfig alias (→ web root) lets tests and the harness share the demo fixture and
the detector by import. No new top-level directories; every path lives in an
established location.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

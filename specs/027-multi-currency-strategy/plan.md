# Implementation Plan: Multi-currency accounting strategy (a decision)

**Branch**: `feat/multi-currency-strategy` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-multi-currency-strategy/spec.md`

## Summary

This is a **decision** with a large implementation tail — the deliverable is a written
recommendation, not a migration. The plan produces two artifacts: (1) a RED reproduction
test in the existing web Vitest suite that proves non-USD historical totals drift as FX
moves (using only the current money layer), and (2) a written recommendation
(`docs/future_tasks/9.5-multi-currency-strategy.md`, expanded) that maps today's model,
demonstrates the drift, lays out the two honest options, quantifies option (b)'s cost,
rejects the "silent in-between," states the research gate, and recommends one option.

**Technical approach**: Characterize the existing behavior — no source under `web/lib/`,
`supabase/`, or `shared/` is modified. The test is quarantined (`test.fails`) so CI stays
green while the failure is preserved as executable evidence. All research is code-archaeology
of the current money layer plus the sequencing rationale from the 9.5 future-task note; no
external dependencies, no network, no new runtime.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (`web/`, per `.nvmrc`).

**Primary Dependencies**: Vitest `^4.1.8` (test runner, already present). The test imports the
existing pure functions from `web/lib/finance/money.ts` — no new dependency.

**Storage**: N/A for this feature — **no schema change** (NG-001). The *subject* of the
decision is the storage unit (integer USD cents in Supabase `bigint amount_cents`), but nothing
is written or migrated.

**Testing**: Vitest, `cd web && npm test`. New file `web/test/multicurrency-instability.test.ts`.
The RED assertions live under `test.fails(...)` (Vitest inverts: the block must throw, so a
green suite *confirms* the drift). A USD control asserts zero drift normally.

**Target Platform**: Linux sandbox (everything here is pure JS/TS — no Xcode, no iOS build needed).

**Project Type**: Web monorepo (Next.js app + Supabase + shared vectors). This feature touches
only `web/test/` and `docs/` (+ this spec's own `specs/027-…/` artifacts).

**Performance Goals**: N/A — a unit test and a document.

**Constraints**: The existing suite and `tsc --noEmit` MUST stay green (SC-003); production
behavior MUST NOT change (SC-005); `shared/test-vectors/` MUST stay byte-identical (NG-003).

**Scale/Scope**: One test file (~2 scenarios + control), one expanded doc, four spec artifacts.
No code paths altered.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ N/A | No UI in this feature. |
| II. Calm Over Dense | ✅ N/A | No UI. |
| III. Right Form Factor Per Canvas | ✅ N/A | No UI. |
| IV. Plainspoken Voice & Money Formatting | ✅ Pass | The doc/test reason *about* money formatting; they change none of it. The drift being characterized is a money-correctness concern the recommendation exists to resolve. |
| V. Accessible & Interaction-Complete | ✅ N/A | No UI. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ Pass — this feature *is* test-first | A failing test describes the intended behavior (stable native history) before any code that would satisfy it. Money math stays locked by the existing vectors, which are **not** regenerated (NG-003), so no accidental behavior change is laundered in. The new test is deterministic, injects its own rates (never the live feed / real clock), and asserts observable output of a public function. |

**Gate result: PASS, no violations.** Complexity Tracking is empty (nothing to justify).

One nuance worth recording against Principle VI: the constitution says "a failing test
describes the intended behavior before the code that satisfies it." Here the code that would
satisfy it (a native-currency ledger, option b) is **deliberately deferred** — this feature
ships the failing test as *evidence for a decision*, not as the first step of an
immediately-following implementation. That is why the test is quarantined (`test.fails`)
rather than left red: the decision to build the satisfying code is gated on FR-010's research
question. This is consistent with the principle's intent (no money behavior shipped without
coverage) — no new money behavior is shipped at all.

## Project Structure

### Documentation (this feature)

```text
specs/027-multi-currency-strategy/
├── plan.md              # This file
├── research.md          # Phase 0 output — today's model, drift proof, option costing
├── data-model.md        # Phase 1 output — the amount representation (today vs option b)
├── quickstart.md        # Phase 1 output — how to run the RED test + read the recommendation
├── contracts/
│   └── reproduction-test.md   # The contract the RED test must satisfy (FR-001..FR-004)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
web/
├── lib/finance/
│   ├── money.ts         # SUBJECT (read-only): toUSDCents / toDisplayAmount / formatMoney / roundHalfAwayFromZero
│   └── currency.ts      # SUBJECT (read-only): CurrencyKey set, FALLBACK_RATE_FROM_USD
├── lib/store.tsx        # SUBJECT (read-only): live rate fetch (floatrates.com) + rate() at display
└── test/
    └── multicurrency-instability.test.ts   # NEW — the RED reproduction test (FR-001..FR-004)

docs/
└── future_tasks/
    └── 9.5-multi-currency-strategy.md       # EXPANDED — the written recommendation (FR-005..FR-012)
```

**Structure Decision**: This is not a normal build; there is no feature module. The only new
source file is one Vitest spec under the existing `web/test/` directory (co-located with the
eleven `*.parity.test.ts` regression suites, matching that convention). The recommendation
expands the existing future-task note in place rather than creating a parallel doc, so the
FUTURE-TASKS backlog and the recommendation stay one document. Nothing under `web/lib/`,
`supabase/`, or `shared/` is edited.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.

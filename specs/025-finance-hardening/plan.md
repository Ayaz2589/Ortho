# Implementation Plan: Finance Model Hardening

**Branch**: `025-finance-hardening` (developed on `claude/sandbox-bypass-permissions-syqezt`) | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-finance-hardening/spec.md`

## Summary

Close the three highest-value, lowest-risk gaps from the `docs/finance.md` §16
hardening backlog, with **zero observable behavior change**: (1) add a genuine
correctness oracle — independently-derived goldens + property invariants — so the
finance math is proven correct, not merely unchanged (H1); (2) express the
USD-cents storage invariant as a branded `Cents` type with validated constructors
(H3a); (3) extract inline insight thresholds into one named config (smaller note).
All pure TypeScript under `web/`, developed test-first, green in Linux CI. The
committed golden vectors must remain byte-identical — proof that behavior did not
change.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22 (`.nvmrc`)

**Primary Dependencies**: Vitest 4 (test), `tsx` (vector generator). No new deps.

**Storage**: N/A for this feature (pure logic; the H3b database constraint is
explicitly deferred).

**Testing**: Vitest (`cd web && npm test`), `tsc --noEmit`, golden-vector drift
check — all already wired into `web-ci.yml`.

**Target Platform**: Linux CI (and every delivery target, since it's the shared
`web/lib` logic).

**Project Type**: Web (Next.js) monorepo; this feature touches only `web/lib/*`
and `web/test/*`.

**Performance Goals**: None changed. The insights refactor is threshold extraction
only — no algorithmic change.

**Constraints**: No behavior change to any vectored function; `Cents` must be a
`number` subtype so it cannot ripple through existing callers; `TZ=UTC` harness
pin preserved.

**Scale/Scope**: ~3 new test files, 2 small new lib modules (`cents.ts`,
`insights-thresholds.ts`), one internal refactor of `insights.ts`.

## Constitution Check

Gates from `.specify/memory/constitution.md` v2.0.0:

- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — ✅ This feature *is*
  test-first hardening: every new production module (`cents.ts`,
  `insights-thresholds.ts`) gets a failing test before implementation; the oracle
  suite is itself the deliverable. Money math stays locked; vectors unchanged.
- **I/II/III/IV/V (design/UX principles)** — ✅ N/A. No UI, no tokens, no copy, no
  DOM. Pure `lib/` logic.
- **Money-as-cents, converted at render** — ✅ Reinforced, not altered: the `Cents`
  brand makes the existing invariant explicit.

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/025-finance-hardening/
├── spec.md              # Feature spec (done)
├── plan.md              # This file
├── tasks.md             # Task breakdown (/speckit-tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
web/
├── lib/
│   └── finance/
│       ├── cents.ts                 # NEW — branded Cents type + constructors/guards (US2)
│       ├── insights-thresholds.ts   # NEW — INSIGHT_THRESHOLDS config (US3)
│       └── insights.ts              # EDIT — consume INSIGHT_THRESHOLDS (US3, no behavior change)
└── test/
    ├── finance-goldens.test.ts      # NEW — independently-computed expected values (US1)
    ├── finance-properties.test.ts   # NEW — invariant/property tests (US1)
    └── cents.test.ts                # NEW — Cents constructors/guards (US2)
```

**Structure Decision**: Everything lives in the existing `web/lib/finance` and
`web/test` trees — no new top-level structure. New engines are additive modules;
the only edit to shipped code is the internal threshold-extraction refactor of
`insights.ts`, guarded by the unchanged `insights.json` vector.

## Complexity Tracking

No constitution violations — section intentionally empty.
</content>

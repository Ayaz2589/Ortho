# Implementation Plan: In-Depth Automated Testing for the Web App

**Branch**: `003-web-test-coverage` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-web-test-coverage/spec.md`

## Summary

Stand up a real test foundation for `web/`: extend Vitest (already present) with a
jsdom environment + Testing Library so one `npm test` runs both fast node logic tests
and DOM component-behavior tests. Add unit tests for every untested `lib/` module,
store/state tests with Supabase mocked, and behavioral tests for the four highest-value
interactive components. Add v8 coverage with a `lib/`-scoped threshold. Record TDD as a
constitution principle so the foundation is maintained. No production build / dev server
is run; validation is `tsc --noEmit` + `npm test`.

## Technical Context

**Language/Version**: TypeScript 5 on Node (Next.js 16 app, React 19)

**Primary Dependencies**: Vitest 4 (test runner), @testing-library/react + user-event +
jest-dom (component behavior), jsdom (DOM env), @vitest/coverage-v8 (coverage). App
deps relevant to tests: React 19, `@supabase/ssr` (mocked), `Intl` (formatting).

**Storage**: None under test. Supabase is the app's backend; it is **mocked** — tests
perform zero network/DB I/O.

**Testing**: Vitest. Node environment for `lib/` pure logic + golden-vector parity;
jsdom environment (per-file pragma) for component/store tests using Testing Library.

**Target Platform**: Local dev + CI; suite runs headless with no browser and no network.

**Project Type**: Web application (Next.js App Router) — single `web/` package.

**Performance Goals**: Whole suite < ~30s locally (SC-001); node logic tests are
near-instant; only component/store tests pay the jsdom cost.

**Constraints**: Deterministic + isolated (inject reference dates, no real `Date.now()`
in assertions, order-independent). NEVER run `next build`/`next dev` or delete
`web/.next`. Validate via `tsc --noEmit` + `npm test` only.

**Scale/Scope**: ~13 `lib/` modules (2 already covered), 1 store provider, 4 components.
Roughly 12–16 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution (v1.0.0) is design-focused; its directly-relevant clauses:

- **V. Accessible & Interaction-Complete** — testing through accessible roles/labels and
  asserting semantic controls *reinforces* this principle (component tests query by role,
  assert `aria-current`, real `<button>`/`<a>`). ✅ Aligned.
- **Development Workflow → "Verification favors typecheck + visual review; never run a
  production build or delete `.next/` while a shared dev server is running."** — honored:
  validation is `tsc` + `npm test`; no build/dev. ✅
- **Development Workflow → "Spec-driven … recorded under `specs/`."** — this feature
  follows the SDD cycle. ✅
- **TDD**: the constitution does not yet mandate test-first. FR-009 adds a **TDD
  principle** (a governance amendment), which strengthens, not violates, the constitution.
  Recorded as a task; bumps constitution to v1.1.0 (MINOR: additive principle).

**No violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-web-test-coverage/
├── plan.md              # This file
├── research.md          # Phase 0 — env split + date determinism + supabase mock
├── data-model.md        # Phase 1 — entities (vectors, mock, reference date) + test targets
├── quickstart.md        # Phase 1 — how to run the suite + coverage
├── contracts/
│   └── test-targets.md  # Phase 1 — public signatures/props locked by tests
├── checklists/
│   └── requirements.md  # Spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── vitest.config.ts            # broadened: include *.test.ts AND *.test.tsx; coverage
├── test/
│   ├── setup.ts                # NEW: jest-dom matchers + RTL cleanup (jsdom files)
│   ├── helpers/
│   │   ├── supabase-mock.ts    # NEW: chainable Supabase client mock + dataset builder
│   │   └── fixtures.ts         # NEW: sample users/household/transactions builders
│   ├── mortgage.parity.test.ts # EXISTING — keep green
│   ├── insights.parity.test.ts # EXISTING — keep green
│   ├── money.test.ts           # NEW (node)
│   ├── currency.test.ts        # NEW (node)
│   ├── format.test.ts          # NEW (node)
│   ├── categories.test.ts      # NEW (node)
│   ├── aggregates.test.ts      # NEW (node)
│   ├── utils.test.ts           # NEW (node)
│   ├── store.test.tsx          # NEW (jsdom) — state + split + ownersDisplay, supabase mocked
│   ├── DatePicker.test.tsx     # NEW (jsdom)
│   ├── transactions-accordion.test.tsx  # NEW (jsdom)
│   ├── nav.test.tsx            # NEW (jsdom) — Sidebar + TabBar active route
│   └── tx-form-validation.test.tsx      # NEW (jsdom)
└── package.json                # add devDeps + (optional) test:coverage script

shared/test-vectors/            # EXISTING golden vectors; optionally extend
```

**Structure Decision**: Single `web/` package. Keep the existing flat `test/` directory
(matches current convention) and add a `test/helpers/` for the Supabase mock + fixtures.
Component/store tests use the `.test.tsx` extension and an in-file jsdom pragma; pure
logic stays `.test.ts` in the default node environment.

## Complexity Tracking

No constitution violations — section intentionally empty.

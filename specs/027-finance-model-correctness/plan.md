# Implementation Plan: Finance Model Correctness & Honest Labels

**Branch**: `feat/finance-model-correctness` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-finance-model-correctness/spec.md`

## Summary

This feature corrects a timezone-bucketing bug in the insights engine (A2), verifies
CLI leftover-cent ordering (A4), extends the independent oracle suite to the four
highest-risk engines not yet covered (A3), and adds honest UI labels for financial
approximations plus a documented rounding-fairness policy (B3/B4). All changes are
test-first: the failing test defines the contract before the fix is written. No
database changes, no schema changes, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22 (`web/` workspace)

**Primary Dependencies**: Vitest 4 (test runner), React 19 + Next.js 16 App Router
(UI layer), Supabase JS (data — CLI-only path for A4 verification)

**Storage**: No DB changes. All finance logic is pure TypeScript in `web/lib/*`
and `web/components/housing/lease.ts`. Regression fixtures in `shared/test-vectors/`.

**Testing**: Vitest (`cd web && npm test`). New tests land in:
- `web/test/finance-goldens.test.ts` (oracle extension — A3)
- `web/test/finance-properties.test.ts` (invariant extension — A3)
- `web/test/insights-timezone.test.ts` (non-UTC TZ test — A2)
- `web/test/import/toTransaction.test.ts` (CLI ordering verification — A4)

**Target Platform**: Linux sandbox (Vitest + tsc; no iOS build needed)

**Project Type**: Monorepo — pure-logic TypeScript fixes + React UI copy

**Performance Goals**: All 1,375 existing tests + new tests must pass in a single
`npm test` run.

**Constraints**:
- `TZ=UTC` pin in `gen-vectors.ts` and `vitest.config.ts` MUST NOT change.
- `shared/test-vectors/*.json` MUST NOT be regenerated (no intended behavior change
  in the vectored engines after A2 fix — boundary-dated transactions are not in the
  current vectors, which sit mid-month).
- No new npm packages.

**Scale/Scope**: 5 work items (A2, A3, A4, B3, B4) across ~6 source files and ~3 new
test files. No routes, migrations, or schema changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Tokens Only | ✅ PASS | B3 UI copy uses existing tokens; no new colors or sizes |
| II — Calm Over Dense | ✅ PASS | Relabeling is copy-only; no layout changes |
| III — Right Form Factor | ✅ PASS | No navigation, form factor, or canvas changes |
| IV — Plainspoken Voice | ✅ PASS | New labels ("Principal paid down") are plainspoken and accurate |
| V — Accessible & Interaction-Complete | ✅ PASS | No interactive element changes |
| VI — Test-First & Regression-Safe | ✅ PASS | Every fix is developed test-first; new oracle goldens extend the independent safety net |

**Gate result: CLEAR — proceed.**

## Project Structure

### Documentation (this feature)

```text
specs/027-finance-model-correctness/
├── plan.md              # This file
├── research.md          # Phase 0 (inline — no open unknowns)
├── data-model.md        # Phase 1 — key entities & state
├── quickstart.md        # Phase 1 — validation guide
├── contracts/           # Phase 1 — CLI ordering contract
└── tasks.md             # Phase 2 (/speckit-tasks, not yet created)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── finance/
│   │   ├── insights.ts          # A2: fix inInterval timezone regime
│   │   └── mortgage.ts          # A3: read-only (oracle covers it)
│   └── splits.ts                # B4: add policy comment
├── components/
│   └── housing/
│       ├── PropertyCard.tsx      # B3: relabel "Equity" copy (or wherever rendered)
│       └── HousingDetail.tsx     # B3: relabel "Net rental" copy
└── test/
    ├── finance-goldens.test.ts   # A3: extend oracle
    ├── finance-properties.test.ts# A3: extend invariants
    ├── insights-timezone.test.ts # A2: non-UTC timezone test (new file)
    └── import/
        └── toTransaction.test.ts # A4: CLI ordering verification

PARITY.md                         # A4 + B4: update leftover-cent entry
```

## Complexity Tracking

No constitution violations. No complexity exceptions required.

---

## Phase 0: Research

*No external unknowns. All resolutions are from reading the codebase.*

### R1 — A2 Root cause & fix

**Decision**: Fix `inInterval` in `web/lib/finance/insights.ts` to parse date-only
strings as local midnight (matching `monthInterval`'s local-calendar regime).

**Root cause**:
- `monthInterval(now)` returns `[new Date(Y, M, 1), new Date(Y, M+1, 1)]` — **local** midnight boundaries.
- `inInterval(date, start, end)` parses `date` with `new Date(date)`. For a date-only
  string like `"2026-06-01"`, JS spec mandates UTC midnight (`2026-06-01T00:00:00.000Z`).
- For a user at UTC-8 (Los Angeles), local midnight June 1 = `2026-06-01T08:00:00.000Z`.
  UTC midnight < local midnight, so a June-1 date-only row falls before `mStart` and
  is miscounted in May.
- Invisible under `TZ=UTC` (CI): local midnight = UTC midnight, no offset.

**Fix**:
```ts
// web/lib/finance/insights.ts

// import parseLocalDate at the top:
import { parseLocalDate } from '../format'

function inInterval(date: string, start: Date, end: Date): boolean {
  // Date-only strings ("YYYY-MM-DD") parse as UTC midnight with `new Date()`,
  // but monthInterval() builds local-calendar [mStart, mEnd) boundaries.
  // Parse date-only strings as local midnight so the two regimes agree.
  const t = date.includes('T') ? new Date(date).getTime() : parseLocalDate(date).getTime()
  return t >= start.getTime() && t < end.getTime()
}
```

**Vector impact**: Zero. Existing `insights.json` vectors use noon-UTC timestamps
(`"…T12:00:00.000Z"`) which contain `'T'` and hit the existing code path unchanged.
No regeneration needed.

**Non-UTC test**: Vitest supports per-test TZ via `vi.stubEnv('TZ', 'America/Los_Angeles')`;
this must be in a separate file from the TZ=UTC-pinned parity suite (the pin is set in
`vitest.config.ts` for the whole suite, but `vi.stubEnv` overrides it per test in
environments that support it). Alternatively, the test can manipulate Date directly by
passing a local-calendar `now` and asserting that `new Date("2026-06-01")` (UTC midnight)
does NOT fall before a June `mStart` after the fix.

> **Practical approach**: The test directly verifies the fix by calling
> `generateInsights` with a transaction dated `"2026-06-01"` and `now` =
> `new Date(2026, 5, 15)` (June 15 local), asserting the transaction contributes
> to June's spend (not May's). Under UTC this was already true; under the fix it
> also becomes true for non-UTC. The `TZ=America/Los_Angeles` environment in the
> test file makes the failure visible before the fix.

### R2 — A3 Independent oracle gaps

**Decision**: Extend `finance-goldens.test.ts` with hand-derived cases for
amortization schedule, insights rule math, filter month windows, and lease timing.

**Amortization golden** (month 1 from textbook):
For a $300,000 loan at 6%/30y:
- Monthly rate `r = 0.06/12 = 0.005`
- Payment `M = 179,865¢` (already in goldens)
- Month-1 interest: `floor(300,000_00¢ / 100 * 0.005 * 100) = 300,000 * 0.005 = $1,500 = 150,000¢`
- Month-1 principal: `M − interest = 179,865¢ − 150,000¢ = 29,865¢`
- (In floating-dollar path: same numbers, ±1¢ rounding tolerance)

**Insights rule-3 golden** (budget-over):
- Budget limit: $100 (10,000¢), spend: $120 (12,000¢)
- fraction = 12,000/10,000 = 1.2 ≥ 1.0 → budget-over fires
- `over = 12,000 − 10,000 = 2,000¢`
- Independently verify: insight generated with `severity:'critical'`, `magnitude_cents: 2000`

**Insights rule-5 golden** (recurring average truncation):
- 3 charges: 3100¢, 3200¢, 3050¢; gaps: 28 days, 29 days (both in 28–35 range → recurring)
- Average: `Math.trunc((3100 + 3200 + 3050) / 3) = Math.trunc(9350 / 3) = Math.trunc(3116.67) = 3116¢`
- Independently verify: insight generated with `magnitude_cents: 3116`

**Filter window golden** (`monthBounds("2026-06")`):
- `dateFrom = "2026-06-01T00:00:00.000Z"` (UTC midnight June 1)
- `dateTo   = "2026-07-01T00:00:00.000Z"` (UTC midnight July 1)
- Independently verify: compare `new Date("2026-06-01T00:00:00.000Z").getTime()` vs computed

**Lease timing golden** (`daysUntilNextRent` with due-day = 31, asOf = Feb 14):
- Month-end clamp: Feb has 28 days in 2026 (non-leap), so due day = min(31, 28) = 28
- Feb 28 is the due day; asOf Feb 14 → `daysUntilNextRent = 28 − 14 = 14`
- Independently verify without running the engine

### R3 — A4 CLI leftover-cent ordering

**Decision**: Verify (not fix, unless broken). Current CLI code DOES call
`orderedOwnerIds` before `computeShares` in all active compute paths. The PARITY.md
note "sort_order can differ" refers to a potential divergence when people are fetched
in `sort_order` order but NOT re-sorted before computation. Reading the code:
- `toTransaction.ts:32` calls `orderedOwnerIds(owners)` ✅
- `tx.ts:157` calls `orderedOwnerIds(ownerIds)` ✅
- `tx.ts:239` calls `orderedOwnerIds(tx.owner_ids)` ✅

**Test design**: Construct a test with members whose sort_order ≠ lexical UUID order:
```ts
const personA = { id: 'zzzzzzzz-…', sort_order: 0 }  // sort_order first, UUID last
const personB = { id: 'aaaaaaaa-…', sort_order: 1 }  // sort_order second, UUID first
// 101¢ even split → leftover to orderedOwnerIds-first = personB (id "aaaa…")
const shares = computeShares(101, orderedOwnerIds([personA.id, personB.id]), { method: 'even' })
// Expected: personB gets 51¢, personA gets 50¢
```
Then verify `toTransaction` produces the same shares when given owners in `sort_order`
order (`[personA.id, personB.id]`).

**Outcome**: If test passes → no divergence. Update PARITY.md to record the
verification and remove the stale ambiguity. If test fails → fix `toTransaction.ts`
to call `orderedOwnerIds` (likely a trivial one-liner addition).

### R4 — B3 UI components to relabel

**Decision**: Audit the rendering path for "Equity" and "Net rental" in the Housing
feature. Based on the codebase:
- "Equity" label: find the component rendering `currentEquityCents` result — likely
  in a housing property card or detail screen. Relabel to "Principal paid down" with
  a parenthetical or subtitle.
- "Net rental": the `netRentalCents` render site. Add "P&I only" qualifier.
- Paid-off threshold: add a `PAID_OFF_THRESHOLD_CENTS = 500` constant in
  `web/lib/finance/mortgage.ts`; apply it in the render layer only (not in the
  math functions themselves, which continue to return exact values).

**Paid-off threshold decision**: 500¢ ($5) — confirmed by the user.

### R5 — B4 Policy comment

**Decision**: Add a block comment above the leftover-cent distribution loop in
`web/lib/splits.ts` explaining the policy explicitly. Update PARITY.md
"Canonical leftover-cent order" row to reference it.

---

## Phase 1: Design & Contracts

### Data model

See [data-model.md](./data-model.md).

### Interface contracts

See [contracts/cli-ordering.md](./contracts/cli-ordering.md).

### Validation guide

See [quickstart.md](./quickstart.md).

---

## Work items, ordered by dependency

| Item | Depends on | Files touched |
|------|-----------|---------------|
| A2-test | — | `web/test/insights-timezone.test.ts` (new) |
| A2-fix  | A2-test (red) | `web/lib/finance/insights.ts` |
| A3-oracle | — | `web/test/finance-goldens.test.ts`, `web/test/finance-properties.test.ts` |
| A4-verify | — | `web/test/import/toTransaction.test.ts`, `PARITY.md` |
| B3-label | — | housing component(s), `web/lib/finance/mortgage.ts` |
| B4-policy | — | `web/lib/splits.ts`, `PARITY.md` |

All six work items are independent of each other and can be developed in parallel
once A2-test creates the red test (A2-fix then turns it green).

## Sequencing for tasks

1. **A2**: Write non-UTC timezone test (red) → fix `inInterval` (green) → confirm
   vectors unchanged → run full suite.
2. **A4**: Write CLI ordering test → run → record outcome → update PARITY.md.
3. **A3**: Extend `finance-goldens.test.ts` with amortization, insights, filter,
   lease goldens; extend `finance-properties.test.ts` with insights invariants.
4. **B3**: Audit housing render sites; relabel equity + net rental; add paid-off
   threshold constant and guard.
5. **B4**: Add policy comment to `splits.ts`; update PARITY.md.
6. **Final**: `cd web && npm test` (all green) + `npx tsc --noEmit` + push + PR.

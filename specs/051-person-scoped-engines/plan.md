# Implementation Plan: Person-Scoped Money Engines

**Branch**: `feat/050-053-household-wiring` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

Introduce `MoneyScope` — the missing *people* axis, complementing the existing *time* axis — as one
pure primitive in `web/lib/scope/`, then thread it through the budget, planning, insight and report
engines. Household scope is a strict no-op, which is what lets every existing golden vector stay
green and makes the change safe to land in one pass.

The attribution math already exists and is correct: `personSummary.ts` narrows a shared transaction to
one person's `effectiveShares` slice. This feature generalizes that loop into a reusable projection
and gives it consumers.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js (static export)

**Primary Dependencies**: none added

**Storage**: none added — pure projection over already-loaded transactions

**Testing**: Vitest — unit + property tests for the primitive; existing golden vectors as the
no-op lock

**Target Platform**: web + Capacitor iOS shell (one bundle)

**Project Type**: web app with pure engine layer (`web/lib/**`)

**Constraints**: `output: 'export'` — no server, every decision client-side. Integer USD cents
throughout. Engines stay pure, deterministic and `now`-injected.

**Scale/Scope**: one new module, four engine call sites, one UI control.

## Constitution Check

| Principle | Status |
|---|---|
| I — Tokens only | Pass. Scope selector reuses existing chip/segmented styles; no new palette entries. |
| II — Calm over dense | Pass. One control added beside the existing scope controls; no new panel. |
| III — Right form factor | Pass. The control adopts the same responsive pattern as the month/range controls. |
| IV — Plainspoken & money formatting | Pass. "Everyone" / person name; amounts stay tabular integer cents. |
| VI — Test-driven & regression-safe | Pass. Household scope asserted as a byte-identical no-op against existing vectors before any consumer changes. |

No violations; Complexity Tracking omitted.

## Design

### The primitive — `web/lib/scope/moneyScope.ts`

```ts
export type MoneyScope =
  | { kind: 'household' }
  | { kind: 'person'; personId: string }

export const HOUSEHOLD_SCOPE: MoneyScope

/** Household → the input array unchanged (referential identity, so consumers can
 *  cheaply detect the no-op). Person → a projected copy. */
export function scopeTransactions(txs: Transaction[], scope: MoneyScope): Transaction[]

/** Resolve a possibly-stale scope against the current people roster. */
export function resolveScope(scope: MoneyScope, activePersonIds: string[]): MoneyScope
```

**Projection rules** (person scope):

| Kind | Rule |
|---|---|
| `expense` / `income` | Included only if the person is an owner. `amount_cents` becomes their **stored** share (`effectiveShares(tx)[personId]`), `owner_ids` becomes `[personId]`, `shares` becomes `{ [personId]: share }`. |
| `transfer` | Included only if the person is sender or recipient. Amount unchanged — a transfer is directional, never split. |

Returning real `Transaction` objects (not a new type) is deliberate: every downstream engine keeps
its existing signature and needs no structural change.

### Consumers

| Engine | Change |
|---|---|
| `planning/planSummary.ts` | `PlanSummaryInput` gains optional `scope`; `buildPlanSummary` projects once at the top and passes the projected array down. All internals unchanged. |
| `finance/insights.ts` | `generateInsights` gains an optional trailing `scope` param, projecting before its rules run. |
| `reports/savings.ts`, `reports/categories.ts` | Operate on pre-aggregated rows, not transactions — scoping happens in the caller that builds those rows. No signature change. |
| `finance/budgets.ts` | Untouched. `budgetStatusForMonth` already takes a transaction array; the caller passes the projected one. |

Projecting **once at the entry point** rather than inside each rule keeps a single place where the
attribution rule lives.

### UI

The Planning hub owns the selected scope in local React state (not persisted, per spec Assumptions)
and re-resolves it every render, so a person removed mid-session degrades to the household rather
than blanking the page. `PlanScopeBar` is hidden when the household has fewer than two active people.

A shared `MoneyScopeContext` provider was written and then **removed before merge**: with exactly one
scoped surface it had no consumers, and shipping an unused provider is speculative. It should return
the moment a second surface needs the same lens — the resolve-on-read behavior above is the piece to
lift into it.

## Project Structure

```text
specs/051-person-scoped-engines/
├── spec.md
├── plan.md          # this file
└── tasks.md

web/lib/scope/
└── moneyScope.ts            # the primitive

web/components/planning/
└── PlanScopeBar.tsx         # the Everyone / person selector

web/test/scope/
├── moneyScope.test.ts       # unit + property
└── moneyScope.noop.test.ts  # household-scope identity lock
```

**Structure Decision**: a new `web/lib/scope/` sibling to `web/lib/finance/` and `web/lib/planning/`.
It is not finance-specific (health, planning and reports all consume it), so nesting it under
`finance/` would misfile it.

## Test Strategy (TDD order)

1. **No-op lock first** — `scopeTransactions(txs, HOUSEHOLD_SCOPE)` returns the input unchanged, for
   every fixture in the existing vector corpus. This must pass before any consumer is touched.
2. **Projection unit tests** — owner/non-owner, uneven split, transfer direction, missing share.
3. **Property test** — for any ledger, the sum of every person's scoped amounts for a transaction
   equals the household amount; and the matrix of scoped totals reconciles to the household total.
4. **Consumer tests** — plan summary and insights under both scopes.
5. **Regression** — full existing suite, then `npm run gen:vectors` must produce a clean diff.

# Implementation Plan: Person-Scoped Dashboard Widgets

**Branch**: `feat/056-person-scoped-widgets` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/056-person-scoped-widgets/spec.md`

## Summary

The dashboard's member picker re-scopes the net hero and nothing else; the widget board below keeps
reporting the household. This routes the picker into the existing spec-051 people axis
(`lib/scope/moneyScope.ts`) so six widgets follow the selection, renames the picker's default option
from "Everyone" to "Household", and leaves financial-health and goals untouched for their own PR.

**The technical approach is a second context, not a prop.** The board's defining property (spec 034,
FR-002/FR-008) is that a widget body is **propless** — it reads `useApp()` for data and
`useDashboardScopeContext()` for the time window, and a new widget is one registry entry. Threading a
`personId` prop through `WidgetBoard` → `Widget` → every `Body` would break that contract for all
fifteen widgets to serve six. So the people axis gets its own context, `MoneyScopeContext`, mirroring
`DashboardScopeContext` exactly — the same shape the time axis already has, which is also how spec 051
framed the two axes.

**One deliberate divergence from `DashboardScopeContext`: reading it outside a provider returns
`HOUSEHOLD_SCOPE` instead of throwing.** That is not defensive sloppiness, it is the correctness
proof. Household scope is a strict no-op (`scopeTransactions` returns the *same array reference*), so
"no provider" and "household" are the same state by construction. The payoff is that the existing
widget test files — which mock `DashboardScopeContext` and know nothing about a money scope — keep
passing **unmodified**, and their continued green is the evidence for FR-005/SC-002 (household output
is unchanged). This is the same technique spec 050 used, where five untouched form suites proved only
the default had moved.

Each of the six bodies then changes by one line: swap `transactions` from `useApp()` for
`useScopedTransactions(transactions)`. The projection memo lives once, in the context module, not six
times.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js App Router (`output: 'export'`)

**Primary Dependencies**: None added. Consumes `lib/scope/moneyScope.ts` (spec 051/054) and
`lib/finance/balances.ts` (spec 053), both already shipped and test-pinned.

**Storage**: None. No schema change, no migration, no new table or column. The selection is
in-memory view state for the current visit (FR-020), exactly as today.

**Testing**: Vitest + Testing Library (jsdom). New suites under `web/test/widgets/` and
`web/test/dashboard/`. Existing suites must pass **unmodified** except the ones that assert the
renamed string.

**Target Platform**: Web (compact/medium/expanded) and the Capacitor-wrapped iOS shell — one codebase.

**Project Type**: Web application, single canonical implementation (`web/`).

**Performance Goals**: The projection is O(n) over the ledger, memoized once per scope change and
shared by all consuming bodies — strictly less work than six independent per-body projections.
Household scope stays a reference-return no-op, so the common case costs nothing.

**Constraints**: All existing golden vectors regenerate byte-identically (FR-019). The excluded
widgets (financial-health, goals) must not change behavior under any selection (FR-014). The shared
`Everyone` i18n key must keep its current wording for Planning and the transaction form (FR-016).

**Scale/Scope**: 1 new source file, 8 modified source files, ~4 new/updated test files. Households of
1–6 people; ledgers in the low thousands of rows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing, no new
violations introduced.*

| Principle | Assessment |
|---|---|
| **I. One Design System, Tokens Only** | PASS. No new visual element. The only UI change is one word of copy in an existing control. No color, type, spacing, or radius is touched. |
| **II. Calm Over Dense (NON-NEGOTIABLE)** | PASS, and mildly improved. No density is added — the same widgets show the same shapes with different subjects. "Household" vs. a person's name names two subjects, where "Everyone" vs. a name mixed a quantity with a person. Empty states are the widgets' existing calm ones; a person with no activity in the window sees "No expenses in this period yet.", never a zero-filled chart. |
| **III. Right Form Factor Per Canvas** | PASS. No layout change at any breakpoint; the picker already exists and already responds. |
| **IV. Plainspoken Voice & Money Formatting** | PASS. "Household" is the plainspoken noun the rest of the app already uses for the shared entity, and the translation already exists in all five catalogs. All money continues through `formatMoney`; no figure is abbreviated; nothing turns red. |
| **V. Accessible & Interaction-Complete** | PASS. The picker is an existing semantic `<button>` + `role="listbox"` with keyboard and Escape handling, unchanged. Its `aria-label` is updated alongside the visible copy so the accessible name and the visible name stay in agreement. |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | PASS, and this principle shapes the whole design. Every change is developed test-first. No new money math is written — the attribution rule stays in the one pure module that already owns it and is already vector-pinned, so the surface where money math could regress is not touched. The no-provider-is-household default is chosen precisely so untouched existing suites act as the regression lock. |

**No Complexity Tracking entries.** No principle is deviated from, so the section is omitted rather
than filled with "N/A".

## Project Structure

### Documentation (this feature)

```text
specs/056-person-scoped-widgets/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — the real design decisions
├── data-model.md        # Phase 1 — no persisted model; the in-memory scope state
├── quickstart.md        # Phase 1 — how to validate this by hand
├── contracts/
│   └── widget-scope.md  # Phase 1 — the widget × scope behavior table (the real contract)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks output
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── scope/moneyScope.ts                       # UNCHANGED — consumed, not extended
│   └── widgets/
│       ├── DashboardScopeContext.tsx             # UNCHANGED — the time axis, mirrored
│       ├── MoneyScopeContext.tsx                 # NEW — the people axis for the board
│       └── registry.tsx                          # UNCHANGED — no registry field added
├── components/
│   ├── dashboard/
│   │   ├── MemberScopePicker.tsx                 # MODIFIED — "Everyone" → "Household"
│   │   └── NetSummaryHero.tsx                    # UNCHANGED — keeps its personId prop
│   └── widgets/
│       ├── WidgetBoard.tsx                       # UNCHANGED — no prop threading
│       └── bodies/
│           ├── SpendingPaceBody.tsx              # MODIFIED — scoped transactions
│           ├── TopMerchantsBody.tsx              # MODIFIED — scoped transactions
│           ├── SavingsTrendsBody.tsx             # MODIFIED — scoped transactions (both paths)
│           ├── ActivityBody.tsx                  # MODIFIED — scoped transactions
│           ├── BudgetsBody.tsx                   # MODIFIED — scoped spend AND scoped limits
│           ├── HouseholdBalancesBody.tsx         # MODIFIED — row filter, UNPROJECTED ledger
│           ├── FinancialHealthBody.tsx           # UNCHANGED — excluded (own PR)
│           ├── GoalsBody.tsx                     # UNCHANGED — excluded (own PR)
│           ├── HousingCostsBody.tsx              # UNCHANGED — no people axis
│           ├── HomeEquityBody.tsx                # UNCHANGED — no people axis
│           └── settingsShortcuts.tsx             # UNCHANGED — no money
├── app/(app)/dashboard/page.tsx                  # MODIFIED — holds MoneyScope, wraps the board
└── test/
    ├── widgets/money-scope-context.test.tsx      # NEW — provider / default / stale person
    ├── widgets/person-scoped-widgets.test.tsx    # NEW — the five projected bodies
    ├── widgets/household-balances.test.tsx       # NEW — US3 (no suite exists today)
    ├── dashboard/member-scope.test.tsx           # MODIFIED — renamed string only
    └── widgets/*.test.tsx                        # UNMODIFIED — the regression lock
```

**Structure Decision**: The existing `web/` layout is used as-is. The one new source module goes in
`lib/widgets/` beside `DashboardScopeContext.tsx`, because it is the board's *second scope axis* and
belongs with the first — not in `lib/scope/`, which holds pure, React-free projection functions that
must stay importable by non-React callers (the planning engine, the insight engine, and the
financial-health engine all import from it).

## Key design decisions

Full reasoning in [research.md](./research.md). The four that matter:

1. **A separate `MoneyScopeContext`, not an extension of `DashboardScopeContext`.** The two axes have
   different consumers: nine widgets read the time window, six read the subject, and two
   (financial-health, goals) must read neither for now. Folding the person into the time context
   would force a change on every body that destructures it and would put the excluded widgets one
   careless destructure away from silently changing.

2. **Absent provider ⇒ household scope, not a thrown error.** Diverges from `DashboardScopeContext`
   on purpose: household is a no-op, so the default *is* the identity, and it turns the existing
   widget suites into a working regression lock rather than a pile of files to edit.

3. **Balances filter rows; they never consume projected transactions.** A projected row has
   `owner_ids: [personId]` and its amount rewritten to that person's share — the payer/co-owner
   relationship a debt is *derived from* is gone. Running `outstandingBalances` over projected rows
   would return a confidently wrong number, and a wrong money figure that still renders is the worst
   failure mode here. So the widget computes over the full ledger and filters the resulting pairs.

4. **The rename adds no i18n key.** `"Household"` already exists in all five catalogs. Only the call
   sites in `MemberScopePicker` change; the shared `"Everyone"` key keeps its wording because
   `PlanScopeBar` and `TxForm` still use it for their own controls.

## Phase sequencing

Ordered so the regression lock is in place before any behavior moves:

- **Phase A — the axis.** `MoneyScopeContext` + its suite. Nothing consumes it yet, so the whole
  board is provably unchanged at the end of this phase.
- **Phase B — the wiring.** Dashboard page holds `MoneyScope` (mirroring the planning page's
  `rawScope`/`resolveScope` pattern) and wraps the board in the provider. Still no body reads it, so
  the board is *still* provably unchanged.
- **Phase C — the five projected bodies.** US1. Each is a one-line swap plus its test.
- **Phase D — balances.** US3, the one body with different semantics, kept separate from C so its
  distinct risk is reviewed on its own.
- **Phase E — the rename.** US2. Independent of A–D; last because it is the only change to an
  existing assertion, so it never obscures a behavioral failure while A–D are landing.
- **Phase F — docs.** `docs/web.md` and the `CLAUDE.md` active-feature block.

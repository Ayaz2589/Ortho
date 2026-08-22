# Implementation Plan: Dashboard & Household Refinements

**Branch**: `feat/043-dashboard-household-refinements` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/043-dashboard-household-refinements/spec.md`

## Summary

Three independent changes to the web app:

1. **Remove the broken household "balances" feature** — delete the `BalanceSummary` "who owes whom" card,
   its render sites, and the `balanceBetween` computation. Keep transfers as a first-class kind by **adding
   a "Transfer" option to the New-transaction form's kind toggle** (the form already has a full transfer
   branch — From/To pickers, amount, submit — previously only reachable via the settle-up prefill). Retire
   the settle-up prefill plumbing (`TransferPrefill`, `initialTransfer`, the `transfer` URL param).
2. **Dashboard individual-member view** — a person selector (dropdown, default "Everyone") on the dashboard;
   when a member is picked, a **personal summary row** renders below the household `NetSummaryHero` showing
   that member's income, expenses (their split share), net transfers, and net for the shared scope. Backed
   by new **pure per-person aggregation helpers** over transactions.
3. **Savings-trend last-month comparison** — in the widget's single-month view, also show the previous
   month's savings rate as a comparison; unchanged in range view; calm "no comparison" when no prior month.

All computed from existing data; **no DB schema change**. Fully TDD; i18n across all 5 catalogs.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js (App Router, vendored — see `web/AGENTS.md`)

**Primary Dependencies**: App store `useApp()` (`web/lib/store.tsx`); dashboard scope
(`web/lib/widgets/DashboardScopeContext.tsx`, `web/lib/useDashboardRange.ts`); split math
(`web/lib/splits.ts` + `effectiveShares` in `web/lib/format.ts`); transfer helpers (`web/lib/transaction.ts`
`isTransfer`/`transferParties`); the New-transaction form (`web/components/web/TxForm.tsx`); the savings
helper (`web/lib/reports/savings.ts`); i18n catalogs (`web/lib/i18n/`).

**Storage**: None added. Reads existing `transactions`, `people`. Member-selector state is dashboard-local
React state (not persisted). No migration.

**Testing**: Vitest + Testing Library (`web/test/`), jsdom for components. TDD (Constitution VI). Pure
per-person aggregation helpers get unit tests; the person view and the form Transfer option get behavior
tests; savings comparison gets a widget test.

**Target Platform**: Web (compact → expanded) + Capacitor iOS shell (same bundle).

**Project Type**: Web application (single `web/` codebase).

**Performance Goals**: No new fetches; all aggregation is in-memory `useMemo` over the already-loaded
transactions, same as existing widgets/hero.

**Constraints**: Calm design (Constitution I/II/IV) — tabular figures, never red for losses/shortfalls, no
alarmist states. Split-portion math must reuse `effectiveShares` (locked by golden vectors — Constitution
VI); do not reimplement split math. i18n in all 5 catalogs.

**Scale/Scope**: ~1 new pure helper module (per-person aggregation), 1 new dashboard component (member
selector + personal summary row), edits to the dashboard page, the savings-trend body, and the transaction
form; deletions of the balances card + engine + settle-up plumbing; i18n additions/removals.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Personal summary mirrors `NetSummaryHero`'s token-only
  styling (`--positive`, `--text`, `--text-2/3`, `--accent`); the member selector reuses existing
  picker/dropdown idioms (e.g. `MonthPicker`/`RangePicker`). No new colors.
- **II. Calm Over Dense (NON-NEGOTIABLE)** — PASS. Personal summary is an additive, quiet row; removing the
  balances card reduces density. Savings comparison is one extra quiet figure.
- **III. Right Form Factor Per Canvas** — PASS. Selector + summary reflow like the existing header (row on
  desktop, stacks on compact). No canvas-specific regressions.
- **IV. Plainspoken Voice & Money Formatting** — PASS. `+`/Unicode-minus, tabular, never red; second-person
  labels ("Income", "Expenses", "Transfers", "Net"). The Transfer option uses plain "Transfer" wording.
- **V. Accessible & Interaction-Complete** — PASS. Selector is a real labelled control, keyboard-reachable,
  sand focus ring; the form Transfer toggle is a real segmented-control option; hit targets ≥ 40px.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS. **Money math is developed test-first**: the
  per-person income/expense-share/transfer aggregation helpers are pure and unit-tested (SC-003: shares sum
  to the full amount — no lost cents), reusing the golden-locked `effectiveShares`. The removed
  `balanceBetween` and its tests are deleted; remaining transfer-exclusion tests are preserved. Components
  tested for behavior/semantics.

**Result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/043-dashboard-household-refinements/
├── plan.md            # This file
├── spec.md            # Feature spec
├── research.md        # Phase 0 — decisions
├── data-model.md      # Phase 1 — derived entities + helper signatures
├── quickstart.md      # Phase 1 — validation guide
├── contracts/
│   └── refinements.md # Phase 1 — helper + UI/behavior contracts
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── finance/personSummary.ts               # NEW — pure per-person aggregation (income/expense-share/transfers/net)
│   ├── balances.ts                            # DELETED — who-owes-whom engine
│   ├── transaction.ts                         # reused (isTransfer/transferParties)
│   ├── splits.ts / format.ts                  # reused (effectiveShares) — NOT modified
│   └── reports/savings.ts                     # reused (savingsRate)
├── components/
│   ├── transactions/BalanceSummary.tsx        # DELETED — the "who owes whom" card
│   ├── dashboard/
│   │   ├── MemberSummary.tsx                  # NEW — person selector + personal summary row
│   │   └── NetSummaryHero.tsx                 # unchanged (always shown)
│   ├── web/
│   │   ├── TxForm.tsx                         # EDIT — add "Transfer" to the kind toggle; drop initialTransfer prefill
│   │   ├── TxFormPageClient.tsx               # EDIT — drop initialTransfer/settle title+label
│   │   └── TransactionsDesktop.tsx            # EDIT — remove BalanceSummary + openSettle + settlePrefill
│   └── widgets/bodies/SavingsTrendsBody.tsx   # EDIT — single-month last-month comparison
├── app/(app)/
│   ├── dashboard/page.tsx                     # EDIT — mount member selector + personal summary
│   └── transactions/{page.tsx,new/page.tsx}   # EDIT — remove BalanceSummary/openSettle; drop transfer param
├── lib/formPageIntent.ts                      # EDIT — drop transfer field from TxNewParams
└── lib/i18n/{bn,es,ja,zh,ko}.ts               # EDIT — add new keys; remove balances-only keys

web/test/
├── finance/personSummary.test.ts              # NEW — pure aggregation unit + property tests
├── dashboard/member-summary.test.tsx          # NEW — selector + personal row behavior
├── widgets/savings-trends.test.tsx            # EDIT — add single-month comparison tests
├── web/tx-form-transfer.test.tsx              # NEW — Transfer option creates a transfer
├── balance-summary.test.tsx                   # DELETED
├── web/settle-up-currency.test.tsx            # DELETED (settle-up flow removed)
├── finance-properties.test.ts / finance-goldens.test.ts / transfer-exclusion.test.ts  # EDIT — drop balanceBetween cases, keep transfer-exclusion
└── i18n/*                                     # EDIT — guard new keys across 5 catalogs
```

**Structure Decision**: A new pure `personSummary.ts` holds all per-person aggregation (income-by,
expense-share-by, transfers-net-by, and the composed net) so the math is unit-testable in isolation and the
`MemberSummary` component stays a thin presenter — mirroring how `NetSummaryHero`/`SavingsTrendsBody` keep
logic pure and reuse `savingsRate`/`effectiveShares`. The member selector lives on the dashboard page (not
a widget) per the product decision ("not a card"). Split math is **reused, never reimplemented**.

## Complexity Tracking

No constitution violations — section intentionally empty. (The balances deletion touches several files but
is a straight removal of one discrete feature; tracked in research.md D1, not a complexity exception.)
</content>

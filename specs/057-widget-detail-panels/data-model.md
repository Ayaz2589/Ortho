# Data Model: Widget Detail Panels (base branch)

**Feature**: 057 | **Date**: 2026-08-22 | **Plan**: [plan.md](./plan.md)

**This feature persists nothing.** No table, no column, no migration, no localStorage key
(FR-024). Every figure a panel shows is derived, at render, from data already loaded for the
dashboard (FR-017) — exactly as every widget card already works.

This document therefore pins two things instead: the **registration shape** panels are declared
through, and the **derived shapes** each base-branch panel computes and from which engine.

---

## 1. Registration shape

### `WidgetDefinition.Panel` (modified type)

```ts
export interface WidgetDefinition {
  id: string
  title: string
  description: string
  defaultEnabled: boolean
  /** Propless card body — reads via useApp() + the two scope contexts. */
  Body: ComponentType
  /** Optional propless detail panel (spec 057). Absent ⇒ the placeholder. */
  Panel?: ComponentType          // ← the only change
  href?: string
}
```

**Invariants**:

| # | Invariant | Why |
|---|---|---|
| R-1 | `Panel` is a bare `ComponentType` — no props, ever. | Mirrors `Body`. A prop would change the type for all widgets to serve some (D1, and spec 056's reasoning). |
| R-2 | `Panel` is optional, and absence means the placeholder. | Lets three panels ship now and six later without a broken intermediate state (FR-003). |
| R-3 | A widget with `href` set never renders a `Panel`. | Navigation widgets route; they have no detail (FR-006). If both are ever set, `href` wins. |
| R-4 | `financial-health` must not declare a `Panel`. | FR-007, and D11's regression lock depends on it. |

### Panel scope caption (derived, never stored)

```ts
interface PanelCaption {
  /** "Alice" | "Household" — omitted when the panel ignores the people axis. */
  subject?: string
  /** "June 2026" | "Last 90 days" — omitted when the panel ignores the time axis. */
  period?: string
}
```

Sourced from `DashboardScope.periodLabel` and `resolveUser(scope.personId).name`. **Both fields
are optional on purpose** (FR-014): a panel that ignores an axis must omit that half rather than
state something untrue. See D5 for the per-panel table.

---

## 2. Derived shapes per panel

### US2 — Home equity

| Shape | Source | New math? |
|---|---|---|
| Payoff date | `maturityDate(closingDate, termYears)` | no — exported, currently unreachable from UI |
| Years remaining | `yearsRemaining(closingDate, termYears, asOf)` | no — same |
| Payment schedule | `upcomingAmortization(months, originalLoanCents, annualRatePercent, termYears, closingDate, asOf)` → `AmortizationEntry[]` | no — same |
| Per-mortgage rows | `properties[].mortgage`, one row per property with a mortgage | no — the card already sums these; the panel stops summing |
| Equity headline | `housingSummary(properties).equity` | no — same figure the card shows |

`AmortizationEntry` is `{ month: Date; principalCents: number; interestCents: number }`, already
exported. **Ignores both scope axes** — a property is a household asset and a mortgage schedule
is not windowed (consistent with `HomeEquityBody`, which reads neither context).

### US3 — Budgets

| Shape | Source | New math? |
|---|---|---|
| Carry history | **`budgetLedgerForMonth(budget, transactions, referenceMonth)` → `RolloverMonth[]`** | **extraction only** — see below |
| Current status | `budgetStatusForMonth(...)` — now the last entry of the above | no — behaviour preserved |
| Composing transactions | filter scoped transactions by `kind === 'expense' && category === budget.category` within the reference month | trivial |
| Month-end projection | `monthElapsedFraction(monthKey, now)` from `planSummary.ts` | no — exported |
| Person with no personal limit | categories present in scoped spend but absent from `scopeBudgets(budgets, scope)` | trivial set difference |

**The extraction (D8)** — `budgetStatusForMonth` already builds the monthly-spend series, runs
`computeRolloverLedger` over it, and discards all but `ledger[ledger.length - 1]`:

```ts
/** The full rollover ledger, one entry per month from the budget's creation
 *  month through `referenceMonth`. Spec 057 — the series budgetStatusForMonth
 *  has always computed and thrown away. */
export function budgetLedgerForMonth(
  budget: Budget,
  transactions: Transaction[],
  referenceMonth: Date,
): RolloverMonth[]

/** Unchanged behaviour: the last entry of the ledger above. */
export function budgetStatusForMonth(...): BudgetStatus
```

`RolloverMonth` is already exported (`budgets.ts:22`); no new type. **Constraint**: this is a
pure move. `budgetStatusForMonth`'s existing tests must pass unmodified and no golden vector may
drift.

**Honours both axes** — `scopeBudgets` for limits and scoped transactions for spend, projected at
the same entry point, exactly as `BudgetsBody` does. There is deliberately **no fallback to a
household limit** for a person who has set none (FR-011 of spec 054; the spec-052 error class).

### US10 — Recent activity

| Shape | Source | New math? |
|---|---|---|
| Feed | scoped transactions sorted by date desc, beyond the card's 5 | no |
| Date grouping | `shortDate` / existing date helpers | no |
| Row → transaction | route to the transactions destination | no |

**Honours the people axis; ignores the time window** by design (spec 041 O-2). Its caption must
say so (D5) — captioning it with a month it does not apply would be a new mixed-subject defect.

---

## 3. What no panel may do

| # | Rule | Source |
|---|---|---|
| P-1 | No panel writes financial data. Routing to a screen that does is fine. | FR-019 |
| P-2 | No panel fetches. Everything derives from loaded data. | FR-017, SC-004 |
| P-3 | No panel changes its widget's card. | FR-025, SC-007 |
| P-4 | The balances panel (US7, follow-up) reads the **whole** ledger and filters output only — never person-projected rows. | FR-015 |
| P-5 | No new colour token; nothing red. | FR-021 |

**P-4 restated, because it is the one that silently produces a wrong number**: `projectForPerson`
rewrites each row to `{ amount_cents: <their share>, owner_ids: [personId] }`. A debt exists
precisely *because* one person paid for something others co-own, so projection deletes the
relationship the debt derives from. Fed projected rows, `outstandingBalances` sees a ledger of
solo expenses and renders **"All settled up."** for a household that owes money — plausible and
wrong, not a crash. The card carries a ⚠️ comment against exactly this "consistency" refactor;
the panel inherits it.

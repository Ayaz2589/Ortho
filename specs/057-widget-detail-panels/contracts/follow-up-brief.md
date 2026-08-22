# Follow-up brief: the six parallel panel sandboxes

**Feature**: 057 | **Date**: 2026-08-22

One sandbox per panel, all six starting from `main` **after this base branch merges**. Each is
independently testable, independently reviewable, and independently mergeable.

Read [panel-contract.md](./panel-contract.md) first — it is the binding agreement. This document
is the per-panel assignment.

---

## Prerequisite

**Wait for the base branch to merge to main.** Six sandboxes rebasing onto an unmerged branch is
strictly worse than waiting. What the base delivers, and what you would be building against
before then, is: the `Panel?` registry field, `WidgetPanel`, the mobile full-screen presentation,
the extracted kit, and your reserved catalog sub-blocks.

**What actually shipped** (this section is written after the base merged, against the real code —
trust this over the rest of the document if the two ever disagree):

- `WidgetPanel` (`web/components/widgets/WidgetPanel.tsx`) owns the `Drawer` itself and exports
  three hooks your `Panel` calls directly — no props, since `Panel` stays a bare `ComponentType`:
  - `usePanelCaption({ subject?, period? })` — C-1. Call once; omit whichever field an axis you
    don't honour.
  - `usePanelRouteOut({ label, href })` — C-4, optional.
  - `usePanelDetail()` → `{ push(title, content), pop() }` — FR-005/D6, optional. `push` swaps the
    header's close control for back and shows `content` until back/Escape; the previous content
    unmounts while a detail is shown (it is not hidden with CSS), so keep detail views to derived
    data, not local state you need preserved underneath.
  All three throw if called outside a `WidgetPanel` — a panel rendered standalone in a test needs
  a `<WidgetPanel open title="…" onClose={…}>` wrapper (see `test/widgets/panels/*.test.tsx` for
  the pattern all three shipped panels use).
- The kit (`web/components/widgets/panels/kit/`, imported from
  `@/components/widgets/panels/kit`) has exactly three primitives so far:
  - `PanelEmpty` — the empty-state wrapper (contract C-2).
  - `PanelSectionLabel` — a small uppercase group heading.
  - `PanelRow` — a `label`/`value` line; `labelClassName`/`valueClassName` override which side
    reads as prominent (a mortgage's name is the headline in home equity; a transaction's amount
    is in budgets — the kit does not guess).
  Deliberately **not** extracted: a headline-stat primitive (only home equity's shape needed one)
  and any multi-column dense row (home equity's amortization row is 3-column and bespoke). Don't
  assume either exists — check the kit's actual files before reaching for something that isn't
  there.
- Your reserved catalog sub-block is already carved into all five `web/lib/i18n/{bn,es,ja,ko,zh}.ts`
  files, in registry order, as a comment-only marker with no keys under it yet, e.g.:
  ```ts
  // spec 057 — widget panels: US6 top-merchants (reserved for a follow-up sandbox — see contracts/follow-up-brief.md)
  ```
  Find yours with `grep -n "US<n>" web/lib/i18n/es.ts` (substitute your story number), then add
  your keys directly below that comment line, in that file, in all five catalogs. Do not add a
  new header comment of your own or touch any other sub-block — including the three that already
  have real content (US2 home equity, US3 budgets, US10 activity), which sit earlier in the same
  region and are NOT reserved-only.

---

## The six

Ordered by value, not by build order — they are genuinely parallel.

### US4 — Spending pace · `SpendingPacePanel`

**The question the card cannot answer**: the card shows one ±% against the prior 30 days. That
number hides a dozen category movements in both directions.

| | |
|---|---|
| Honours | both axes |
| Engines | `rankCategories` (`lib/reports/categories.ts`); the body already computes the 60-day series and discards the prior 30 |
| Route out | — |
| Watch | An increase must read no more alarmingly than a decrease (FR-021). The "biggest movers" view is the highest-value part; do not stop at a category list. |

### US5 — Savings trends · `SavingsTrendsPanel`

**The question the card cannot answer**: a rate is a ratio and the card discards both terms.

| | |
|---|---|
| Honours | both axes |
| Engines | `savingsRate`, `buildSavingsSeries` (`lib/reports/savings.ts` — the latter currently unused here) |
| Route out | — |
| Watch | The body already buckets income and expense per month and keeps only the rate. Reuse that shape rather than re-bucketing. A shortfall reads by sign and position, never colour. |

### US6 — Top merchants · `TopMerchantsPanel`

**The question the card cannot answer**: rows 6+, and which merchants are subscriptions.

| | |
|---|---|
| Honours | both axes |
| Engines | `detectRoutines` / `normalizeMerchantKey` (`lib/finance/routines.ts`) |
| Route out | transactions, filtered by merchant |
| Uses second level | **yes** — per-merchant detail |
| Watch | The recurring flag is the new insight; a longer list alone barely satisfies C-3. |

### US7 — Who owes whom · `HouseholdBalancesPanel`

**The question the card cannot answer**: why the debt exists, and the shortest way to end it.

| | |
|---|---|
| Honours | **neither axis** — a debt is a standing position and does not expire at month end |
| Engines | `simplifyDebts`, `allPairBalances`, `outstandingBalances`, `peopleInLedger` (`lib/finance/balances.ts`) — `simplifyDebts` currently has **no UI consumer at all** |
| Route out | — (settle-up prefill is deferred; see below) |
| Uses second level | **yes** — per-pair breakdown |
| Watch | ⚠️ **§5 of the contract applies to you.** Read the whole ledger; never `useScopedTransactions`. Also: FR-019 — do not add a settle-up action. Spec 043 removed that plumbing and restoring it is its own scope. |

### US8 — Housing costs · `HousingCostsPanel`

**The question the card cannot answer**: which property, and what share of income.

| | |
|---|---|
| Honours | **neither axis** on the housing figures (a property is a household asset, point-in-time) — but the income share needs a period; caption honestly |
| Engines | `housingSummary`, `incomeForMonth` (`lib/planning/planSummary.ts`) |
| Route out | housing |
| Watch | Omit the income share entirely when there is no recorded income — never zero, never infinite. State the share plainly, with no pass/fail judgement. |

### US9 — Goals · `GoalsPanel`

**The question the card cannot answer**: the trajectory, and the projected arrival date.

| | |
|---|---|
| Honours | time only (`now`, for pacing) — goals span their lifetime, not the window |
| Engines | `cumulativeSeries`, `monthlySeries` (`lib/finance/goalSeries.ts`, built for the spec-049 detail page), `goalProgress`, `goalPacing` |
| Route out | the goal's existing detail page |
| Watch | **Goals is the subject of a separate open question** about whether it should be person-scoped at all. Do not settle it here; do not assume an answer. Behind pace is calm accent, never red. |

---

## What every sandbox owns

```text
web/components/widgets/panels/<Name>Panel.tsx      NEW — yours alone
web/test/widgets/panels/<name>-panel.test.tsx      NEW — yours alone
web/lib/widgets/registry.tsx                       ONE line: Panel: <Name>Panel,
web/lib/i18n/{bn,es,ja,ko,zh}.ts                   your reserved sub-block ONLY
```

Four touch points. Exactly one is shared, and it is one line in a list — the only merge you
should ever have to resolve, and a trivial one.

## What every sandbox must not touch

`WidgetBoard.tsx`, `Widget.tsx`, `WidgetPanel.tsx`, `dashboard/page.tsx`, any existing kit
primitive, any other panel's catalog sub-block, any pre-existing test under `test/widgets/`.

If you conclude the frame needs to change: **stop and raise it.** Five other branches are in
flight against it, and a frame change made in one sandbox will surprise all of them.

## The append-only rule

You may **add** a kit primitive in a new file. You may **never modify** an existing one.

The kit was extracted from three panels (home equity, budgets, activity) and is therefore a
hypothesis your panel is testing. If two panels independently add near-identical primitives,
that duplication is *correct* under this rule and gets consolidated in a single pass after the
six land — which is far cheaper than six branches negotiating a shared file while all are open.

## Merging

Start all six together; **merge them as they go green**, one at a time. The limiter is review
capacity, not machines — six panels landing at once is six PRs to actually read, and this
codebase's standard is high enough that rubber-stamping them would waste the parallelism.

Rebase on main between merges. The registry line is the only expected conflict.

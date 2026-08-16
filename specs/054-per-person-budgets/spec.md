# Spec 054 — Per-person budgets

## Why

Budget limits are the last household number that has no PEOPLE axis. Spec 051 gave spend a
scope (`MoneyScope`) and threaded it through the money engines, but it deliberately left
**limits household-level**: "Budget LIMITS stay household-level — what moves is the spend
measured against them." That was the right call *then*, because there was nowhere to store a
personal limit.

The result today is that a household can ask "how much did **Priya** spend on dining?" but not
"how much is **Priya** allowed to spend on dining?" — so the person scope on the Planning hub
shows a personal spend figure measured against a household allowance, which is a milder form of
the exact error spec 052 fixed for financial health (one person's money measured against the
whole household's).

Under the handler pattern this matters more than it would elsewhere: one adult typically enters
for several, and giving each person their own envelope is the normal way a low-income household
actually divides money.

## What ships

A budget row gains an optional owner. `person_id = null` is a **household** budget — today's
behavior, unchanged. `person_id = <person>` is that person's **personal** budget for the
category, measured against that person's scoped spend.

### FR-001 — A budget may belong to one person or to the household
`budgets.person_id` (nullable FK to `household_people`). Existing rows are household budgets;
nothing about them changes.

### FR-002 — One budget per (household, category, person)
The old `unique (household_id, category)` becomes
`unique nulls not distinct (household_id, category, person_id)` — so a household keeps at most
one shared dining budget AND at most one dining budget per person. `NULLS NOT DISTINCT` is what
keeps the shared row unique; without it Postgres would treat every `null` person as distinct and
let duplicate household budgets accumulate.

### FR-003 — Scope selects the budget set, and never falls back
`scopeBudgets(budgets, scope)` is the single rule, living beside `scopeTransactions`:

- household scope ⇒ only budgets with `person_id == null`
- person scope ⇒ only that person's budgets

A person with no personal budget for a category has **no budget** there — the household limit is
NOT borrowed. Borrowing it would measure one person's share against an allowance sized for
everyone, which is the spec-052 error class. A person who wants the household number simply
looks at "Everyone".

### FR-004 — The engines project budgets and transactions at the same point
`buildPlanSummary` and `generateInsights` already project transactions once at their entry
point; they now project budgets there too, from the same scope. No rule reaches past the
projection for an unscoped budget list.

### FR-005 — The budgets page can create a budget for a person
`/planning/budget` gets the same "whose money" chip bar the Planning hub has (`PlanScopeBar`,
hidden for a one-person household). The category list shows the selected scope's limits, and the
drawer creates/edits/removes a budget for that scope. Editing "Everyone" is unchanged.

### FR-006 — Household surfaces stay household
The dashboard Budgets widget keeps showing household budgets only. Spec 034/043 made the widget
board deliberately household-wide ("a widget never silently changes meaning under a control it
doesn't show"), and personal limits must not be summed into a household total.

### FR-007 — Existing behavior is byte-identical for a household with no personal budgets
Every existing test, golden vector and screen behaves exactly as before when every row has
`person_id = null`. `scopeBudgets` returns the SAME array reference in that case, mirroring
`scopeTransactions`'s no-op contract.

## Out of scope (and why)

- **Financial health `plan_engagement`** keeps counting every budget in the household. Spec 052
  fixed the dimensions that were *user-private measured against household spend*;
  `plan_engagement` is household-scoped **by design** (budgets/goals are household facts), and a
  personal envelope is still the household engaging with a plan. Changing it would need a person
  id the user-private engine does not have, and would move 041/044 numbers for no correctness
  gain.
- **Per-person goals / sinking funds owned by a person** — goals are a separate object with their
  own contribution model; nothing here blocks it later.
- **Splitting a household budget into per-person allowances automatically** (e.g. "$600 dining,
  $300 each"). That is a pooling rule, the same unvalidated question spec 050 deferred.

## Success criteria

- SC-001 — In a 2+ person household, a user can set a dining limit for one person and see it
  measured against only that person's dining spend.
- SC-002 — With no personal budgets anywhere, the whole suite and every golden vector are
  unchanged.
- SC-003 — A personal budget never appears in, or contributes to, a household total.
- SC-004 — A person with no personal budget for a category shows "Not set", not the household
  number.

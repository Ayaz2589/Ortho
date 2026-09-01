# Data Model: Savings & Debts

**Feature**: `specs/059-savings-debts-redesign` | **Date**: 2026-09-01

## Stored entities — unchanged

**No migration. No new table, no new column, no altered constraint.** Both entities below are
reproduced from `web/lib/types.ts` for reference only; this feature does not edit either.

### `Goal` (Supabase `goals`, spec 027)

| Field | Type | Role in this feature |
|---|---|---|
| `id` | uuid | Item identity; the detail route's `?id=` |
| `household_id` | uuid | Scope. Unchanged — see research R9 |
| `name` | string | Card and hero title; truncates at the column edge |
| `kind` | `'savings' \| 'debt_payoff'` | **The axis this whole feature turns on.** Already present |
| `target_cents` | integer | Denominator of every percentage; the chart's target line |
| `target_date` | `'YYYY-MM-DD' \| null` | **Not used by the new projection.** Still drives the legacy off-track insight |
| `linked_account_id` / `linked_category` | nullable | Untouched context fields |
| `created_at` | timestamp | Fallback start anchor when it precedes the first contribution |
| `created_by`, `updated_at` | — | Untouched |

**The `kind` field is why this feature needs no migration.** Every existing row already carries one of
the two values, so "whatever goals the user has, they will now become savings or debt" requires no
backfill and no member-facing reclassification — only a presentation that stops ignoring the field.

### `GoalContribution` (Supabase `goal_contributions`, spec 027)

| Field | Type | Role in this feature |
|---|---|---|
| `id` | uuid | Ledger row identity for edit/delete |
| `goal_id` | uuid | Grouping key |
| `amount_cents` | integer, positive | Every derivation's input |
| `date` | `'YYYY-MM-DD'` | Cadence day, month bucketing, chart x-position |
| `note` | string \| null | Rendered in the ledger row when present |
| `created_at` | timestamp | Stable tie-break for same-day ordering |

---

## Derived structures — computed on read, never stored

All of these live in the new pure module `web/lib/finance/goalProjection.ts`. Nothing here is
persisted, cached across sessions, or written back — the same "derived, never stored" discipline as
`insights.ts`, `personSummary.ts`, and `spendingPace.ts`.

### `GoalCadence`

The observed rhythm of past contributions. **Describes behaviour; never a commitment** (FR-037).

| Field | Type | Definition |
|---|---|---|
| `amountCents` | integer | Modal contribution amount; ties → larger (research R2) |
| `dayOfMonth` | 1–31 | Modal day-of-month; ties → earlier |
| `firstMonthKey` | `'YYYY-MM'` | Month of the earliest contribution — the "since {month}" in the sub-line |
| `contributionCount` | integer | Drives the disclosure label and the projection floor |

### `GoalPaceMonth`

One entry per calendar month from the first contribution month through the reference month, contiguous
with gaps filled — so a quiet stretch reads as a gap rather than making two distant months adjacent.

| Field | Type | Definition |
|---|---|---|
| `monthKey` | `'YYYY-MM'` | The month |
| `cents` | integer | That month's contribution total; `0` for a missed month |
| `status` | `'on_plan' \| 'under' \| 'over' \| 'missed'` | Against `cadence.amountCents` ±2% (research R3) |

`'over'` exists so the pace chart can draw a bar taller than the plan line without treating it as a
deviation to be explained (FR-024). It counts as on-plan for `onPlanCount`.

### `GoalProjection`

The whole answer to "when is this done?", or an explicit refusal to answer.

| Field | Type | Definition |
|---|---|---|
| `available` | boolean | `false` ⇒ every other field is null and **nothing may be rendered** |
| `unavailableReason` | `'insufficient_history' \| 'no_pace' \| 'reached' \| null` | Why, for honest copy |
| `basis` | `'cadence' \| 'recent_average' \| null` | Which pace was used — stated aloud (FR-004) |
| `pacePerMonthCents` | integer \| null | `cadence.amountCents` when every month is on plan, else the mean of the last three contributions |
| `paymentsToGo` | integer \| null | `ceil(remaining / pace)` — a partial final payment rounds up (FR-005) |
| `finishDate` | `Date` \| null | `nextCadenceDate + (paymentsToGo − 1)` months, local calendar |
| `onPlanCount` / `monthCount` | integer | The "N of M on plan" reading |
| `missedMonthKeys` | `string[]` | Months with no contribution, for the consistency sentence |
| `streakMonths` | integer | Consecutive non-missed months ending at the reference month |

**Guard rails, enforced in the engine rather than at each call site** (FR-006). `available` is `false`
when any of:
- `contributionCount < 3` → `'insufficient_history'`
- `pacePerMonthCents <= 0` → `'no_pace'`
- the target is already reached → `'reached'`

Putting the refusal in the returned value — rather than leaving four surfaces to each remember the
rule — is what makes SC-008 ("no projected date anywhere") a property of one function.

### `WhatIfScenario`

Rows of the detail page's what-if table. **Derived, never configured** (FR-020).

| Field | Type | Definition |
|---|---|---|
| `kind` | `'current' \| 'planned' \| 'increase' \| 'skip'` | Which lever |
| `monthlyCents` | integer | The amount this scenario assumes |
| `finishDate` | `Date` | Result under that amount |
| `deltaMonths` | integer | Negative = sooner, positive = later, 0 = on plan |

Row generation:
- **On plan** → `current` (the cadence), `increase` at +25%, `increase` at +67% (each rounded to a
  clean figure), and `skip` one month.
- **Off plan** → `current` labelled with the recent average, then `planned` at the cadence amount
  presented as an *improvement*, then one `increase`. This is the inversion FR-021 requires: when a
  member has drifted, the plan they set is the good news, not the baseline.

`deltaMonths > 0` is stated plainly and never marked (FR-022, FR-034).

### `SavingsDebtsSummary`

The aggregate header. Computed across items **that have a cadence**; items without one contribute to
the totals but not to the monthly commitment (there is nothing honest to add).

| Field | Type | Definition |
|---|---|---|
| `monthlyCommitmentCents` | integer | Σ `cadence.amountCents` over items with a cadence |
| `contributedCents` / `targetCents` | integer | Σ across **all** items |
| `activeCount` | integer | Items counted in the footer |
| `nextToFinish` / `lastToFinish` | `{ name, finishDate } \| null` | Min and max `finishDate` among items with `available` projections |

Rendering rules the shape enforces:
- `nextToFinish === lastToFinish` (one projectable item) ⇒ the sub-line drops the "last:" clause
  (FR-010).
- `nextToFinish === null` (no projectable item) ⇒ the sub-line is **absent**, not empty or zeroed
  (FR-010).

---

## Relationships

```
Goal 1 ──── * GoalContribution
 │                  │
 │                  └──→ GoalCadence ──→ GoalPaceMonth[] ──→ GoalProjection ──→ WhatIfScenario[]
 │                                                                   │
 └───────────────────────────────────────────────────────────────────┴──→ SavingsDebtsSummary
                                                                            (across all items)
```

Every arrow is a pure function of what is to its left plus an injected `now`. No arrow crosses back
into storage.

## What is deliberately *not* modelled

- **A `paused` / `archived` state** — does not exist today and was not drawn (spec Assumptions).
- **A per-item person attribution** — research R9; the household axis is unchanged.
- **A stored projection or snapshot** — the finish date is recomputed on every render. It is cheap,
  and a stored one would go stale the moment a contribution is edited, which the inline ledger now
  makes a one-tap action.
- **A second colour for debt vs savings** — direction of travel and wording carry the distinction
  (FR-033). Worth stating in the data model because it is the reason `kind` maps to *layout*
  parameters rather than to a palette entry.

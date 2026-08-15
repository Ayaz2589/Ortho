# Data Model: Goal Detail & Contribution Editing (spec 045)

**No database change. No migration.** Every column this feature reads or writes already exists.

---

## Persisted entities (unchanged)

### `goals`

Read-only for this feature beyond the existing `updateGoal` / `deleteGoal` paths.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `household_id` | uuid | RLS scope |
| `name` | text | |
| `kind` | `savings` \| `debt_payoff` | framing only; one progress model |
| `target_cents` | integer | USD cents; may be ≤ 0 (guarded — see Validation) |
| `target_date` | date \| null | null ⇒ undated ⇒ no pace claim, no pace line |
| `linked_account_id` | uuid \| null | untouched |
| `linked_category` | text \| null | untouched |
| `created_at` | timestamptz | the pace line's start anchor |

### `goal_contributions`

| Field | Type | Editable by this feature | Notes |
|---|---|---|---|
| `id` | uuid | no | identity |
| `goal_id` | uuid | **no** | an edit never re-parents a contribution |
| `amount_cents` | integer | **yes** | USD cents; must be > 0 |
| `date` | date (`YYYY-MM-DD`) | **yes** | local calendar day |
| `note` | text \| null | **yes** | empty string stored as null |
| `created_by` | uuid | **no** | who recorded it; not reassigned on edit |
| `created_at` | timestamptz | **no** | ledger ordering tiebreak |

**Why `goal_id`, `created_by`, `created_at` are not editable**: moving a contribution between
goals would silently change two goals' saved totals from a form that shows only one; rewriting
`created_by` would falsify the record of who entered it. Neither is asked for by any FR.

---

## Derived values (never stored)

Progress is always the sum of a goal's contributions — the "derived, never stored" rule. This
feature adds two derived **series** and reuses the two existing derived summaries unchanged.

### Reused unchanged

- `goalProgress(target_cents, contributions)` → `{ saved_cents, target_cents, remaining_cents,
  fraction, reached }` (`lib/finance/goals.ts`, vector-pinned).
- `goalPacing(target_cents, target_date, created_at, saved_cents, now)` → `{ off_track,
  past_due, expected_cents, shortfall_cents, suggested_monthly_cents }` (same file, same pins).

### New: `lib/finance/goalSeries.ts`

```ts
export interface CumulativePoint {
  /** Local calendar day of the point. */
  day: string            // 'YYYY-MM-DD'
  /** Sum of every contribution dated on or before `day`, in USD cents. */
  cumulativeCents: number
  /** Steady-pace expectation on `day`, in USD cents. Null for an undated goal. */
  paceCents: number | null
}

export interface MonthPoint {
  monthKey: string       // 'YYYY-MM'
  cents: number          // that month's contribution total, USD cents
}

export function cumulativeSeries(
  contributions: readonly GoalContribution[],
  opts: { targetCents: number; targetDate: string | null; createdAt: string; now: Date }
): CumulativePoint[]

export function monthlySeries(contributions: readonly GoalContribution[]): MonthPoint[]
```

**`cumulativeSeries` contract**

- Ascending by `day`; one point per distinct contribution date (two contributions on the same day
  produce ONE point whose `cumulativeCents` includes both — the chart plots a running total, while
  the ledger below still lists both rows separately).
- Monotonically non-decreasing in `cumulativeCents` (amounts are always > 0).
- The final point's `cumulativeCents` **equals** `goalProgress(...).saved_cents` — the chart can
  never disagree with the headline. Property-tested.
- `paceCents` uses the same basis as `goalPacing.expected_cents`:
  `round(targetCents × clamp(elapsed / span, 0, 1))`, where `span` is `createdAt → targetDate` and
  `elapsed` is `createdAt → day`, both as local calendar-day indices (the `dayIndex` rule in
  `goals.ts`, so spans are timezone-stable). Null throughout when `targetDate` is null.
- A single contribution still yields a drawable line: a leading zero point is prepended at the
  goal's creation day so the series has two points.
- Empty input → `[]` (the page shows the empty state instead of a chart).

**`monthlySeries` contract**

- Ascending by `monthKey`.
- Covers every month from the earliest to the latest contribution **inclusive**, filling
  intervening months with `cents: 0` — so a gap reads as a gap, not as adjacency. Months outside
  that span are never emitted, so a goal dormant since 2019 does not render a hundred empty bars.
- `sum(cents)` **equals** `goalProgress(...).saved_cents`. Property-tested.
- Empty input → `[]`.

Both functions are pure, deterministic, integer-cents in and out, with the reference date
injected. Neither is promoted to `shared/test-vectors/` — see research R6.

---

## Store surface

One addition to `AppState` in `web/lib/store.tsx`:

```ts
updateContribution: (c: GoalContribution) => void
```

Optimistic-with-rollback, mirroring `updateGoal`: apply to state, `await` the Supabase
`.update({ amount_cents, date, note }).eq('id', c.id)`, and on error restore the previous row and
`setError`. `addContribution` and `deleteContribution` are unchanged.

---

## Validation rules

| Rule | Where enforced | FR |
|---|---|---|
| Contribution amount must be > 0 | contribution form `canSave` | FR-020 |
| Untouched amount writes stored cents verbatim | form's `originalAmountText` guard | FR-021 |
| Empty note stored as `null`, not `''` | form save | — (matches add mode) |
| Missing/blank date falls back to today | form save | — (matches add mode) |
| `target_cents ≤ 0` ⇒ `fraction` 0, no division | existing `goalProgress` | Edge case |
| `fraction` clamped to ≤ 1 | existing `goalProgress` | Edge case |
| Unknown/absent goal id ⇒ replace to `/planning` | detail page guard | FR-013 |

## State transitions

A contribution has no status field; its lifecycle is create → (edit)\* → delete. The only
transition this feature adds is **edit**, and it is idempotent: saving an unchanged contribution
writes the same three column values back and leaves every derived figure identical.

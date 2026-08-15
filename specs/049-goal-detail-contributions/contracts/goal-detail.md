# Contracts: Goal Detail & Contribution Editing (spec 045)

The UI contracts this feature exposes. Each is what a test asserts against; none describes
internal structure.

---

## C1 — Route contract: `/planning/goals`

The route file is repurposed from an index list into a **single-goal detail page**.

| Input | Behavior |
|---|---|
| `?id=<goalId>` resolving to a goal | Render that goal's detail page |
| No query string | `router.replace('/planning')` |
| `?id=` blank / whitespace | `router.replace('/planning')` |
| `?id=<unknown>` | `router.replace('/planning')` |
| Goal deleted while the page is open | `router.replace('/planning')` |
| Search not yet read (pre-mount) | Render nothing (no flash of the redirect) |
| App still loading | Render nothing; do not redirect on a not-yet-loaded store |

The last row matters: `loading` must gate the redirect, or a refresh would bounce to `/planning`
before the goal list arrives. `app/(app)/housing/edit/page.tsx` has the same guard.

**Deep-link shape** — `/planning/goals?id=<uuid>`. Refresh-safe and bookmarkable on web, and
correct in the Capacitor iOS shell, because the exported `goals.html` is a real file; a
`[goalId]` path segment would not be (research R1).

---

## C2 — Planning hub goals section

```
GoalsSummaryCard({ summary: GoalsSummary })   // unchanged prop
```

| Contract | Assertion |
|---|---|
| One card per goal | `getAllByTestId('goal-card')` length === goal count |
| Off-track first | The first card is an off-track goal when one exists |
| Empty household | `goals-empty` present, zero `goal-card` |
| No index link | No link with href `/planning/goals` **without** an `?id=` |
| Card opens its goal | Each card has a link to `/planning/goals?id=<that goal's id>` |
| Card records a contribution | Each card has an "Add contribution" control that opens the form in place |

---

## C3 — `GoalCard`

```
GoalCard({
  goal, contributions, now?,
  onAddContribution?, onEdit?,
  href?,                    // when set, renders the "open goal" affordance
  maxContributions?,        // default 3 on the hub; the detail page passes the full ledger
  onEditContribution?,      // detail page only
  onDeleteContribution?,    // detail page only
})
```

| Contract | Assertion |
|---|---|
| Money headline | `saved of target`, both formatted through `formatMoney` |
| Progress bar | `role="progressbar"` with `aria-valuenow` = `round(fraction × 100)` |
| Remaining | `{0} to go`, or `Reached` |
| Pace, dated + behind | Catch-up copy, color `var(--accent)` — **never** red |
| Pace, dated + on track | On-pace copy, muted |
| Pace, undated | No pace line at all |
| Recent contributions | At most `maxContributions`, newest first (date desc, then `created_at` desc) |
| Contribution actions | Rendered only when the corresponding handler is passed |

---

## C4 — Contribution form (add **and** edit)

```
ContributionForm({ goal, editing?, onClose })
```

`goal` drives visibility (null ⇒ closed), exactly as today. `editing` (a `GoalContribution` or
null/undefined) selects the mode.

| Contract | Add mode | Edit mode |
|---|---|---|
| Title | `Add to {0}` | `Edit contribution` |
| Amount field | empty | pre-filled from stored cents, in display currency |
| Date field | today | the contribution's stored date |
| Note field | empty | the contribution's stored note |
| Save disabled | amount ≤ 0 or unparseable | same |
| Save writes | `addContribution` with a fresh uuid | `updateContribution` with the same id |
| Identity preserved | — | `id`, `goal_id`, `created_by`, `created_at` unchanged |
| **Untouched amount** | — | writes the **stored cents verbatim** — no FX round-trip drift |

The last row is the money invariant (FR-021). Test at GBP 0.78, where the round trip is provably
lossy.

---

## C5 — Store: `updateContribution`

```ts
updateContribution(c: GoalContribution): void
```

| Contract | Assertion |
|---|---|
| Optimistic | `goalContributions` reflects `c` synchronously |
| Persists | `supabase.from('goal_contributions').update(...).eq('id', c.id)` |
| Writes only editable columns | payload keys ⊆ `{ amount_cents, date, note }` |
| Rolls back on error | the previous row is restored and `error` is set |
| Never re-parents | `goal_id` absent from the update payload |

---

## C6 — Pure series (`lib/finance/goalSeries.ts`)

| Function | Contract |
|---|---|
| `cumulativeSeries` | ascending by day; non-decreasing; **last point === `goalProgress().saved_cents`**; `paceCents` null iff undated; leading zero point at the goal's creation day; `[]` for no contributions |
| `monthlySeries` | ascending by month; contiguous from earliest to latest contribution month (gaps filled with 0); **`sum(cents) === goalProgress().saved_cents`**; `[]` for no contributions |

Both pure, deterministic, integer cents, injected reference date. The two bolded identities are
property-tested — they are what stops a chart from ever disagreeing with the headline figure.

---

## C7 — Chart leaves

`components/goals/charts/GoalCumulativeChart.tsx`, `components/goals/charts/GoalMonthlyChart.tsx`.

| Contract | Assertion |
|---|---|
| recharts is imported ONLY here | `test/bundle/no-eager-recharts.test.ts`, with `EAGER_DIRS` extended to cover `components/goals` and `components/planning` |
| Reached via `next/dynamic` | the detail page imports them dynamically |
| Presentational | they receive `CumulativePoint[]` / `MonthPoint[]` and compute no money |
| Token colors only | saved series `--positive`, pace line `--hairline`/`--text-3`; no red |
| No empty chart | with `[]` the page renders the empty state instead |

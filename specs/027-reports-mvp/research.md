# Research & Decisions: Reports MVP

## D1 — Where does Reports live? (resolved with requester)

**Decision:** A **mode inside the Dashboard page**, toggled by an Overview | Reports
segmented control. Not a new route, not a fifth primary destination, not a Dashboard-adjacent
sidebar link.

**Rationale:** The constitution (Principle III + Additional Constraints) requires the four
destinations (Dashboard, Transactions, Housing, Settings) be preserved across every canvas.
A fifth tab would need Complexity-Tracking justification; a mode-within-Dashboard needs none
and reads as the calmest option. Confirmed directly with the requester.

**Alternatives rejected:** (a) 5th primary tab — breaks the four-destination rule; (b)
dedicated `/reports` route + secondary sidebar link — a new destination in spirit, more
chrome, and `output:'export'` static routing adds friction for no MVP benefit.

## D2 — Per-month savings-rate series without a new migration

**Problem:** `household_month_summary(household, start, end)` aggregates the **entire**
window into a single `{income, expense, net}`. "Savings rate *over time*" needs a value per
calendar month.

**Decision:** Keep the RPC as-is (no migration). Split the selected interval into its
constituent calendar months with a pure `monthsInInterval(interval)` helper, then call
`fetchMonthSummary` once per month, in parallel (`Promise.all`). ≤ 12 calls, only when
Reports is open, re-issued on range change.

**Rationale:** The task forbids a new migration and asks to *wire the existing RPCs*. N small
parallel reads on an on-demand surface is acceptable and keeps the SQL untouched. The empty
month is free: the summary CTE coalesces to zeros over an empty set, so a monthless window
returns `{0,0,0}` → a neutral zero row + "—" rate (matches the clarified behavior).

**Alternatives rejected:** (a) add a `date_trunc('month', …)`-grouped RPC — a new migration,
out of scope; (b) derive per-month from `fetchDailyExpense` — gives expense but **not**
income, so savings rate is impossible from it alone; (c) compute from the in-memory
`transactions` the store already holds — would *not* wire the RPCs (the whole point of the
task) and re-introduces the duplicate client math the RPCs were built to remove.

## D3 — Savings-rate math: pure, unit-tested, not a golden vector

**Decision:** `savingsRate(incomeCents, expenseCents): number | null` in
`lib/reports/savings.ts`. Returns `(income − expense) / income` as a ratio; returns `null`
when `income <= 0` (rendered as "—"). Cents in, ratio out; render layer formats the percent.
Locked by ordinary deterministic unit tests, **not** added to `shared/test-vectors/`.

**Rationale:** Constitution VI requires money/ratio math be developed test-first with
deterministic coverage — satisfied by thorough unit tests. The golden-vector harness is for
the cross-cutting pinned engines (money/splits/mortgage/insights/range); a small
report-only ratio does not belong there and adding it would mean touching `gen-vectors.ts` +
new `shared/test-vectors/*.json` for no cross-consumer benefit. This mirrors
`lib/entitlements.ts`, which is locked by in-suite literal vectors rather than a golden
vector. `null`-on-zero-income guards NaN/Infinity/misleading-0%.

## D4 — Category deep-dive reuses existing donut + legend vocabulary

**Decision:** `rankCategories(rows: CategoryTotalRow[])` (pure) filters to positive spend,
sorts by cents desc, and computes each entry's `share` of the window total. The view renders
the existing `CategoryPie` donut leaf (already dynamic-imported, already the only recharts
donut) plus a ranked legend (icon tint · label · amount · share), reusing `categoryMeta()`
for tint/label/icon — the same vocabulary as `SpendByCategoryCard`.

**Rationale:** Reuse over reinvention; identical calm visual language; the category donut
needs no new chart leaf (the existing `CategoryPie` already accepts `{cents,label,color}`).

## D5 — recharts stays out of Dashboard initial-load

**Decision:** The savings-rate time-series is a new leaf
`components/dashboard/charts/SavingsRateChart.tsx` importing recharts, reached ONLY via
`next/dynamic({ ssr:false, loading: () => null })` from `SavingsRateView`. The category donut
reuses the existing dynamic-imported `CategoryPie`. Extend
`test/bundle/no-eager-recharts.test.ts` so the new leaf is the only added recharts importer.

**Rationale:** Matches spec 022's charts-in-a-leaf pattern and its guard test; Overview must
download no additional charting code (SC-006). Because Reports is a mode within the same page,
the dynamic import loads only when a user opens Reports.

## D6 — Fetch orchestration & states

**Decision:** `useReportsData(householdId, interval, monthWindows)` fetches the category
totals + all per-month summaries in parallel; exposes `{ status: 'loading'|'ready'|'error',
data, retry }`. Re-runs when the interval changes; a `retry()` re-issues. Views render
plainspoken loading/empty/error (no shimmer, no red), error offers retry.

**Rationale:** One hook centralizes the async + state machine so the two views stay
declarative and testable by mocking `@/lib/api/aggregates` at the module boundary (the
established `test/aggregates.test.ts` pattern). An error in a report view is contained (the
hook resolves to `error`, never throws to the page), so Overview is never broken (FR-013).

## D7 — Mode state placement

**Decision:** `mode: 'overview'|'reports'` is `useState` in `dashboard/page.tsx` (default
`'overview'`). The `ModeSwitch` renders in the mobile stack and is passed as a node into
`DashboardDesktop`. Not persisted to localStorage (session-scoped is enough per spec).

**Rationale:** The page stays mounted across toggles, so `useState` preserves the choice
within the session without a persistence key. Passing the toggle node into the desktop
composition avoids duplicating the composition or lifting the whole grid.

## Known issue surfaced (not fixed here)

`lib/api/aggregates.ts` `OwnerSpendRow.person_id` vs the SQL `household_owner_spend` column
`user_id` is a latent name mismatch. This MVP does not use owner-spend, so it is **avoided,
not introduced**. Flagged in PARITY.md / docs for a future targeted fix.

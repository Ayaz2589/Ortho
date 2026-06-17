# Phase 1 Data Model: Dashboard specific-month picker

No persistent/database entities change. This feature introduces **client view-state** and one **derived value**. All money/aggregation entities are reused unchanged.

## DashboardScope (client view-state)

The dashboard's current time scope. One per surface, single source (web: `useDashboardRange` hook; iOS: `AppState`).

| Field | Type | Persisted? | Notes |
|---|---|---|---|
| `range` | `DashboardRange` (`thisMonth \| last3Months \| last6Months \| last12Months`) | **Yes** (web `localStorage 'dashboardRange'`, iOS `UserDefaults 'dashboardRange'`) | Unchanged from today. |
| `selectedMonth` | `'YYYY-MM' \| null` | **No** (transient, in-memory) | When non-null, overrides `range`. Default `null`. |

**Derived (not stored):**

- `activeInterval: Interval` = `selectedMonth ? monthBounds(selectedMonth) : rangeInterval(range, now)` — half-open `[from, to)`.
- `referenceDate: Date` = `selectedMonth ? monthReferenceDate(selectedMonth) : now` — feeds Budget/Insights.
- `availableMonths: 'YYYY-MM'[]` = `availableMonths(transactions)` — distinct month keys, newest-first.

**Invariants:**

1. `range` and `selectedMonth` are mutually exclusive in effect — `selectedMonth` wins when set; selecting a `range` sets `selectedMonth = null`.
2. `selectedMonth`, if set, is always a member of `availableMonths`.
3. `selectedMonth` is never persisted; a relaunch always yields `selectedMonth = null`.

## availableMonths (derived, vectored)

`availableMonths(transactions): 'YYYY-MM'[]`

- Month key for a transaction = the first 7 chars of its stored ISO `date` string (`'YYYY-MM'`).
- Result = distinct keys, sorted **descending** (newest first).
- Empty input → `[]` (the month control renders nothing/disabled; dashboard falls back to the relative view).
- This is the single piece of new pure date logic and is **golden-vectored** (`shared/test-vectors/dashboard-month-scope.json`).

## Reused, unchanged entities

- `Interval` (`{ start/from, end/to }`, half-open) — web `components/dashboard/range.ts`, iOS `DashboardRange.swift`.
- `monthBounds('YYYY-MM') → Interval` (UTC, half-open) — web `lib/transactionFilters.ts`, iOS `TransactionFilters.swift`; already vectored.
- Aggregations that already accept an arbitrary interval: `spentBy`, `categoryExpenseTotal`, top-merchants/categories, per-owner shares (web `lib/store.tsx`; iOS `AppState`).
- Insight engines that already accept a reference date: web `generateInsights(..., now)`, iOS `InsightEngine(referenceDate:)`.
- `Transaction` — unchanged; only its `date` is read for `availableMonths`.

## State transitions

```
default (selectedMonth = null, range = persisted)
  ── pick month M (from list/stepper) ──▶ selectedMonth = M     (range untouched, inactive)
  ── step prev/next ─────────────────────▶ selectedMonth = adjacent M' in availableMonths (clamped)
  ── tap a relative range chip ──────────▶ selectedMonth = null, range = chosen
  ── tap "Latest" / clear ───────────────▶ selectedMonth = null (range = persisted)
  ── relaunch ───────────────────────────▶ selectedMonth = null (range = persisted)
```

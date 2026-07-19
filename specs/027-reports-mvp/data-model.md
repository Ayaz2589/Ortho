# Data Model: Reports MVP

No database schema changes. All shapes are read-only projections of existing rows via the
household-scoped aggregate RPCs. Money is USD cents until render.

## Source RPCs (existing, reused via `web/lib/api/aggregates.ts`)

| Wrapper | RPC | Returns | Used for |
|---|---|---|---|
| `fetchMonthSummary(hh, start, end)` | `household_month_summary` | `{ income, expense, net }` (cents) | one call per calendar month → savings-rate series |
| `fetchCategoryTotals(hh, start, end)` | `household_category_totals` | `{ category, cents }[]` | category deep-dive |
| `fetchDailyExpense` | `household_daily_expense` | — | **not used** in MVP |
| `fetchOwnerSpend` | `household_owner_spend` | — | **not used** (known `person_id`/`user_id` mismatch) |

Scope is household-wide shared ledger; window is half-open `[start, end)` (matches the TS
`inRange` / SQL convention).

## Derived entities (new, all in `web/lib/reports/*`, pure)

### MonthWindow — `lib/reports/months.ts`
```ts
interface MonthWindow {
  yyyymm: string   // 'YYYY-MM'
  start: Date      // first day of month (inclusive)
  end: Date        // first day of next month (exclusive)
}
// monthsInInterval({start,end}): MonthWindow[]  — the calendar months the window covers,
//   oldest→newest. A single-month range yields one entry. Uses UTC month bounds consistent
//   with monthBounds so it agrees with the dashboard's windowing.
```

### SavingsRateRow — `lib/reports/savings.ts`
```ts
interface SavingsRateRow {
  yyyymm: string
  incomeCents: number
  expenseCents: number
  rate: number | null   // (income − expense) / income; null when income <= 0 → render "—"
}
// savingsRate(incomeCents, expenseCents): number | null
// buildSavingsSeries(windows: MonthWindow[], summaries: MonthSummary[]): SavingsRateRow[]
//   zips month windows with their fetched summaries; a month with no data → {0,0,rate:null}
//   so every window is represented (no gaps).
```

### RankedCategory — `lib/reports/categories.ts`
```ts
interface RankedCategory {
  category: TransactionCategory
  cents: number
  share: number    // cents / totalCents, in [0,1]; 0 when total is 0
}
// rankCategories(rows: CategoryTotalRow[]): RankedCategory[]
//   filters cents>0, sorts by cents desc, computes share of the summed total.
```

## View-model shapes (component-local, not exported domain types)

- **Savings-rate chart datum**: `{ label: string; rate: number }` per month with a non-null
  rate (months with null rate render in the row list but are omitted from / shown as a gap in
  the plotted series — decided in the view, tested).
- **Category legend entry**: `{ label, cents, share, color }` from `RankedCategory` +
  `categoryMeta().tint`/`.label`/`.icon`; optional "Other" bucket beyond the top N (mirrors
  `SpendByCategoryCard`).

## Invariants

- USD cents everywhere internally; `formatMoney` converts to display currency at render only.
- Shares over a non-empty window sum to 1.0 (± rounding).
- `rate` is `null` (⇒ "—") exactly when `income <= 0`; never NaN/Infinity/misleading 0%.
- Windowing is half-open `[start, end)` and month-aligned; every in-scope month appears in the
  savings series.

# Contracts: Reports MVP (component / hook / helper)

These are behavioral contracts each with test-first acceptance. FR/SC refs are to
[../spec.md](../spec.md).

## Pure helpers (`web/lib/reports/*`) — node env

### `monthsInInterval(interval): MonthWindow[]`
- Returns the calendar months covered by `[start, end)`, oldest→newest, each with month-aligned
  `start`/`end` and `yyyymm`.
- `thisMonth` (1-month interval) → exactly one window. A 6-month interval → 6 windows.
- Windows are contiguous and non-overlapping; last window's `end` == interval `end`.
- (FR-003, FR-004; SC-002)

### `savingsRate(incomeCents, expenseCents): number | null`
- `income > 0` → `(income − expense) / income` (may be negative for a shortfall).
- `income <= 0` → `null`. Never NaN/Infinity.
- (FR-004, FR-008; SC-002, SC-005)

### `buildSavingsSeries(windows, summaries): SavingsRateRow[]`
- One row per window in order; each row carries income, expense, and `savingsRate(...)`.
- A window whose summary is `{0,0,0}` → `{incomeCents:0, expenseCents:0, rate:null}` (present,
  not omitted). (FR-004; edge: empty month)

### `rankCategories(rows): RankedCategory[]`
- Drops non-positive cents; sorts by cents desc; `share = cents / total`.
- Empty input or all-zero → `[]`. Shares sum to 1.0 (± rounding) for non-empty input.
- (FR-005; SC-003)

## Hook (`web/lib/useReportsData.ts`) — jsdom, aggregates mocked

### `useReportsData(householdId, interval)`
- On mount / when `interval` changes: computes `monthsInInterval`, then fetches
  `fetchCategoryTotals` (whole window) + `fetchMonthSummary` per month in parallel.
- Exposes `{ status: 'loading' | 'ready' | 'error', savings, categories, retry }`.
- Any rejected fetch → `status:'error'` (never throws); `retry()` re-issues. (FR-009, FR-013)
- No fetch when `householdId` is falsy (renders as empty/loading, never crashes).

## Views (`web/components/dashboard/*`) — jsdom

### `ModeSwitch` (`ModeSwitch.tsx`)
- Two real buttons "Overview" / "Reports"; the active one has `aria-pressed`/`aria-current`;
  keyboard reachable; sand focus ring (token). Calls `onChange(mode)`. (FR-001, Principle V)

### `ReportsView` (`ReportsView.tsx`)
- Renders the range picker (reusing the dashboard `rangeOptions` — only ranges the data spans,
  FR-003), then `SavingsRateView` and `CategoryDeepDiveView`.
- Width capped/centered; correct at 375/800/1440px. (FR-011; SC-007)
- Threads `useReportsData` status → child states.

### `SavingsRateView` (`SavingsRateView.tsx`)
- `ready`: per-month rows (month · income · expense · rate) + dynamic-imported
  `SavingsRateChart`. Negative rate uses sign/label/position, **never** red. `rate===null` →
  "—". Money via `formatMoney`, tabular. (FR-004, FR-007, FR-008, FR-010; SC-002, SC-005)
- `loading`: quiet plainspoken line. `empty` (no months/all-zero window): plainspoken line.
  `error`: plainspoken line + Retry button. No shimmer, no red. (FR-009)

### `CategoryDeepDiveView` (`CategoryDeepDiveView.tsx`)
- `ready`: existing `CategoryPie` donut + ranked legend (icon tint · label · amount · share),
  highest first, shares from `rankCategories`. (FR-005, FR-012; SC-003)
- `loading`/`empty`/`error` as above (empty = no expense in window → plainspoken line, no
  empty chart). (FR-009)

## Integration (`dashboard/page.tsx`, `DashboardDesktop.tsx`)

- `mode` state (default `'overview'`); `ModeSwitch` visible in both mobile and desktop.
- `mode==='reports'` → `<ReportsView>`; `mode==='overview'` → existing mobile stack /
  `DashboardDesktop` unchanged. Switching back leaves Overview exactly as before. (FR-001,
  FR-002, FR-013; SC-001, SC-004)

## Bundle guard (`test/bundle/no-eager-recharts.test.ts`)
- The only new eager-safe recharts importer is `charts/SavingsRateChart.tsx` (reached via
  `next/dynamic`); no eager module imports recharts. (FR-012; SC-006)

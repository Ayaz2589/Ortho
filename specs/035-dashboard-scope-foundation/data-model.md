# Data Model: Dashboard Scope Foundation (Section 0)

No persisted schema changes. This section introduces one in-memory, per-view UI value and no database,
Supabase, or store-collection change.

## DashboardScope (existing, now shared via context)

Produced by `useDashboardScope()` (`web/lib/useDashboardRange.ts`), unchanged by this section — only
lifted into a provider. Shape (abbreviated):

| Field | Type | Meaning |
|---|---|---|
| `range` | `DashboardRange` | Active relative range, clamped to what the data spans. |
| `rangeOptions` | `DashboardRange[]` | Ranges the data spans, for the segmented control. |
| `setRange(r)` | fn | Choose a relative range; clears any selected month. |
| `selectedMonth` | `string \| null` | Selected `'YYYY-MM'`, or null when on the relative range. |
| `availableMonths` | `string[]` | Distinct months in the data, newest-first. |
| `setMonth(m)` / `clearMonth()` | fn | Select / clear a specific month (transient). |
| `interval` | `{ start: Date; end: Date }` | Active window (half-open). |
| `referenceDate` | `Date` | Reference for budget/insight engines. |
| `periodLabel` | `string` | "June 2026" (month) or the range's long label. |
| `isSpecificMonth` | `boolean` | True when a specific month is selected. |

The relative `range` persists in `localStorage['dashboardRange']` (existing behavior); a selected
month is transient (not persisted). Mutual exclusivity: choosing a range clears the month; choosing a
month overrides the range.

## Context

`DashboardScopeContext` holds one `DashboardScope | null`. `null` means "no provider" and is the
signal `useDashboardScopeContext()` uses to throw.

## Widget body files

Presentational only — no data model. Each `bodies/<Name>Body.tsx` renders the shared `Placeholder`
until its data section lands.

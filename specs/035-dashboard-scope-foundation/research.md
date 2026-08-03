# Research: Dashboard Scope Foundation (Section 0)

## Q1 — Where should the shared scope live: store or context?

**Decision: a dedicated `DashboardScopeContext`.** `useDashboardScope()` holds `range`/`selectedMonth`
in local `useState`, so it must be called once and shared or the board desyncs. The global store
(`web/lib/store.tsx`) holds only Supabase-persisted household data and explicit user preferences
(currency, language) and currently holds no pure-UI state; a transient per-view month selection is off
pattern there. A focused context keeps the store lean and the concern local. (Parent-plan decision
D1.)

## Q2 — Are the scope hook and pickers really reusable as-is?

**Yes.** Verified on the base branch:
- `useDashboardScope()` and `MonthPicker` have zero usages outside their own definitions (orphaned
  since spec 034 removed the overview cards).
- `MonthPicker` props `{ availableMonths, selectedMonth, onSelectMonth, onClear }` map 1:1 to the
  hook's `availableMonths`/`selectedMonth`/`setMonth`/`clearMonth`.
- `RangePicker` props `{ options, value, onChange }` map 1:1 to `rangeOptions`/`range`/`setRange`.
- All their `t()` keys ("Pick a month", "Previous/Next month", "Latest", "Select a month", "Month",
  "3M", "6M", "1Y", "This month", "Last 3/6/12 months") already exist in all five catalogs — so this
  section adds no i18n keys.

## Q3 — How to split bodies without colliding with later sections?

**One file per widget under `bodies/`, sharing a single `Placeholder` scaffold.** Keeping the scaffold
in `placeholders.tsx` avoids duplicating the calm filler six times and gives later sections a clean,
exclusive file to edit. Only `registry.tsx` imports the bodies, and it is the one file this section
repoints (never touched again by 036–041). (Parent-plan decision D2.)

## Q4 — O-1: include the relative-range control?

**Yes.** The hook already exposes `rangeOptions`/`setRange`, and multi-month widgets
(`spending-pace`, `net-summary`) read better over ranges. Shipping it now avoids a second pass on the
scope bar. (Parent-plan open question O-1, recommended.)

## Q5 — Keeping existing tests green

Rendering the real overview now mounts the provider, which reads `transactions`/`locale` from the
store. One existing test (`dashboard-mode.test.tsx`) mocked `useApp` with only `{ t }`; its mock is
completed with `transactions: []` and `locale`. The real store always supplies these, so no production
code needs to defend against a missing array.

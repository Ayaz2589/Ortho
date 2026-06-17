# Phase 0 Research: Dashboard specific-month picker

All spec unknowns were resolved with the user during brainstorming (the three shaping decisions) and by the codebase-exploration workflow. This records the load-bearing technical decisions.

## D1 — Selected-month window source of truth

- **Decision**: A selected month resolves to `monthBounds('YYYY-MM')` — the existing half-open UTC `[from, to)` converter already shared web↔iOS and locked by the `month May (half-open)` case in `shared/test-vectors/transaction-filters.json`.
- **Rationale**: It is the only month→window converter that is already paired *and* vectored, so the new feature inherits parity protection with zero new bounds math. The dashboard's interval-driven cards already consume a half-open window.
- **Alternatives considered**: Reuse the dashboard's own `rangeInterval` "thisMonth" math (local calendar, **unvectored**) — rejected: it is anchored to *now* and would re-introduce a local-vs-UTC drift between clients.

## D2 — Month key derivation (`availableMonths`)

- **Decision**: Derive each month key by **string-slicing the stored ISO date** (`tx.date[0..7]` → `'YYYY-MM'`) on *both* surfaces; `availableMonths(transactions)` returns the distinct keys **newest-first**. This becomes a new pure helper and is **golden-vectored** (`dashboard-month-scope.json`).
- **Rationale**: The web Transactions filter already derives months this way (`useTransactionFilters.monthOptions`). Slicing the canonical stored string (not re-bucketing via a local `Calendar`) guarantees iOS and web list the exact same months, including rows near a month boundary. Vectoring it makes the parity machine-checked, satisfying Constitution VI for date logic.
- **Alternatives considered**: iOS deriving the key via `Calendar.current` — rejected (would disagree with web's string slice for boundary timestamps); not vectoring it — rejected (date derivation is exactly the kind of logic the constitution says to lock).

## D3 — Reference date for Budget + Insights when a month is selected

- **Decision**: Define `monthReferenceDate('YYYY-MM')` = the **15th of that month at 12:00 UTC**. Budget uses `monthBounds(selectedMonth)` directly; Insights receive `monthReferenceDate(selectedMonth)` as their reference date (web `generateInsights(..., now)`, iOS `InsightEngine(referenceDate:)`), which both turn into the month-of-`now` window internally.
- **Rationale**: `generateInsights`/`InsightEngine` compute "the month containing the reference date" (and the prior month) using each platform's calendar. Mid-month noon UTC is unambiguously inside the target month in every real time zone, so both platforms land on the selected month and its prior month identically — without having to refactor the engines' internal month math.
- **Alternatives considered**: Pass the month's `from` boundary (00:00 UTC on the 1st) — rejected: a viewer west of UTC would see the prior month locally; mid-month is robust. Refactor the insight engines to take an explicit interval — rejected as out of scope (engines already accept a reference date).

## D4 — Transient vs persisted selection

- **Decision**: `selectedMonth` is **in-memory transient** (web `useState`, iOS `@State`/non-persisted `AppState` property); it is **not** written to `localStorage`/`UserDefaults`. The relative `range` keeps persisting exactly as today. Relaunch → no selected month → persisted relative range.
- **Rationale**: The user chose this (avoid greeting them with a stale past month). Keeps the persisted-range contract untouched and the new state model simple.
- **Alternatives considered**: Persist the selected month — rejected by the user. Persist a discriminated union — rejected (needlessly complicates the existing persisted-range shape).

## D5 — Mutual exclusivity + return path

- **Decision**: `range` and `selectedMonth` are mutually exclusive. Choosing any relative chip sets `selectedMonth = null` (back to anchored-to-now). The month control exposes a clear "back to Latest/relative" affordance that also clears it. Active interval = `selectedMonth ? monthBounds(selectedMonth) : rangeInterval(range, now)`.
- **Rationale**: Two simultaneously-active windows would be ambiguous; one always wins. Matches the approved "complement, with the month overriding until cleared" decision.

## D6 — Web mobile/desktop single source of scope

- **Decision**: Hoist the dashboard scope (`range` + `selectedMonth` + derived `availableMonths` + active interval) into the existing `lib/useDashboardRange.ts` hook (used by both `app/(app)/dashboard/page.tsx` and `components/web/DashboardDesktop.tsx`), instead of the desktop layout re-deriving scope independently.
- **Rationale**: Today the two layouts compute scope separately (`DashboardDesktop.tsx` ~L44–53), so a month picker added to one could silently diverge. One hook = one source = guaranteed lockstep across the breakpoint.
- **Alternatives considered**: Add the state in both files — rejected (drift risk, duplicate logic).

## D7 — Available-month clamping (stepper)

- **Decision**: The prev/next stepper navigates **within** `availableMonths`. "Previous" is disabled when the selection is the earliest available month; "next" is disabled at the latest. `stepMonth(months, current, dir)` returns the adjacent key or `null` at an edge. Unit-tested per surface (trivial index math layered on the vectored `availableMonths`).
- **Rationale**: Prevents stepping into empty months; matches the spec's edge clamping. The risky part (deriving the month set) is vectored; the index walk is cheap and surface-local.

## Open items

None. No NEEDS CLARIFICATION remain.

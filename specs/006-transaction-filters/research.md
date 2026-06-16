# Phase 0 Research: Transaction Filters

All Technical Context items resolved; no open NEEDS CLARIFICATION. Decisions:

## D1 — Parity via one pure function + shared golden vectors
- **Decision**: Implement the filter decision as a pure `filterTransactions(transactions, criteria, ctx)` in TS (`web/lib/transactionFilters.ts`) and Swift (`TransactionFilters.swift`); lock with `shared/test-vectors/transaction-filters.json`. The TS implementation is the source of truth; `web/scripts/gen-vectors.ts` writes the vectors; both suites assert against them (web `*.parity.test.ts`, iOS XCTest).
- **Rationale**: Exactly the mechanism already used for mortgage/insights (`shared/test-vectors/README.md`) — the cheapest way to guarantee the two clients can't diverge (FR-013/14, SC-002). No backend, no shared runtime.
- **Alternatives**: duplicate logic without vectors (drifts); a shared package (the repo deliberately avoids shared TS/Swift runtime code — vectors only).

## D2 — Criteria & context shape (serializable)
- **Decision**:
  - `FilterCriteria { scope: 'all'|'shared'|'personal'; query: string; categories: TransactionCategory[]; kind: 'all'|'expense'|'income'; sources: string[]; owners: string[]; dateFrom: string|null; dateTo: string|null }`.
  - `FilterContext { householdId: string|null; ownerNames: Record<string,string> }` — everything the pure function needs beyond the transaction itself, fully serializable so it goes straight into the vectors.
- **Rationale**: Keeps `filterTransactions` pure and vector-testable (no store/`resolveUser` dependency). `ownerNames` supports the existing search-by-owner-name; `householdId` drives scope.

## D3 — Combination semantics & dates
- **Decision**: AND across dimensions, OR within a multi-select (FR-007). Empty multi-select / `kind:'all'` / null dates = "no constraint." Dates are a **half-open** window: `dateFrom` inclusive, `dateTo` exclusive (`date >= from && date < to`), compared via `Date.getTime()`/`Date` (timezone-stable since app dates are noon-stable). A **month** UI control maps to `dateFrom = startOfMonth, dateTo = startOfNextMonth`; an explicit range sets both directly.
- **Rationale**: Half-open avoids month-boundary double counting (matches the aggregates convention); inclusive-from/exclusive-to is unambiguous. The CLI/import already use noon-stable dates, so boundaries are deterministic for vectors.

## D4 — Search vs owner filter
- **Decision**: The existing **search** stays (substring over merchant, source, category name, and owner *name* via `ctx.ownerNames`). The new **owner filter** is by user *id* (multi-select; a tx passes if any of its `owner_ids` is selected). They're independent dimensions.
- **Rationale**: Search is free-text discovery; owner filter is precise selection. Keeping owner-name search needs the names map (D2); owner *filter* stays id-based and pure.

## D5 — Active count & clear-all
- **Decision**: `activeFilterCount(criteria)` counts each non-default dimension: `scope!=='all'`, `query.trim()!==''`, `categories.length>0`, `kind!=='all'`, `sources.length>0`, `owners.length>0`, `(dateFrom||dateTo)`. **Clear-all** resets to `emptyCriteria()` (scope `all`, empty query, empty multiselects, kind `all`, null dates). The existing per-control clears (search X, scope toggle) still work.
- **Rationale**: One intuitive "N filters active → clear" that covers everything, satisfying FR-008 without surprising partial resets.

## D6 — Option sources
- **Decision**: `availableSources(transactions)` = distinct non-empty `tx.source`, alphabetized (pure helper). **Owner options** come from the UI/store (household members + the current user), not derived purely from transactions — passed into the filter surface. **Category options** = the fixed `SPEND_CATEGORIES` + `income` (from `lib/categories.ts`).
- **Rationale**: Sources are data-driven (only show what exists); owners are membership-driven (you can filter to a member even if they have no rows yet — though typically derived). Categories are the fixed set with existing tints/icons.

## D7 — UI surface per canvas (constitution III)
- **Decision**:
  - **Web desktop (≥1024)**: a "Filters" button (with count badge) opens the existing right **`Drawer`** containing `FilterPanel`; active filters shown as removable chips under the title.
  - **Web compact (<1024)**: the filter surface is an inline panel/sheet reached from a filter button next to search/add; active chips below the header.
  - **iOS**: a filter button opens a **bottom sheet** (`FilterSheet`) with the dimensions; the existing scope pills + `SearchField` are preserved above the list; active chips under the header.
- **Rationale**: Native affordances per canvas (drawer on web, bottom sheet on iOS) per the constitution; reuses `Drawer.tsx`, `Segmented`/`Seg`, `CatTile`, chips — no new design primitives.

## D8 — Refactor of existing inline logic
- **Decision**: Replace the inline `inScope`/`matches`/`months` filtering in `page.tsx` with `filterTransactions(...)`, then `groupByDay`/`groupDaysByMonth` on the result (grouping/totals stay in `lib/format.ts`). A small `useTransactionFilters` hook owns the `FilterCriteria` state + setters + derived option lists, shared by the compact page and `TransactionsDesktop`.
- **Rationale**: Single source of filtering behavior (the pure fn), one criteria shape across both web surfaces, minimal churn to grouping/rendering.

## D9 — iOS verification posture
- **Decision**: Write the Swift function, the SwiftUI `FilterSheet`, the `TransactionsView` integration, and the XCTest parity test (vectors added to the test target's Copy Bundle Resources). Per `shared/test-vectors/README.md`, the iOS suite "ships ready-to-run rather than pre-run" — it's verified by building/running in Xcode (XCTest can't run headless here).
- **Rationale**: Consistent with how the repo already ships iOS parity tests; the TS side + vectors are fully verified in CI/`npm test`, and the Swift mirror is structurally identical and vector-checked in Xcode.

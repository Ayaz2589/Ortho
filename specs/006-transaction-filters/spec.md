# Feature Specification: Transaction Filters (iOS + web)

**Feature Branch**: `006-transaction-filters`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "add filters to the transactions page in web; iOS should already have this done … let's do B [richer filters] … be fully complete so do this for iOS and web."

## Overview

Today the Transactions page (both clients) only narrows activity by **scope** (All / Shared / Personal) and a **free-text search**. This feature adds richer, combinable filters — by **category, kind, source, owner, and date/month** — so a person can actually answer questions like "what did I spend on dining in May?" or "show me Tasnuva's shared charges." The filtering is **identical on iOS and web** (locked by shared golden vectors), is purely a way to view the already-loaded activity (no data changes), and preserves the existing scope toggle and search.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter by category, with a filter surface that combines and clears (Priority: P1)

A person opens Transactions, opens the filter surface, and selects one or more **categories** (e.g. Dining + Coffee). The list immediately narrows to only those categories, still grouped by day/month with correct totals, combining with any active scope or search. A badge shows how many filters are active, and a single action clears them all. If nothing matches, a clear "no transactions match your filters" state appears with a way to clear them.

**Why this priority**: Category is the single most useful budgeting filter and it establishes the whole filtering framework (the filter surface, the combine-with-scope/search behaviour, the active-count badge, clear-all, and the no-results state) that the other dimensions plug into. On its own it's a complete, valuable slice.

**Independent Test**: With a known set of transactions, select two categories and confirm only those appear (grouped/totalled correctly), the active-filter badge reads the right count, clear-all restores the full list, and a category with no matches shows the no-results state. The same selection produces the same visible set on iOS and web.

**Acceptance Scenarios**:

1. **Given** transactions across several categories, **When** the person selects one category, **Then** only that category's transactions are shown, grouped by day/month with totals reflecting the visible set.
2. **Given** a category filter, **When** they select a second category, **Then** transactions in **either** category are shown (OR within the dimension).
3. **Given** active scope and/or search, **When** a category filter is added, **Then** only transactions passing **all** active filters are shown (AND across dimensions).
4. **Given** one or more active filters, **When** the person views the page, **Then** a visible indicator shows the number of active filters and a single control clears them all at once.
5. **Given** a filter combination that matches nothing, **When** applied, **Then** a distinct "no transactions match your filters" state is shown (with a clear-filters action), different from the "no transactions yet" empty state.
6. **Given** the default page load, **When** no filter has been chosen, **Then** the full list shows unfiltered (no behaviour change from today).

---

### User Story 2 - Filter by kind and source (Priority: P2)

The person narrows to **income only** or **expenses only**, and/or to specific **sources/accounts** (e.g. only "Amex Gold" and "TD Bank"). These combine with category, scope, and search.

**Why this priority**: Kind and source are the next most common ways people slice spending (separating income from spend; isolating one card). They reuse the US1 framework.

**Independent Test**: Select "Income" and confirm only income rows show; select two sources and confirm only those sources show; combine kind + category and confirm the AND across dimensions.

**Acceptance Scenarios**:

1. **Given** mixed income and expenses, **When** the person filters kind to "Income", **Then** only income transactions are shown; "Expenses" shows only expenses; "All" shows both.
2. **Given** transactions from several sources, **When** the person selects specific sources, **Then** only transactions whose source is among the selected appear (OR within source); selecting none means all sources.
3. **Given** an active category filter, **When** a source filter is added, **Then** only transactions matching **both** are shown.
4. **Given** the source options, **When** presented, **Then** they reflect the distinct sources actually present in the person's transactions (no empty/irrelevant options).

---

### User Story 3 - Filter by owner and by month/date range (Priority: P3)

The person narrows to transactions owned/shared by specific **people** (household members and themselves), and/or to a **specific month** or **date range**. These combine with all other filters.

**Why this priority**: Owner and date are valuable for shared-household review and period analysis, but less frequent than category/kind/source; they round out completeness.

**Independent Test**: Select an owner and confirm only that person's transactions show; select a month and confirm only that month's transactions show; combine owner + month + category and confirm the AND.

**Acceptance Scenarios**:

1. **Given** shared and personal transactions, **When** the person selects an owner, **Then** only transactions that include that owner appear (OR across selected owners).
2. **Given** transactions across months, **When** the person selects a month, **Then** only transactions dated within that month appear (boundaries inclusive of the month, exclusive of the next).
3. **Given** a from–to date range, **When** set, **Then** only transactions within the range appear.
4. **Given** an active month/range filter, **When** combined with other filters, **Then** the visible set passes all of them; clearing the date filter alone restores the other filters' result.

---

### Edge Cases

- **All filters cleared** returns to the exact pre-feature behaviour (scope + search only).
- **A filter dimension with no available options** (e.g. only one source exists, or no household so one owner) still works and doesn't show a broken/empty control.
- **Empty day/month groups** produced by filtering are dropped (no orphan headers); month/day totals reflect only the visible set.
- **Search + filters together**: the no-results state appears if the combination matches nothing, regardless of which filter caused it.
- **Switching scope** while category/source/owner filters are active re-applies all filters together.
- **Month boundary / timezone**: a transaction on the first/last day of a month lands in the expected month deterministically.
- **A removed/renamed source or owner** that's selected but no longer present simply matches nothing (no crash); clear-all recovers.

## Requirements *(mandatory)*

### Functional Requirements

**Filter dimensions**
- **FR-001**: The Transactions page MUST let the person filter by **category** (multi-select across the app's category set; none selected = all).
- **FR-002**: The page MUST let the person filter by **kind**: expenses, income, or all.
- **FR-003**: The page MUST let the person filter by **source/account** (multi-select across the distinct sources present in their transactions; none selected = all).
- **FR-004**: The page MUST let the person filter by **owner** (multi-select across household members and themselves; none selected = all).
- **FR-005**: The page MUST let the person filter by **month** and/or a **from–to date range** (default = no date restriction).
- **FR-006**: The existing **scope** toggle (All / Shared / Personal) and **free-text search** MUST be preserved and continue to work.

**Combination & behaviour**
- **FR-007**: All active filters MUST combine with **AND** across dimensions; within a multi-select dimension, membership is **OR**.
- **FR-008**: The page MUST show how many filters are active and provide a single **clear-all** that resets every filter (scope and search reset behaviour unchanged from today).
- **FR-009**: When a filter combination matches no transactions, the page MUST show a distinct **"no matches"** state with a clear-filters action, separate from the **"no transactions yet"** state.
- **FR-010**: Filtering MUST operate on the already-loaded transactions only (no new data fetch); applying/removing a filter MUST update the list without a page reload.
- **FR-011**: Day/month grouping, ordering (newest first), and totals MUST continue to work on the **filtered** set (empty groups dropped; totals reflect visible rows).
- **FR-012**: On load, the page MUST be **unfiltered** by default; filters chosen during a session persist while the person stays on the page.

**Cross-platform parity**
- **FR-013**: The filter logic MUST behave **identically on iOS and web** for the same transactions and the same selected criteria.
- **FR-014**: The shared filter behaviour MUST be locked by **golden test vectors** that both clients assert against, so the two implementations cannot diverge.

**Quality / accessibility**
- **FR-015**: The filter controls MUST follow the product's design system (calm, token-based styling) and be fully keyboard-operable with visible focus and AA contrast on web; native, accessible controls on iOS.
- **FR-016**: Every money/date transformation involved in filtering (date-range/month boundaries, totals on the filtered set) MUST be covered by deterministic tests (injected reference dates).

### Key Entities *(include if feature involves data)*

- **Transaction**: the existing record being filtered (category, kind, scope, source, date, amount, owners). Read-only here.
- **Filter criteria**: the current selection — scope, search text, set of categories, kind, set of sources, set of owners, and a date window (month or from–to). The single source of truth for what's shown.
- **Owner / source option**: the selectable values, derived from the transactions actually present (sources) and the household membership (owners).
- **Filtered/grouped result**: the visible transactions after applying criteria, grouped by day/month with per-group totals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can isolate a specific category's spending for a specific month in under 15 seconds from the Transactions page.
- **SC-002**: For any given set of transactions and selected criteria, iOS and web show the **exact same** set of transactions (0 divergence), verified against shared golden vectors.
- **SC-003**: Applying or removing any filter updates the visible list **immediately** (no reload, no fetch).
- **SC-004**: With filters active, the displayed day/month totals equal the sum of the visible transactions (100% consistent).
- **SC-005**: When a combination matches nothing, the person is shown a clear "no matches" message and can recover with one action (clear filters) 100% of the time.
- **SC-006**: All filter/date logic is covered by deterministic tests that pass with each platform's single test command; no parity drift between clients.
- **SC-007**: The feature is **additive** — with all filters cleared, the Transactions page behaves exactly as it did before (scope + search), on both clients.

## Assumptions

- **Client-side only**: filtering runs over the transactions already loaded in the app; no server-side query changes, no pagination changes.
- **Scope of pages**: only the **Transactions** page gains these filters; Dashboard and Housing are unchanged.
- **Category set**: the existing 11 categories; income is its own category and is also reachable via the kind filter.
- **Sources/owners are dynamic**: the available source and owner options come from the person's actual transactions and household, not a fixed list.
- **Session persistence**: filters live for the page session (in memory); persisting them across app restarts / as saved presets is out of scope.
- **Date model**: dates are timezone-stable (stored at noon, consistent with the rest of the app), so month/range boundaries are deterministic.
- **Parity mechanism**: the same shared-golden-vector approach already used for mortgage and insight math is reused for the filter function.
- **No new sort options**: ordering remains newest-first; only filtering is added.
- **The existing scope toggle and search remain** and simply become part of the combined filter set.

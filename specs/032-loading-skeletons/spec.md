# Feature Specification: Content-shaped loading skeletons

**Feature Branch**: `032-loading-skeletons`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "currently when data is being fetched we just see 'loading'. lets add loading skeletons instead. lets use shadcn skeleton. for pages using tables or dynamic data keep track of the data count from previous fetch so we can display the current size of the skeleton."

## Overview

While Ortho fetches data, it currently shows a single centered "Loading…" line for the
whole shell (and again inside the Reports views). This is a jarring layout jump: the screen
shows one small centered string, then abruptly snaps to a full, dense page of content. The
feature replaces those "Loading…" strings with **calm placeholder skeletons that match the
shape of the content about to appear**, and — for list/table screens — sizes those skeletons
to the number of items the user saw last time, so the placeholder is roughly the height of
the content that is coming.

## Clarifications

### Session 2026-07-27

- Q: The constitution (Principle IV) says loading states have "no skeleton shimmer" and
  Principle II mandates calm, no gradients/patterns. Does adding skeletons violate this? →
  A: No. The prohibition is on the animated *shimmer* effect, not on placeholder blocks.
  Skeletons are rendered as **static, calm placeholder blocks** in the existing surface/
  hairline tokens with **no shimmer, no gradient sweep, and no pulse by default**. This keeps
  the feature within the constitution while still replacing the bare "Loading…" text. (If any
  motion is ever added it must be disabled under `prefers-reduced-motion` — but the default is
  motionless.)
- Q: Which count is remembered for sizing, and where does it live? → A: The count of items
  from the **previous successful load** of each list/table collection, persisted in the
  browser (localStorage) so it survives reloads, per collection (transactions, goals, budgets,
  housing/properties, tags, reports rows).
- Q: What is shown on the very first load with no remembered count? → A: A small sensible
  default number of skeleton rows/cards per surface, and the count is recorded after the first
  successful load so subsequent loads are correctly sized.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Whole-app first paint shows a shaped skeleton, not a bare "Loading…" (Priority: P1)

When someone opens the app (or reloads a route) and the data layer is still bootstrapping,
they see a skeleton that resembles the page they are about to land on — dashboard cards,
a transactions ledger, housing cards, budgets rows, goals cards, or settings sections —
instead of a single centered "Loading…" string. When data arrives, the skeleton is replaced
by the real content in the same layout, with no jarring jump from a tiny centered string to
a full page.

**Why this priority**: This is the loading state the user sees on essentially every launch and
every hard refresh; it is the single highest-impact surface and delivers the core value on its
own. Shipping only this story already replaces the most-seen "Loading…" in the app.

**Independent Test**: Force the data layer into its loading state and navigate to each of the
core routes; confirm each shows a route-appropriate skeleton (not the "Loading…" string), and
that once data resolves the skeleton is replaced by real content in the same shape.

**Acceptance Scenarios**:

1. **Given** the app is bootstrapping its data, **When** the user is on the Dashboard route,
   **Then** a skeleton shaped like the dashboard (summary + cards) is shown in place of
   "Loading…".
2. **Given** the app is bootstrapping its data, **When** the user is on the Transactions route,
   **Then** a skeleton shaped like the ledger (a list of transaction-row placeholders) is shown.
3. **Given** the app is bootstrapping its data, **When** the user is on Housing / Budgets /
   Goals / Settings, **Then** each shows a skeleton matching that page's real layout shape.
4. **Given** a skeleton is showing, **When** the data finishes loading, **Then** the real
   content replaces the skeleton in the same layout region without a layout jump to a centered
   string.
5. **Given** the user has `prefers-reduced-motion` enabled, **When** any skeleton is shown,
   **Then** no motion is presented (skeletons are motionless by default regardless).

---

### User Story 2 - List/table skeletons are sized to what the user saw last time (Priority: P2)

For screens that render a list or table of dynamic data, the number of placeholder rows/cards
shown while loading approximates the number of items present at the end of the previous
successful load. A user whose ledger had ~40 rows last session sees a tall ledger skeleton;
a user with 3 goals sees a short goals skeleton. The remembered size persists across reloads.

**Why this priority**: This is the differentiating refinement the user explicitly asked for —
it makes the skeleton feel like *their* data loading, and minimizes the layout shift when
content arrives. It builds on Story 1's shapes.

**Independent Test**: Load a list screen with a known number of items so the count is recorded;
reload with the data layer held in its loading state; confirm the skeleton renders
approximately that many placeholder rows (within the cap), not a generic fixed number.

**Acceptance Scenarios**:

1. **Given** a previous successful load recorded N transactions, **When** the Transactions
   screen is loading again, **Then** approximately N ledger-row skeletons are shown (bounded by
   a sensible maximum).
2. **Given** no count has ever been recorded for a collection (first-ever load), **When** that
   screen is loading, **Then** a small default number of placeholder rows/cards is shown.
3. **Given** a collection's item count changes between loads, **When** the screen loads again,
   **Then** the skeleton reflects the most recent recorded count.
4. **Given** a recorded count is very large, **When** the screen loads, **Then** the number of
   skeleton rows is capped so the placeholder never becomes absurdly long or hurts performance.
5. **Given** a collection is now empty (recorded count 0), **When** the screen loads, **Then**
   the skeleton shows at least a minimal placeholder rather than nothing (avoiding a blank
   screen mid-load).

---

### User Story 3 - Reports and other async views show shaped skeletons (Priority: P3)

The Reports-mode views (savings rate, category deep-dive) and any other view that fetches
asynchronously after the initial bootstrap show a chart/table-shaped skeleton while their data
loads, instead of the inline "Loading…" text, and fall back to their existing error/empty
states unchanged.

**Why this priority**: These are secondary surfaces reached only after opening Reports; valuable
for consistency but lower traffic than the shell and lists. Error and empty states must remain
exactly as they are.

**Independent Test**: Open a Reports view with its data source held in the loading state and
confirm a chart/table-shaped skeleton appears instead of "Loading…"; then drive it to error and
empty states and confirm those are unchanged.

**Acceptance Scenarios**:

1. **Given** a Reports view is fetching, **When** it is in its loading state, **Then** a
   skeleton shaped like that view (chart area / rows) replaces the "Loading…" text.
2. **Given** a Reports view finishes with an error, **When** it renders, **Then** the existing
   error state (with retry) is shown, not a skeleton.
3. **Given** a Reports view finishes with no activity, **When** it renders, **Then** the
   existing empty-state copy is shown, not a skeleton.

---

### Edge Cases

- **Bootstrap failure**: If the initial load fails, the existing error banner + Retry path is
  preserved; the skeleton is not left on screen indefinitely masking the failure.
- **Route unknown to the skeleton map**: If a route has no bespoke skeleton shape, a generic
  calm skeleton (or the page's simplest shape) is shown rather than falling back to "Loading…".
- **Very fast loads**: If data resolves almost immediately, the skeleton may flash briefly;
  this is acceptable and must not cause a layout jump when replaced.
- **Corrupt/absent remembered count**: If the stored count is missing, non-numeric, negative, or
  otherwise invalid, the default count is used and no error surfaces to the user.
- **Storage unavailable** (private mode / disabled storage): Skeleton sizing falls back to the
  default count silently; no functionality breaks.
- **Paywall / locked states**: The paywall gate and biometric lock continue to take precedence
  over the content skeleton (a lapsed entitlement or locked app is not hidden behind a skeleton).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace the whole-shell "Loading…" text shown during data
  bootstrap with a skeleton whose shape matches the current route's real layout.
- **FR-002**: The system MUST provide route-appropriate skeleton shapes for each core surface:
  Dashboard, Transactions, Housing, Budgets, Goals, and Settings.
- **FR-003**: For list/table surfaces, the system MUST size the skeleton (number of placeholder
  rows/cards) from the item count recorded at the end of the previous successful load of that
  collection.
- **FR-004**: The system MUST persist each list/table collection's last successful item count in
  the browser so it survives reloads and future sessions.
- **FR-005**: The system MUST record/refresh a collection's item count after each successful
  load so the next skeleton is sized from current data.
- **FR-006**: On the first-ever load of a collection (no recorded count), the system MUST show a
  small sensible default number of placeholder rows/cards.
- **FR-007**: The system MUST cap the number of skeleton rows/cards at a sensible maximum so a
  very large recorded count never produces an excessively long placeholder or a performance
  problem.
- **FR-008**: The system MUST render skeletons as calm, static placeholder blocks using existing
  design tokens — no shimmer, no gradient sweep, and no pulse animation by default (constitution
  Principle IV: "no skeleton shimmer"). Any future motion MUST be disabled under
  `prefers-reduced-motion`.
- **FR-009**: The system MUST replace a skeleton with the real content in the same layout region
  when data resolves, without introducing a layout jump to a centered string.
- **FR-010**: The system MUST replace the Reports-mode inline "Loading…" text (savings rate,
  category deep-dive) with a chart/table-shaped skeleton, while leaving those views' existing
  error and empty states unchanged.
- **FR-011**: The system MUST preserve existing bootstrap-failure behavior (error banner +
  Retry) and MUST NOT leave a skeleton masking a failed or lapsed/locked state.
- **FR-012**: Skeleton placeholders MUST be non-interactive and MUST NOT expose false controls
  (no clickable rows, no focusable elements standing in for real content), and MUST convey a
  busy/loading status to assistive technology.
- **FR-013**: Recorded counts MUST be validated on read; invalid/missing/corrupt values MUST
  fall back to the default count without surfacing an error.

### Key Entities *(include if feature involves data)*

- **Skeleton placeholder**: A calm, static, non-interactive visual block that stands in for a
  piece of real content (a line of text, a card, a ledger row, a chart area) using existing
  surface/hairline tokens.
- **Remembered collection count**: A small persisted record, per list/table collection
  (transactions, goals, budgets, housing/properties, tags, reports rows), of the number of items
  present at the end of the last successful load; used to size that collection's skeleton and
  bounded by a maximum.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every core route, when data is loading, the user sees a skeleton matching that
  page's shape — the bare "Loading…" string no longer appears on any core route (0 occurrences
  across Dashboard, Transactions, Housing, Budgets, Goals, Settings, and Reports views).
- **SC-002**: For a returning user, the loading skeleton for a list/table screen renders a number
  of placeholder rows within ±1 of the previously recorded item count (up to the cap), so the
  placeholder height closely approximates the incoming content.
- **SC-003**: When content replaces a skeleton, there is no visible jump from a small centered
  string to a full page — the skeleton and the real content occupy the same layout region.
- **SC-004**: No skeleton presents motion by default; with `prefers-reduced-motion` enabled,
  there is no motion anywhere in the loading experience.
- **SC-005**: Loading, error, and empty states remain distinct: error and empty states are
  unchanged from today, and a failed bootstrap is never hidden behind a persistent skeleton.
- **SC-006**: The feature adds no measurable regression to initial-load performance and does not
  increase the eager (initial) bundle in a way that violates existing bundle discipline.

## Assumptions

- **"shadcn skeleton" means the pattern, adapted to Ortho's tokens** — a reusable Skeleton
  primitive with the same role as shadcn's component, but restyled to the closed token palette
  and made motionless to satisfy the constitution's "no skeleton shimmer" rule. The literal
  shadcn CSS (`bg-muted`, `animate-pulse`) is not used verbatim.
- **The data layer loads all core data in one bootstrap pass**, so the shell-level loading flag is
  the primary loading signal for the core routes; there is no per-route network fetch after
  bootstrap except the Reports views (and any future async views), which own their own loading
  state.
- **Remembered counts are a UX nicety, not a source of truth** — they only size a placeholder and
  never affect real data; being slightly stale or wrong only changes the placeholder height.
- **localStorage is the persistence mechanism** for remembered counts, consistent with how other
  small client preferences are already stored; counts are namespaced with the app's existing key
  conventions.
- **Reports error/empty states are out of scope to change** — only their "Loading…" state becomes
  a skeleton.
- **The frozen native iOS Swift app is out of scope**; this is web/Capacitor-shell work in the
  single canonical `web/` codebase.

# Feature Specification: Desktop Layout

**Feature Branch**: `001-desktop-layout`

**Created**: 2026-06-11

**Status**: Implemented (Phase A + B) — pending visual review

**Input**: User description: "Create a desktop layout for the web app. Currently the mobile view is used on desktop. The desktop view should be fully optimized for any desktop width, all the way to ultrawide. Follow the `ortho-web` skill."

## Overview

The Ortho web app today renders the mobile view at every width: a single
`max-w-lg` column with a bottom tab bar. On a desktop or ultrawide monitor this
wastes the canvas and reads as a blown-up phone. This feature adds a responsive
desktop experience — left sidebar navigation, capped/centered content, and
master–detail layouts — while preserving the existing mobile view below 640px.
It is additive: same product, bigger canvas, no redesign of the visual language.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Desktop navigation via a sidebar (Priority: P1)

A user opens Ortho on a laptop or desktop. Instead of a bottom tab bar floating
over a narrow column, they see a left sidebar with the four destinations
(Dashboard, Transactions, Housing, Settings), the Ortho wordmark, and household
context at the bottom. Only the content area scrolls.

**Why this priority**: The sidebar is the structural backbone of the desktop
experience; every other story renders inside the content area it frames. Without
it, the app still looks like a phone.

**Independent Test**: Resize the viewport to ≥1024px — the bottom tab bar is
replaced by a full sidebar (icon + label) with the active destination marked;
navigating updates `aria-current` and only the content column scrolls. At
640–1023px the sidebar collapses to an icon rail. Below 640px the bottom tab bar
returns unchanged.

**Acceptance Scenarios**:

1. **Given** a viewport ≥1024px, **When** the app loads, **Then** a ~240px left
   sidebar shows wordmark, four labeled nav items (active item highlighted),
   and household context; no bottom tab bar is shown.
2. **Given** a viewport 640–1023px, **When** the app loads, **Then** the sidebar
   is a ~72px icon-only rail with labels available on hover; no bottom tab bar.
3. **Given** a viewport <640px, **When** the app loads, **Then** the existing
   bottom tab bar and single-column mobile view render unchanged.
4. **Given** any desktop width, **When** the user clicks a nav item, **Then** the
   route changes, the active item updates (`aria-current="page"`), and the
   sidebar stays fixed while the content scrolls.

### User Story 2 - Content that breathes, capped at every width (Priority: P1)

A user on an ultrawide monitor sees content that stays readable — lists and forms
are centered and width-capped, the dashboard is a tidy grid, and empty margins
are allowed to remain empty rather than stretched full-bleed.

**Why this priority**: The core failure mode is an unreadable, full-bleed
"terminal." Capping width is what makes the desktop view *calm* and is required
for every screen regardless of master–detail.

**Independent Test**: At 2560px wide, no transaction row, form, or card spans the
full viewport; reading screens cap ≤560px, the dashboard grid caps ≤1080px, and
content is centered with generous gutters.

**Acceptance Scenarios**:

1. **Given** an ultrawide viewport, **When** viewing Settings, **Then** the
   reading column is ≤560px and centered.
2. **Given** an ultrawide viewport, **When** viewing the Dashboard, **Then**
   widget cards form a responsive grid (`minmax(300px, 1fr)`, 16px gap) capped at
   ≤1080px and centered.
3. **Given** any expanded width, **When** content is shorter than the viewport,
   **Then** surrounding margin is empty (not stretched) and gutters are ≥40px.

### User Story 3 - Master–detail for Transactions & Housing (Priority: P2)

On wide screens, selecting a transaction shows its detail beside the list rather
than navigating away; with multiple properties, selecting one shows its detail
beside the property list. On compact screens the same screens stay single-column
and use modals/drawers.

**Why this priority**: Master–detail is the signature desktop interaction that
removes full-page navigations, but it depends on Stories 1–2 being in place and a
single-column fallback already exists, so it ranks below them.

**Independent Test**: At ≥1024px on Transactions, the activity list occupies a
left pane (~380–440px) and a selected transaction's detail fills a right pane
(≤720px); with nothing selected the detail pane shows a quiet prompt. Below
1024px the list is full-width and detail opens as a modal/drawer.

**Acceptance Scenarios**:

1. **Given** Transactions at ≥1024px, **When** the user clicks a row, **Then**
   the transaction detail renders in the right pane (no route change/modal), and
   the selected row is visibly marked.
2. **Given** Transactions at ≥1024px with nothing selected, **When** the screen
   loads, **Then** the detail pane shows a quiet "Select a transaction" prompt.
3. **Given** Housing at ≥1024px with multiple properties, **When** the user picks
   a property, **Then** its detail renders in the right pane; with a single
   property, the detail fills the reading column with no list pane.
4. **Given** any of these screens <1024px, **When** used, **Then** behavior
   matches today's mobile flow (full-width list; detail in a modal/drawer).

### User Story 4 - Real pointer & keyboard interaction states (Priority: P2)

A desktop user gets hover feedback on rows, nav items, and cards; a visible sand
focus ring when tabbing; and pointer cursors on clickable elements — with motion
kept minimal and reduced-motion respected.

**Why this priority**: Desktop is pointer + keyboard first; without hover/focus
the UI feels inert and fails accessibility. It layers onto the structure from
Stories 1–3.

**Independent Test**: Hovering a transaction row or nav item lifts its background
(`rgba(text,0.04)`); pressing shows `0.08`; tabbing through controls shows a
`1.5px var(--accent)` focus-visible ring on each; `prefers-reduced-motion`
removes transitions.

**Acceptance Scenarios**:

1. **Given** a pointer device, **When** hovering an interactive row/nav item/card,
   **Then** its background lifts to `rgba(text,0.04)` and the cursor is a pointer.
2. **Given** keyboard navigation, **When** focusing any interactive element,
   **Then** a visible sand focus-visible ring appears, in DOM order.
3. **Given** `prefers-reduced-motion: reduce`, **When** interacting, **Then**
   the 150ms transitions are dropped to instant.

### Edge Cases

- **Viewport resize across breakpoints** while a transaction is selected or a
  modal is open: state should survive or degrade gracefully (selected item is
  retained; an open modal stays usable or closes cleanly).
- **Empty data** (new user, zero transactions/properties): master–detail shows
  the list empty-state and a quiet detail prompt; no broken split panes.
- **Single property**: Housing skips the list pane entirely.
- **Very long merchant/property names**: truncate within the capped pane widths;
  never force horizontal scroll.
- **Selected item deleted**: detail pane reverts to the empty prompt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST present a left sidebar as primary navigation at ≥1024px
  (full icon+label, ~240px), an icon rail at 640–1023px (~72px), and the existing
  bottom tab bar at <640px — covering the same four destinations.
- **FR-002**: The active destination MUST be visually marked and expose
  `aria-current="page"`; nav MUST use semantic `<nav>`/`<a>`/`<button>` elements.
- **FR-003**: Only the content area MUST scroll on desktop; the sidebar stays
  fixed; sticky day headers stick within the content pane.
- **FR-004**: Content MUST be width-capped and centered at all widths: reading
  column ≤560px, dashboard grid ≤1080px, list pane ~380–440px, detail pane ≤720px;
  surrounding margins remain empty (no full-bleed stretch).
- **FR-005**: Transactions MUST use master–detail at ≥1024px (list pane + detail
  pane, selectable rows, quiet empty prompt) and single-column + modal/drawer
  below 1024px.
- **FR-006**: Housing MUST use master–detail at ≥1024px when >1 property exists,
  and show the single property's detail in the reading column otherwise.
- **FR-007**: Settings MUST render as a centered reading column with no detail
  pane; sub-screens open as modal/drawer.
- **FR-008**: All interactive elements MUST have hover (`rgba(text,0.04)`), active
  (`rgba(text,0.08)`), and a `1.5px var(--accent)` focus-visible state, with a
  pointer cursor; transitions ~150ms ease-out, dropped under reduced-motion.
- **FR-009**: The mobile experience (<640px) MUST remain visually and behaviorally
  unchanged from today.
- **FR-010**: All new styling MUST use existing design tokens only — no new colors,
  no borders heavier than `0.5px`, no shadows on inset cards, no shrunk type
  (titles MAY grow to 36–40px as hero headers; body ≥14px; tabular figures).
- **FR-011**: Light and dark themes MUST both be correct at every breakpoint.
- **FR-012**: Create/edit flows MUST remain centered modals; contextual detail MAY
  use a right-side drawer; Esc/scrim close, focus trapped while open, focus
  returns to trigger on close.

### Key Entities

- **Navigation destination**: one of Dashboard, Transactions, Housing, Settings —
  label, icon, route, active state. Unchanged set from mobile.
- **Selection (master–detail)**: the currently selected transaction or property id
  driving the detail pane; nullable (empty prompt) and reset when the item is
  deleted.
- **Breakpoint mode**: compact (<640), medium (640–1023), expanded (≥1024) —
  derived from viewport width, governs layout shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At ≥1024px, primary navigation is a left sidebar (not a bottom bar)
  on 100% of the four screens, with the active item marked.
- **SC-002**: At 2560px, no transaction row, form, or widget card spans more than
  its capped width; reading screens ≤560px, dashboard grid ≤1080px.
- **SC-003**: On Transactions/Housing at ≥1024px, selecting an item shows its
  detail beside the list with zero full-page navigations.
- **SC-004**: 100% of interactive elements show a visible keyboard focus ring and
  a hover state; the app is fully operable by keyboard in DOM order.
- **SC-005**: The <640px mobile view is pixel-unchanged from before this feature
  (verified by comparison on a phone-width viewport).
- **SC-006**: Light and dark themes render correctly at compact, medium, and
  expanded widths with tokens only (no hardcoded colors introduced).

## Assumptions

- The four destinations, data model, store API, and existing components are
  reused as-is; this is a layout/navigation layer, not a data change.
- Master–detail is the chosen desktop pattern for Transactions and Housing
  (per `ortho-web` skill §5); Settings stays single-column.
- Density stays "Comfortable" by default; a density toggle is out of scope here.
- Full content localization remains out of scope (formatting locale only), as in
  the current build.
- The reused `Modal` primitive is acceptable for create/edit; a right-drawer is a
  nice-to-have and may be deferred if a detail pane covers the need.

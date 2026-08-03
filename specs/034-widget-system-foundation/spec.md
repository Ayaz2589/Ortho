# Feature Specification: Dashboard Widget System (Foundation)

**Feature Branch**: `034-widget-system-foundation`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Rebuild the web dashboard's widget system from the ground up. Remove the existing hand-composed dashboard cards and the separate mobile/desktop compositions, replacing them with a single declarative widget framework: a registry of widgets (id, name, description, size), a responsive board that packs widgets with no dead space on mobile and desktop, per-widget on/off toggles in a Settings menu that persist per browser, and widgets that fill their cell with no whitespace or ghost gaps. Don't worry about the real data the widgets display — placeholder content only; this builds the foundations. Honor the Ortho design constitution and be test-driven."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a gap-free dashboard on any screen (Priority: P1)

A household member opens the Dashboard on their phone and later on a desktop monitor. In both
cases the dashboard is a board of widgets that fill the available width tightly: every widget is
filled edge to edge with content, and there are no empty holes between widgets or awkward stretches
of blank space at the bottom of a widget. The board reflows to the screen — a single column on a
phone, multiple columns on desktop — without any widget being clipped, orphaned, or leaving a
ragged gap.

**Why this priority**: This is the core promise of the redesign — a widget board that "works and
looks well on both desktop and mobile" with "no dead space within a widget or outside of it." Every
other capability builds on the board existing and packing cleanly.

**Independent Test**: Load the Dashboard at a compact (phone) width and at an expanded (desktop)
width with the default set of widgets enabled. Verify each enabled widget renders, fills its cell
(no visible internal whitespace band), and that the board leaves no empty grid cells between
widgets. This delivers a usable, calm dashboard on its own.

**Acceptance Scenarios**:

1. **Given** the default widgets are enabled, **When** the Dashboard renders at desktop width,
   **Then** the widgets are arranged in a multi-column board and no grid cell is left empty between
   widgets (dense packing).
2. **Given** the default widgets are enabled, **When** the Dashboard renders at phone width,
   **Then** the widgets stack in a single readable column, each full-width, with consistent gaps and
   no horizontal overflow.
3. **Given** any single widget, **When** it renders, **Then** its content fills the widget's box
   with no fixed-height well that leaves a blank band and no collapse to a near-zero height.

---

### User Story 2 - Turn individual widgets on and off (Priority: P1)

A member wants a calmer, shorter dashboard. They open a Settings screen that lists every available
widget with its name and a one-line description and an on/off control. They turn some widgets off
and turn one back on. Returning to the Dashboard, only the enabled widgets appear, and the board
re-packs so there is still no dead space. When they reopen the app later (same browser), their
choices are remembered.

**Why this priority**: "Individual widgets should be toggleable on and off from a menu screen" is an
explicit, first-class requirement. Persistence is what makes the toggles meaningful across sessions.

**Independent Test**: On the widget Settings screen, toggle a widget off; confirm it disappears from
the Dashboard and the board re-packs with no gap; reload the page and confirm the widget is still
off. Toggle it back on and confirm it reappears.

**Acceptance Scenarios**:

1. **Given** the widget Settings screen, **When** a member turns a widget off, **Then** that widget
   no longer appears on the Dashboard and the remaining widgets re-pack densely.
2. **Given** a member has turned widgets off, **When** they reload the app in the same browser,
   **Then** the same widgets are still off.
3. **Given** every widget has been turned off, **When** the member opens the Dashboard, **Then** a
   calm empty state explains the board is empty and points to the Settings screen to turn widgets
   back on (no blank page, no error).
4. **Given** the stored preferences are missing or unreadable, **When** the Dashboard loads,
   **Then** the default set of widgets is shown (safe fallback, never a crash).

---

### User Story 3 - Add a new widget with one declaration (Priority: P2)

A developer extends the dashboard by declaring one new widget — a stable id, a display name, a
description, a size footprint, and a render body — in a single registry entry. The new widget
automatically appears in the Settings list (toggleable) and, when enabled, on the board in a cell
matching its declared size, packed with the others. No layout code, no separate mobile and desktop
composition, and no settings wiring need to be touched.

**Why this priority**: The value of a "widget system" over hand-composed cards is extensibility from
one source of truth. It is P2 because it serves maintainers rather than end users directly, but it
is the reason to build a framework instead of another fixed layout.

**Independent Test**: Add a registry entry for a throwaway widget and confirm it shows up in the
Settings list and on the board (when enabled) without editing the board or settings components.

**Acceptance Scenarios**:

1. **Given** a new widget declaration in the registry, **When** the app renders, **Then** the widget
   appears in the Settings list and (if enabled) on the board at its declared size.
2. **Given** two widgets declare different size footprints, **When** the board renders on desktop,
   **Then** each occupies a cell matching its footprint and they still pack with no empty cells.

---

### Edge Cases

- **Board with one widget**: a single enabled widget fills the row cleanly at every width without a
  lonely narrow column or trailing blank columns.
- **All widgets off**: the Dashboard shows a calm, non-alarmist empty state, not a blank canvas.
- **Odd number of widgets / mixed sizes**: the last row never leaves a visible hole; the packing
  backfills gaps so the board reads as a solid block.
- **Unknown stored id**: a preference referencing a widget id that no longer exists is ignored
  without error; a newly added widget with no stored preference falls back to its declared default.
- **Very wide monitor**: the board is width-capped and centered per the responsive contract; it does
  not stretch widgets across an ultrawide screen.
- **Resize across the breakpoint**: moving from phone to desktop width (or back) re-lays-out the same
  enabled widgets without losing the enabled/disabled selection.
- **Reduced motion**: any enter/leave transition respects `prefers-reduced-motion`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Dashboard overview MUST be composed from a widget board rather than hand-arranged
  per-screen card lists. The previous overview cards and the separate mobile/desktop overview
  compositions MUST be removed.
- **FR-002**: The system MUST provide a single widget registry as the one source of truth. Each
  widget declaration MUST include a stable id, a display name, a short description, a size footprint,
  a default enabled state, and a render body.
- **FR-003**: The board MUST render only the enabled widgets and MUST pack them so that there is no
  empty cell between widgets and no ragged trailing gap (dense packing), at every supported width.
- **FR-004**: Each widget MUST fill its allocated cell completely — no fixed-height content well that
  leaves a blank band, and no widget that collapses to a near-zero height and leaves a ghost gap. A
  widget with little content MUST still present a complete, filled box (e.g. via a purposeful
  placeholder), never a hollow one.
- **FR-005**: The board MUST be responsive from a single-column stack on compact (phone) widths to a
  multi-column layout on expanded (desktop) widths, using one composition (no separate desktop-only
  layout file), and MUST cap and center its width per the responsive contract.
- **FR-006**: Members MUST be able to turn each widget on or off individually from a Settings menu
  screen that lists every widget with its name and description and its current on/off state.
- **FR-007**: The system MUST persist each member's enabled/disabled choices per browser and restore
  them on the next load. Missing, partial, or corrupt stored preferences MUST fall back to the
  declared defaults without error.
- **FR-008**: A newly declared widget MUST automatically appear in the Settings list and, when
  enabled, on the board — without changes to the board or settings screens.
- **FR-009**: When no widgets are enabled, the Dashboard MUST show a calm empty state directing the
  member to the Settings screen, never a blank page or an error.
- **FR-010**: All widget and board visuals MUST use only the existing design tokens (color, type,
  spacing, radius, motion). Inset widget cards carry no shadow; separators are hairlines; the only
  accents are sage (incoming money) and sand (focus/links); loss/cost is never red.
- **FR-011**: Every interactive control (the on/off toggles, any widget affordance) MUST be a real
  semantic control, keyboard reachable in DOM order, with a visible focus ring and a hit target of at
  least the platform minimum; contrast MUST meet AA.
- **FR-012**: The Settings widget screen MUST be reachable from the existing Settings navigation on
  both mobile and desktop.

### Key Entities

- **Widget definition**: the static description of a widget — stable id, display name, description,
  size footprint (a small closed vocabulary of cell sizes), default enabled state, and its render
  body. Lives in the registry; is the single source of truth.
- **Widget preferences**: the per-browser record of which widget ids are enabled or disabled.
  Defaults to each widget's declared default when no stored value exists.
- **Widget board**: the responsive arrangement of the enabled widgets into a densely packed,
  width-capped grid that is identical in composition across mobile and desktop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At both a representative phone width and a representative desktop width, with the
  default widgets enabled, the board renders every enabled widget with zero empty grid cells between
  widgets and no widget clipped or overflowing the viewport horizontally.
- **SC-002**: Every widget fills its cell — no widget renders a blank vertical band greater than the
  standard gap, and no enabled widget collapses to a height that leaves a visible hole in the board.
- **SC-003**: A member can turn any widget off and it disappears from the board on the next render;
  turning it back on restores it — verified for every widget in the registry.
- **SC-004**: After changing which widgets are enabled and reloading in the same browser, the member
  sees exactly the widgets they left enabled (persistence holds across reloads).
- **SC-005**: Adding one registry entry causes the widget to appear in the Settings list and on the
  board without edits to the board or settings components (verified by test).
- **SC-006**: With every widget disabled, the Dashboard shows a calm empty state and no error.
- **SC-007**: The full test suite (`npm test`) and typecheck pass, and the widget UI introduces no
  hardcoded colors or non-token styling (design-token compliance holds).

## Assumptions

- "Both desktop and mobile" refers to the web app across its responsive breakpoints (compact,
  medium, expanded). The Capacitor iOS shell ships the same web board; there is no separate native
  widget surface in scope.
- This feature builds the **foundations** only: widgets render calm placeholder content, not live
  household data. Wiring real finance data into individual widgets is explicitly out of scope and is
  future work layered on top of this framework.
- The Reports mode on the Dashboard (a distinct analytical surface reached from the Dashboard) is a
  separate subsystem and is preserved as-is; this feature replaces the Overview composition only.
- Preferences are stored per browser (the established client-preference pattern), not synced to the
  server account. Cross-device sync of widget choices is out of scope.
- The set of widgets shipped in this foundation is a small, representative set (placeholder widgets
  spanning the available size footprints) sufficient to prove the framework; their specific number
  and names are an implementation detail chosen to exercise the registry and packing.
- The four preserved destinations (Dashboard, Transactions, Housing, Settings) are unchanged; the
  widget Settings screen is added under the existing Settings section.

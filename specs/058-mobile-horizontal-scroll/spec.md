# Feature Specification: No Horizontal Scrolling on Mobile

**Feature Branch**: `fix/058-mobile-horizontal-scroll`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "On mobile, when we click the UI widget and the extra page opens up, there is horizontal scroll. We don't want horizontal scroll anywhere on mobile. Look for horizontal scrolls throughout the entire application and then fix them."

## Overview

On a phone, opening a dashboard widget's detail panel let the panel drag sideways. The
reported symptom was one screen, but the audit behind this spec found the same defect class
in six places, including the **app shell itself** — which means it was reachable from every
route, not just the panels.

The defect class is a single CSS behaviour, applied by accident in several places:

> Per CSS Overflow 3, when one axis is set to something other than `visible`/`clip` and the
> other is left at its initial `visible`, that `visible` **computes to `auto`**. So an
> element written as "scrolls vertically" (`overflow-y: auto` alone) silently becomes
> **horizontally scrollable too**.

Paired with the second cause — flex items defaulting to `min-width: auto`, so they refuse to
shrink below their content — any single wide descendant (a long merchant name, a currency
column, a dot positioned at the end of a track) turned into a sideways pan.

This is a correctness fix, not a redesign. Nothing changes visually on a screen that already
fitted; the only observable change is that content which used to push the layout wider now
wraps, truncates, or scrolls **inside its own container**.

## Non-goals

- **Not** hiding the symptom with a locked viewport (`maximum-scale` / `user-scalable=no`).
  Pinch-to-zoom stays available; the app deliberately keeps it for accessibility, and the
  existing 16px coarse-pointer font-size guard exists for the same reason.
- **Not** a blanket `overflow-x: hidden` on `<body>` in place of fixing the causes. That
  hides overflow while making the document a scroll container, which breaks `position:
  sticky` descendants and programmatic scrolling.
- No change to what any screen shows, or to any financial computation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A widget detail panel stays put (Priority: P1)

A member on a phone taps a dashboard widget. The detail panel opens full-screen and can be
scrolled up and down. No horizontal drag is possible at any point, at any text size, on any
of the panels — including the ones whose content is a day-of-month strip, a ranked merchant
list, or a three-column month reconciliation.

**Why this priority**: This is the reported bug.

**Acceptance**:
1. The panel's scrolling region scrolls vertically only.
2. A merchant name far longer than the panel truncates rather than widening the row.
3. A recurring-charge dot on day 1 or day 31 sits fully inside the strip.
4. A month card's income/expenses/saved columns wrap rather than overflow.

### User Story 2 - Every other route stays put too (Priority: P1)

A member scrolls any screen in the app on a phone — dashboard, transactions, planning,
settings. Nothing drags sideways, and the bottom tab bar never shifts horizontally.

**Why this priority**: The shell defect made this reachable everywhere; fixing only the
panels would have left the general case live.

**Acceptance**:
1. The shell's `<main>` shrinks to the viewport at every breakpoint, mobile included.
2. `<main>` scrolls vertically only.
3. The right-side drawer (budgets, household, filters — which renders at 90vw on a phone)
   scrolls vertically only.
4. The dashboard's spend heatmap scrolls **within its own scroller**, not by widening the page.

### User Story 3 - Wide content is still reachable (Priority: P2)

Where content genuinely is wider than the screen — the spend heatmap's day grid over a long
range — the member can still scroll it, inside its own container.

**Acceptance**: The heatmap grid remains horizontally scrollable; only the page does not move.

## Requirements *(mandatory)*

- **FR-001**: No surface in the app may scroll horizontally on a mobile viewport.
- **FR-002**: An element intended to scroll on one axis MUST declare both axes explicitly.
- **FR-003**: A flex item that must shrink below its content MUST carry `min-w-0` at every
  breakpoint it renders in, not only from `sm:` up.
- **FR-004**: A marker positioned along a track MUST stay within the track at every position.
- **FR-005**: Unbounded user-supplied text (merchant, payer, household names) MUST truncate
  or wrap rather than widen its row.
- **FR-006**: A document-level backstop MUST use `overflow-x: clip`, never `hidden`.
- **FR-007**: The fix MUST NOT lock the viewport or disable pinch-to-zoom.

## Success Criteria

- **SC-001**: All six identified causes are fixed and each is pinned by a test that was seen
  to fail first.
- **SC-002**: The existing suite passes unchanged — no screen's content or behaviour changes.
- **SC-003**: A future reintroduction of any cause fails the suite rather than reaching a user.

# Feature Specification: Settings-Shortcut Dashboard Widgets

**Feature Branch**: `feat/039-settings-shortcut-widgets`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Add more widgets, this time these widgets will take the user to the specific
settings page: Data: download your data, Widget Settings, Change Currency, Change Language." Four
navigation widgets on the spec-034 widget board that, when clicked, route to a specific Settings
page instead of opening the (placeholder) details drawer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jump to a settings page from the dashboard (Priority: P1)

A household member wants quick access to common settings from their dashboard. From Settings →
Widgets they enable one or more of four shortcut widgets — **Download your data**, **Widget
settings**, **Change currency**, **Change language**. Each renders as a calm tile with an icon and an
"Open" affordance. Clicking (or activating via keyboard) the tile navigates directly to the matching
Settings page.

**Why this priority**: The whole value of these widgets is the one-click jump; without navigation
they are inert. This is the entire feature.

**Independent Test**: Enable a shortcut widget, click it, and confirm the app navigates to the
expected `/settings/...` route (not the details drawer).

**Acceptance Scenarios**:

1. **Given** the Download-your-data widget is enabled, **When** the member clicks it, **Then** the app
   navigates to `/settings/data`.
2. **Given** the Widget-settings widget is enabled, **When** the member clicks it, **Then** the app
   navigates to `/settings/widgets`.
3. **Given** the Change-currency widget is enabled, **When** the member clicks it, **Then** the app
   navigates to `/settings/currency`.
4. **Given** the Change-language widget is enabled, **When** the member clicks it, **Then** the app
   navigates to `/settings/language`.
5. **Given** any shortcut widget, **When** it renders, **Then** it does NOT open the details drawer
   (that behavior is for data widgets only).

---

### Edge Cases

- **Keyboard / assistive tech**: each shortcut is a real link (`<a>`), Tab-focusable with a visible
  focus ring, and activates with Enter — not a `<div>` with an onClick.
- **Default-off**: all four ship default-off (like `activity`/housing widgets), so the first-run board
  is unchanged; members opt in from Settings → Widgets.
- **Body scroll**: shortcut bodies are short (icon + affordance) and never need to scroll; the
  full-cover link overlay is acceptable because there is no scrollable body content to swallow.
- **Localization**: all widget copy is translated in the five non-English catalogs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The widget framework MUST support a navigation widget: a `WidgetDefinition` MAY declare
  an optional `href`. When present, the widget's card is a link to that route and clicking it does NOT
  open the details drawer.
- **FR-002**: The system MUST add four navigation widgets to the registry: `download-data`
  (`/settings/data`), `widget-settings` (`/settings/widgets`), `change-currency`
  (`/settings/currency`), `change-language` (`/settings/language`).
- **FR-003**: Each shortcut widget's card MUST be a real, keyboard-reachable link with a visible focus
  ring; it MUST NOT be a non-semantic clickable div.
- **FR-004**: Each shortcut body MUST fill its cell with a calm icon + an "Open" affordance, using
  design tokens only; no hardcoded colors.
- **FR-005**: All four widgets MUST ship `defaultEnabled: false` and appear in Settings → Widgets
  automatically (registry is the single source of truth; no board/settings edits beyond the registry
  and the frame's href support).
- **FR-006**: Data widgets (no `href`) MUST keep their existing behavior: clicking opens the details
  drawer. The frame change MUST be backward compatible.
- **FR-007**: All new UI strings MUST be added to the five non-English i18n catalogs.
- **FR-008**: The frame's href behavior and the registry wiring MUST be covered by tests; each
  shortcut body MUST have a test asserting it renders and fills its cell.

### Key Entities

- **Navigation widget**: a `WidgetDefinition` with an `href` and a body that shows an icon + "Open"
  affordance. Four instances: download-data, widget-settings, change-currency, change-language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking each enabled shortcut widget navigates to its matching `/settings/...` route.
- **SC-002**: A shortcut widget never opens the details drawer; a data widget still does.
- **SC-003**: All four widgets appear in Settings → Widgets and render on the board when enabled —
  from their registry entries alone.
- **SC-004**: `npm test` and `npx tsc --noEmit` pass; no hardcoded colors; links are semantic and
  keyboard-reachable.

## Assumptions

- The four target Settings routes already exist (`/settings/data`, `/settings/widgets`,
  `/settings/currency`, `/settings/language`).
- Navigation is client-side via the existing Next `<Link>` used elsewhere in the app.
- The details drawer remains the behavior for data-display widgets; only widgets that declare an
  `href` navigate.

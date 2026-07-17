# Feature Specification: Mobile new/edit flows as dedicated pages

**Feature Branch**: `025-mobile-form-pages`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "make the mobile new/edit transaction and new/edit property views their own pages while keeping the desktop tray/drawer exactly as-is; the /new and /edit pages should be their own pages with the same context as now; use spec kit autonomously; TDD; new branch."

## Overview

On a phone/tablet (the compact + medium form factors, i.e. viewport `< 1024px`), the
"add / edit a transaction" and "add / edit a property" forms today open as floating
overlays on top of the current screen (a centered dialog for transactions, a right-side
slide-out drawer for housing). This feature replaces those mobile overlays with **dedicated
full-screen pages** the app navigates to — a more native, less cramped experience where the
whole screen is the form. On desktop (the expanded form factor, `≥ 1024px`) nothing changes:
the existing right-side tray/drawer stays exactly as it is. The forms keep operating on the
same live household data they use now.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add / edit a transaction on a full mobile page (Priority: P1)

On a phone, when a person adds a new transaction or edits an existing one, the form takes over
the whole screen as its own page instead of appearing as a floating dialog over the activity
list. Saving or backing out returns them to the activity list.

**Why this priority**: Transactions are the app's most frequent action; a full-screen form is
the primary value of this change and the biggest ergonomic win on a small screen.

**Independent Test**: On a `< 1024px` viewport, tap "＋" on Activity → the app navigates to a
dedicated new-transaction page (its own URL) showing the same transaction form; fill it in and
Save → the transaction is created and the app returns to Activity with the new row present.
Open a transaction's detail sheet and tap "Edit" → the app navigates to a dedicated
edit-transaction page pre-filled from that transaction; change a field and Save → the change
persists and the app returns to Activity. Cancel/back from either page → returns to Activity
with nothing changed.

**Acceptance Scenarios**:

1. **Given** a phone viewport on Activity, **When** the user taps the add ("＋") control,
   **Then** the app navigates to a dedicated add-transaction page (distinct URL) rendering the
   full transaction form, not a floating overlay.
2. **Given** the add-transaction page with valid inputs, **When** the user Saves, **Then** a new
   transaction is created via the same create action used today and the app returns to the
   Activity list showing the new transaction.
3. **Given** a transaction's read-only detail sheet on a phone, **When** the user taps "Edit",
   **Then** the app navigates to a dedicated edit page pre-filled from that transaction.
4. **Given** the edit-transaction page, **When** the user changes a field and Saves, **Then** the
   existing transaction is updated (same id) and the app returns to Activity.
5. **Given** the add- or edit-transaction page, **When** the user Cancels or uses the browser/OS
   back gesture, **Then** the app returns to Activity and no create/update occurs.
6. **Given** the "Copy" action on a transaction row (phone), **When** the user activates it, **Then**
   the app navigates to the add page pre-filled from the copied transaction.
7. **Given** a "Settle up" action that carries a transfer prefill (from / to / amount), **When**
   activated on a phone, **Then** the app navigates to the add page pre-filled as that transfer.
8. **Given** the add-transaction page in "save and add another" mode, **When** the user saves,
   **Then** the form resets in place on the same page (no navigation away) for the next entry.

---

### User Story 2 - Add / edit a property on a full mobile page (Priority: P2)

On a phone, adding or editing a property takes over the whole screen as its own page rather than
sliding in as a right-side drawer. Adding a property first asks which kind of property it is
(the existing kind picker) as the first step of that page, then shows the form.

**Why this priority**: Housing is edited far less often than transactions, so it is second, but
it must reach the same full-page treatment for consistency. It also carries the larger refactor
(housing has no mobile/desktop split today), so it is sequenced after the transaction slice.

**Independent Test**: On a `< 1024px` viewport, tap "Add property" → the app navigates to a
dedicated new-property page that first presents the property-kind choice, then the form; complete
it and Save → the property is created and the app returns to the Housing list. From a property's
detail, tap "Edit" → navigates to a dedicated edit page pre-filled from that property; change a
field and Save → the change persists and the app returns to Housing.

**Acceptance Scenarios**:

1. **Given** a phone viewport on Housing, **When** the user taps "Add property", **Then** the app
   navigates to a dedicated add-property page (distinct URL) that begins with the property-kind
   selection step.
2. **Given** the add-property page after a kind is chosen, **When** the user completes the form and
   Saves, **Then** a new property is created via the same create action used today and the app
   returns to Housing.
3. **Given** a property on a phone, **When** the user chooses "Edit", **Then** the app navigates to a
   dedicated edit-property page pre-filled from that property (correct kind, all sections).
4. **Given** the edit-property page, **When** the user changes a field and Saves, **Then** the
   existing property is updated (same id, nested mortgage/lease/unit data rewritten as today) and
   the app returns to Housing.
5. **Given** the add- or edit-property page, **When** the user Cancels or backs out, **Then** the app
   returns to Housing and no create/update occurs.

---

### User Story 3 - Desktop presentation preserved and robust across widths (Priority: P3)

Desktop users see no change: the transaction tray and the housing drawer open in place exactly
as before, with no URL change and no navigation. If a phone user's page is somehow viewed at a
desktop width (window resized to ≥ 1024px, or the URL is reloaded on a wide screen), the app
gracefully returns them to the corresponding list rather than showing a broken half-state.

**Why this priority**: This is the guardrail that guarantees "desktop unchanged" and prevents the
new mobile routes from producing a broken experience at the wrong width; it has no standalone
user value but protects the other two stories.

**Independent Test**: On a `≥ 1024px` viewport, the add/edit triggers still open the existing
in-place tray/drawer and the URL does not change. Loading a mobile page URL (e.g. the
add-transaction page) at `≥ 1024px` redirects to the corresponding list. On a `< 1024px`
viewport the same URL renders the full-page form.

**Acceptance Scenarios**:

1. **Given** a desktop viewport, **When** the user triggers add/edit for a transaction or property,
   **Then** the existing in-place tray/drawer opens with no route change (behavior identical to
   today).
2. **Given** a desktop viewport, **When** a mobile new/edit page URL is loaded directly, **Then** the
   app redirects to the corresponding list (Activity or Housing) and shows no dedicated form page.
3. **Given** a phone viewport on a mobile new/edit page, **When** the viewport is enlarged past the
   desktop breakpoint, **Then** the app returns the user to the corresponding list (it does not try
   to render a desktop tray inside a page route).

### Edge Cases

- **Edit target missing**: the id in an edit page's address does not match any transaction/property
  in the store (stale link, deleted while away, wrong household) → the page redirects to the list
  rather than rendering an empty/blank form.
- **Entity deleted while editing**: the entity being edited disappears from the store (e.g. removed
  on another device) → the page returns to the list, mirroring today's auto-dismiss-on-delete
  behavior for the overlays.
- **Deep-link / hard reload on the Capacitor iOS shell**: extensionless routes fall back to the
  app root on a cold load, so these pages are reachable via in-app navigation, not external
  deep-links; a hard reload of a mobile new/edit page is treated like any lost transient state and
  lands the user on a valid screen (the app root/list), never a crash.
- **Store not yet loaded**: navigating to a new/edit page before household data has loaded shows the
  app's normal loading state (inherited from the shared shell), then the form once data is present.
- **List context on return**: returning from a page lands on the list; any transient list state that
  was only held in memory on the list screen (active filters, search text, expanded month, scroll
  position) may reset — this is an accepted v1 tradeoff (see Assumptions), not an error state.
- **Missing/invalid transfer prefill**: a "settle up" address with incomplete transfer parameters
  falls back to a plain new-transaction page rather than erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On viewports `< 1024px`, the new-transaction and edit-transaction forms MUST be
  presented as dedicated full-screen pages with their own addresses, not as floating overlays.
- **FR-002**: On viewports `< 1024px`, the new-property and edit-property forms MUST be presented as
  dedicated full-screen pages with their own addresses, not as drawers.
- **FR-003**: On viewports `≥ 1024px`, the transaction tray and housing drawer MUST behave exactly as
  today — opened in place, with no navigation and no URL change — for every add/edit entry point.
- **FR-004**: Add/edit entry points (Activity header "＋", Activity empty-state action, transaction
  row "Copy", "Settle up", the transaction detail sheet's "Edit", and the Housing add and edit
  triggers) MUST choose their behavior by form factor: navigate to the page on `< 1024px`, open the
  in-place overlay on `≥ 1024px`.
- **FR-005**: The dedicated pages MUST operate on the same live household context/data the current
  overlays use (people, cards, currency, current household, transactions, properties, etc.), with no
  separate data source and no data re-fetch required for in-app navigation.
- **FR-006**: Creating from a page MUST use the same create action as today (add transaction / add
  property) and editing MUST use the same update action (preserving the entity's id and its existing
  created-by/created-at and nested data semantics).
- **FR-007**: An edit page MUST identify its target entity by an id carried in its address and resolve
  the full entity from the store; if no matching entity exists, it MUST redirect to the list.
- **FR-008**: The add-transaction page MUST support the three existing entry variants — blank, "copy
  from" an existing transaction, and "settle up" transfer prefill — with the source conveyed through
  the page address (a copied transaction by its id; a transfer by its from/to/amount), reconstructing
  the same prefilled form the overlay produces today.
- **FR-009**: The add-property page MUST present the property-kind selection as its first step and then
  the corresponding form, producing the same result as today's picker-then-form flow.
- **FR-010**: After a successful Save, and after Cancel/back, a mobile page MUST return the user to the
  corresponding list (Activity for transactions, Housing for properties).
- **FR-011**: "Save and add another" on the add-transaction page MUST reset the form in place without
  navigating away; "Copy from recent" MUST remain an in-page sub-view, not a separate page.
- **FR-012**: If a mobile new/edit page is rendered at `≥ 1024px` (resize or reload on a wide screen),
  it MUST redirect to the corresponding list rather than render a partial/desktop state.
- **FR-013**: The read-only transaction detail sheet, the filters sheet, and the scan picker MUST
  remain as they are today (out of scope); only the add/edit forms change presentation on mobile.
- **FR-014**: The transaction and property form logic (fields, validation, split math, currency
  handling, submit) MUST be reused unchanged across the desktop overlay and the mobile page — a single
  shared form body, no duplicated logic — and the scan flow that reuses the transaction form MUST keep
  working.
- **FR-015**: The desktop composition code MUST stay out of the mobile bundle (the existing bundle-split
  guard remains green), and the mobile pages MUST not statically pull in desktop tray code.
- **FR-016**: All new/edit pages MUST sit behind the same authentication, subscription paywall, and
  biometric-lock gates as the rest of the authenticated app (by living under the same app shell).
- **FR-017**: The pages MUST honor the design system and accessibility rules: real semantic controls,
  a labelled page header with a back/cancel affordance and a Save action, keyboard-reachable order,
  visible focus ring, tokens-only styling, and `prefers-reduced-motion` respected.

### Key Entities *(include if feature involves data)*

- **Transaction**: existing entity; a dedicated page creates one (new id) or edits one (by id). No
  schema or field change — only how the form is presented and reached.
- **Property**: existing entity, including its nested mortgage / lease / unit data; a dedicated page
  creates or edits one by id. No schema or field change.

*No new persistent entities are introduced. The only new "data" is transient intent encoded in a
page address (which entity to edit, what to copy, a transfer prefill, a chosen property kind).*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a `< 1024px` viewport, 100% of the four flows (new transaction, edit transaction, new
  property, edit property) are reached as a distinct full-screen page (own address), not an overlay.
- **SC-002**: On a `≥ 1024px` viewport, 100% of the same four flows still open the in-place
  tray/drawer with no navigation — desktop behavior is byte-for-byte unchanged (verified by the
  existing desktop tests staying green with no desktop-facing code change).
- **SC-003**: A create or edit completed from a mobile page produces exactly the same stored result as
  the same action completed from the desktop tray (same fields, same id semantics), verified by tests
  that drive the shared form and assert the create/update action is called with equivalent data.
- **SC-004**: Loading any mobile new/edit page address at `≥ 1024px`, or with an unresolvable edit id,
  lands the user on the correct list with no blank/broken screen (100% of these cases redirect).
- **SC-005**: The full test suite (`npm test` in `web/`), typecheck, and the bundle-split guard are
  green; new behavior is covered test-first, and no existing transaction/property/scan test regresses.
- **SC-006**: No net new hardcoded colors, font sizes, or shadow usages are introduced (tokens-only),
  and every new page passes the same dialog/-page accessibility checks used elsewhere (semantic
  header, focus order, back + Save controls reachable by keyboard).

## Assumptions

- **Breakpoint**: "mobile" means the existing non-expanded branch, viewport `< 1024px` (compact +
  medium form factors), matching the app's current `useIsExpanded()` content split. Desktop is
  `≥ 1024px`. This keeps the existing desktop tray/drawer as the sole thing that stays put.
- **URL scheme is constrained by static export**: the app is a static-exported bundle (wrapped by
  Capacitor for iOS), which rules out server-rendered dynamic `[id]` routes and the framework's
  intercepting/parallel-route "modal-or-page" pattern. Therefore edit pages carry the entity id and
  the copy/settle/kind intent as query parameters on static routes, resolved client-side from the
  store — rather than path parameters or route interception.
- **Reachability**: because the iOS shell falls back to the app root for extensionless deep-links,
  these pages are entered through in-app navigation (soft navigation), not external deep-links or cold
  hard-loads; losing the page on a hard reload is acceptable and lands on a valid screen.
- **List transient state resets on return (v1 tradeoff)**: today the overlay keeps the list mounted
  underneath, so filters/search/expanded-month/scroll persist. A dedicated page unmounts the list, so
  that transient state may reset on return. This is accepted for v1 and explicitly not solved here
  (could be lifted to the URL or shared state in a follow-up).
- **Desktop is untouched**: no desktop tray/drawer markup, styling, or behavior changes; the desktop
  code path is not given a URL. Only the entry points gain a form-factor branch.
- **Reuse over rewrite**: the transaction form already separates logic (a shared form hook) from its
  chrome; housing will be refactored so its form body is extracted from the drawer and reused by both
  the desktop drawer and the mobile page. No form/validation/mutation logic is rewritten.
- **Same gates**: the pages live under the existing authenticated app shell, so they inherit its
  auth + paywall + biometric-lock behavior automatically.

## Out of Scope

- A dedicated page for the read-only **transaction detail** view (it stays a sheet on mobile), and any
  change to the **filters** sheet or **scan** picker.
- Any change to **desktop** presentation, layout, or the tray/drawer.
- Any change to transaction/property **form fields, validation, split/mortgage math, or store
  mutations** (create/update/delete behavior is identical; only presentation and routing change).
- Persisting or restoring **list transient state** (filters/search/scroll) across the navigation.
- External **deep-linking** to the new pages (they are in-app soft-navigation destinations).
- The adjacent **log-rental-payment** drawer and any other housing overlay beyond new/edit property.

# Feature Specification: Learn-More Tour

**Feature Branch**: `feat/047-learn-more-tour`

**Created**: 2026-08-15

**Status**: Implemented. `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` complete — see
[plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/tour-contracts.md), [quickstart.md](./quickstart.md) and
[tasks.md](./tasks.md). Never went through `/speckit-clarify`; the two ambiguities it would have
raised (whether screen position belongs in the address, and where exactly the copy lives) were
resolved in research §2 and §3 with the reasoning recorded.

**Input**: Feature 3 of 4 in the onboarding funnel (`docs/plan/onboarding-funnel.md`). A short guided tour between the landing page and sign-in, in each of the six supported languages.

## Overview

Between "this looks interesting" and "make me an account" there is a gap. This feature fills it with
a **short, skippable tour** — at most five screens — that shows what Ortho actually does before
asking anyone to sign up.

It is also where the funnel records that a visitor came through it: both finishing the tour **and**
skipping it set the marker that spec 048 later reads to hand the new user into the financial-health
questionnaire. Skipping must not cost the visitor that guided continuation.

**Depends on spec 045 being merged.** Independent of spec 046 — the two connect only through the
`/tour/{locale}` address, which 045's registry already defines, so they can be built simultaneously
and merged in any order.

## Inherited contracts (do not reinvent)

| Contract | Where | Use |
|---|---|---|
| `LANDING_LOCALES`, `landingSlugs()`, `localeForSlug()` | `web/lib/onboarding/locales.ts` | The six locales. Never restate the slugs. |
| `markFunnelEntry()` | `web/lib/onboarding/funnel.ts` | Called by **both** the finish action and Skip. |
| `adoptLandingLanguage(slug)` | `web/lib/onboarding/adoptLanguage.ts` | Already called on the landing CTA; call here too if the tour is entered directly. |
| `LandingCatalog` + reserved regions | `web/lib/i18n/landing/*.ts` | Slide copy goes **only** inside the `spec 047` marker region. |
| Static-export constraints | `specs/045-onboarding-foundation/research.md` §1–5 | No server, no middleware, no redirects; per-locale routes need static params. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor sees what Ortho does before signing up (Priority: P1)

Someone who chose "learn more" is shown a handful of screens, each covering one thing the product
does, in their own language. At the end, one action takes them to sign-in. At any point they can
skip straight there.

**Why this priority**: The feature. Without it the funnel is a landing page wired directly to a
login form.

**Independent Test**: Walk all screens in one language and confirm arrival at sign-in; then skip
from the first screen and confirm the same destination.

**Acceptance Scenarios**:

1. **Given** a visitor entering the tour, **When** it opens, **Then** the first screen appears in
   that address's language with a visible way to advance and a visible way to skip.
2. **Given** a visitor on the last screen, **When** they take the finish action, **Then** they
   arrive at sign-in.
3. **Given** a visitor on any screen, **When** they skip, **Then** they arrive at sign-in.
4. **Given** either finishing or skipping, **When** it happens, **Then** the funnel marker is
   recorded — skipping must not forfeit the guided hand-off.
5. **Given** the tour, **When** its screens are counted, **Then** there are no more than five.
6. **Given** any of the six languages, **When** the tour renders, **Then** every screen is in that
   language on first paint, with no English flash.

---

### User Story 2 - Moving through the tour feels natural on any device (Priority: P2)

Advancing works the way the device suggests: swiping on a phone, arrow keys and a click target on a
desktop. Position within the tour is always visible, and going back is possible.

**Why this priority**: A tour that is awkward to advance gets abandoned. P2 because the content must
exist before the interaction can be judged.

**Independent Test**: Complete the tour using only touch, then only the keyboard, then only clicks.

**Acceptance Scenarios**:

1. **Given** a touch device, **When** the visitor swipes, **Then** the tour advances or goes back.
2. **Given** a keyboard, **When** arrow keys are used, **Then** the tour advances or goes back, and
   every control is reachable in DOM order with a visible focus ring.
3. **Given** any screen, **When** it renders, **Then** the visitor's position in the sequence is
   visible.
4. **Given** the visitor is not on the first screen, **When** they go back, **Then** the previous
   screen is shown with no loss of position.
5. **Given** reduced-motion is preferred, **When** transitions occur, **Then** they are suppressed.

---

### User Story 3 - The tour is honest about the product (Priority: P2)

Each screen describes something Ortho genuinely does today, in the product's plain, calm voice — not
aspirational features or marketing abstraction.

**Why this priority**: A tour that oversells is worse than none: it sets an expectation the first
session then breaks. Equal to P2 because it constrains the content as it is written.

**Independent Test**: Check each screen's claim against a shipped feature.

**Acceptance Scenarios**:

1. **Given** each screen, **When** its claim is checked, **Then** it maps to a feature that exists.
2. **Given** the copy, **When** it is read, **Then** it is second-person and plainspoken, with no
   alarmist or hard-sell framing.
3. **Given** any money shown as an example, **When** it renders, **Then** it follows the product's
   money formatting and loss is never red.

---

### Edge Cases

- **Direct entry to a middle screen** (bookmark, shared link) → resolve to a valid position rather
  than erroring.
- **An unrecognized language in the address** → same recovery as the landing routes.
- **Browser back during the tour** → behaves predictably; the tour must not trap the back button.
- **Storage unavailable** → the tour still completes and still navigates; only the marker is skipped.
- **Very long translated strings** → wrap without clipping; screens must not require scrolling to
  reach the advance control on a small phone.
- **A visitor who abandons mid-tour and returns later** → no stale position is forced on them.
- **Signed-in visitor opening the tour directly** → renders normally; no forced redirect.
- **The installed mobile app** → must never display the tour.

## Requirements *(mandatory)*

- **FR-001**: The tour MUST be available for each of the six supported languages at a stable,
  per-language address.
- **FR-002**: The tour MUST contain at most five screens.
- **FR-003**: Each screen MUST describe a capability the product has today.
- **FR-004**: A skip affordance MUST be present on every screen.
- **FR-005**: Both finishing and skipping MUST lead to sign-in.
- **FR-006**: Both finishing and skipping MUST record the funnel marker.
- **FR-007**: The tour MUST support advancing and going back by touch and by keyboard, and MUST show
  the visitor's position.
- **FR-008**: Every screen MUST present in its own language on first paint, with no English flash.
- **FR-009**: All copy MUST live in the `spec 047` reserved region of the landing catalogs; the app
  catalogs MUST remain untouched.
- **FR-010**: The tour MUST NOT load the signed-in application's data layer.
- **FR-011**: The installed mobile app MUST never display the tour.
- **FR-012**: Styling MUST use existing design tokens only; motion MUST respect reduced-motion.
- **FR-013**: The feature MUST introduce no database change and no new runtime dependency.

## Success Criteria *(mandatory)*

- **SC-001**: A visitor can complete the tour in under 60 seconds, in any of the six languages.
- **SC-002**: 100% of visitors who finish **or** skip arrive at sign-in with the funnel marker set.
- **SC-003**: The tour is completable using touch alone, keyboard alone, or clicks alone.
- **SC-004**: No screen shows English before its own language at any point during load.
- **SC-005**: Every screen's claim maps to a shipped feature — zero aspirational claims.
- **SC-006**: Zero occurrences of the tour appearing inside the installed mobile app.
- **SC-007**: The existing test suite and the iOS build both pass unchanged.

## Assumptions

- **Five candidate screens**, drawn from what has actually shipped: transactions with household
  splits; planning (budgets and goals); the financial-health score; routines (recurring charges
  detected automatically); privacy plus six languages. The implementing agent may reorder or drop,
  but must not invent.
- **Screens live in client state, not separate addresses.** Six locales × five screens would be
  thirty static documents for no benefit under the static export; position may be reflected in the
  address if that is cheap, but a document per screen is not wanted.
- **The landing page (spec 046) may not exist yet.** The tour is entered by address; the two
  features merge independently.
- **No analytics**, so per-screen drop-off cannot be measured yet. SC-001's timing is a design
  target verified by walkthrough, not instrumentation.
- **Illustrations are optional and likely unnecessary** — the product's design language is calm and
  typographic, and the constitution forbids decorative illustration in chrome.

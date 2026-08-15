# Feature Specification: Per-Language Landing Pages

**Feature Branch**: `feat/046-landing-pages`

**Created**: 2026-08-15

**Status**: Draft — scaffolded for a sandbox agent. Run `/speckit-plan` next.

**Input**: Feature 2 of 4 in the onboarding funnel (`docs/plan/onboarding-funnel.md`). Replaces the structural placeholders shipped by spec 045 with real marketing content, a primary call to action, and a secondary sign-in link.

## Overview

Spec 045 built the machine: six statically exported entry points at `/landing/{en,es,bn,ja,zh,ko}`,
each already routed to, already carrying per-locale SEO metadata, already presenting in its own
language on the first frame. What each one currently shows is a wordmark and a single line.

This feature fills them in. It is the only feature in the funnel whose substance is **words rather
than behavior** — and the reason the funnel exists at all: Ortho is marketed to distinct language
communities, and a campaign aimed at one needs a destination that speaks to it.

**Depends on spec 045 being merged.** Everything below consumes contracts that already exist; none
of them should be rebuilt.

## Inherited contracts (do not reinvent)

| Contract | Where | Use |
|---|---|---|
| `LANDING_LOCALES`, `landingSlugs()`, `localeForSlug()` | `web/lib/onboarding/locales.ts` | The only place the six slugs live. Never restate them. |
| `adoptLandingLanguage(slug)` | `web/lib/onboarding/adoptLanguage.ts` | Call on **both** CTAs, so the language carries into sign-in and the app. |
| `LandingCatalog` + reserved regions | `web/lib/i18n/landing/*.ts` | Add copy **only** inside the `spec 046` marker region of each file. |
| `LandingPlaceholder` | `web/components/landing/LandingPlaceholder.tsx` | The single file this feature replaces. |
| Route + metadata | `web/app/landing/[locale]/page.tsx` | Server component; extend its metadata, don't restructure it. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A newcomer understands what Ortho is (Priority: P1)

Someone who followed an ad or a shared link lands on a page in their own language and, without
scrolling, understands what the product does and who it is for. If they want more, one obvious
action takes them to the tour. If they already have an account, a quieter link takes them to sign in.

**Why this priority**: The page's entire job. Everything else is refinement.

**Independent Test**: Open each of the six entry points and confirm the proposition, the primary
action and the secondary link are present, in that language, and correctly ordered by visual weight.

**Acceptance Scenarios**:

1. **Given** any of the six entry points, **When** it loads, **Then** the value proposition, one
   prominent "learn more" action and one quieter sign-in link are all visible without scrolling on a
   standard phone viewport.
2. **Given** a visitor taps the primary action, **When** it resolves, **Then** they arrive at the
   tour for that same language.
3. **Given** a visitor taps the sign-in link, **When** it resolves, **Then** they arrive at sign-in
   presented in that same language.
4. **Given** either action is taken, **When** it fires, **Then** that page's language becomes the
   stored preference — merely viewing the page must still change nothing.
5. **Given** any entry point, **When** it renders, **Then** its text appears in its own language on
   the first frame, with no English flash.

---

### User Story 2 - The page reads as Ortho, on any screen (Priority: P2)

The page looks and feels like the product it introduces — calm, money-first, the same type and
palette — and is legible from a small phone to an ultrawide monitor.

**Why this priority**: A marketing page that contradicts the product's tone undermines it. P2
because the content must exist before it can be styled.

**Independent Test**: View each entry point at compact, medium and expanded widths and confirm no
horizontal scroll, capped content width, and tokens-only styling.

**Acceptance Scenarios**:

1. **Given** any breakpoint from 320px to ultrawide, **When** the page renders, **Then** content is
   capped and centered and the body never scrolls horizontally.
2. **Given** the design tokens, **When** the page is audited, **Then** no hardcoded color, font size
   or shadow has been introduced.
3. **Given** either theme, **When** the page renders, **Then** it is correct in both light and dark.
4. **Given** the primary and secondary actions, **When** navigated by keyboard, **Then** both are
   reachable in DOM order with a visible focus ring, and hit targets meet the touch minimum.

---

### User Story 3 - Each market can be spoken to differently (Priority: P3)

The six pages are structured so their positioning can diverge per market without a code change —
different emphasis, different proof, different framing — rather than one English page mechanically
translated six times.

**Why this priority**: The strategic reason the funnel is per-language at all. P3 because the
structure can ship before the market-specific words are written.

**Independent Test**: Change one locale's proposition and confirm no other locale and no component
requires editing.

**Acceptance Scenarios**:

1. **Given** one locale's copy is rewritten, **When** the change is made, **Then** only that
   locale's catalog region is touched.
2. **Given** a locale needs a different number of supporting points than another, **When** it
   renders, **Then** the layout accommodates it without a per-locale branch in the component.

---

### Edge Cases

- **Very long translated strings** (German-length compounds, Bengali line-breaking) → wrap without
  clipping or overflow.
- **A visitor with a stored language who opens a different language's page** → the page renders in
  the address's language; the stored preference changes only if they act.
- **Storage unavailable** → both actions still navigate; only adoption is skipped.
- **Slow connection** → the proposition is text and must paint before any decorative asset.
- **Signed-in visitor on a landing page** → renders normally; no forced redirect (045's rule).
- **A seventh language added later** → one registry edit plus one new catalog; no component change.

## Requirements *(mandatory)*

- **FR-001**: Each of the six entry points MUST present a value proposition, one primary call to
  action, and one visually secondary sign-in link.
- **FR-002**: The primary action MUST lead to the tour for the same language; the secondary link
  MUST lead to sign-in.
- **FR-003**: Both actions MUST adopt the page's language as the stored preference before navigating.
- **FR-004**: Viewing a page MUST NOT change any stored preference.
- **FR-005**: All copy MUST live in the `spec 046` reserved region of the landing catalogs; the app
  catalogs MUST remain untouched.
- **FR-006**: Each page MUST present in its own language on first paint, with no English flash.
- **FR-007**: Pages MUST NOT load the signed-in application's data layer.
- **FR-008**: Styling MUST use existing design tokens only; no new palette entry, no shadow on
  inset content, and loss/cost framing MUST never be red.
- **FR-009**: Both actions MUST be real semantic controls, keyboard-reachable, with visible focus.
- **FR-010**: Layout MUST be correct from 320px to ultrawide with content capped and no horizontal
  body scroll.
- **FR-011**: Per-locale copy MUST be independently editable without touching another locale or any
  component.
- **FR-012**: Existing per-locale metadata and hreflang from spec 045 MUST continue to work, with
  titles and descriptions updated to the real proposition.
- **FR-013**: The feature MUST introduce no database change and no new runtime dependency.

## Success Criteria *(mandatory)*

- **SC-001**: All six entry points present proposition, primary action and secondary link, each in
  the correct language, with zero English leakage.
- **SC-002**: 100% of visitors who take either action arrive at a next step in the same language.
- **SC-003**: No entry point shows English before its own language at any point during load.
- **SC-004**: No horizontal body scroll at any width from 320px to 2560px, in both themes.
- **SC-005**: Rewriting one locale's positioning requires editing exactly one catalog region.
- **SC-006**: The existing test suite and the iOS build both pass unchanged, and the installed app
  still never displays a landing page.

## Assumptions

- **Market positioning is supplied by the product owner.** An agent should ship all six locales with
  a strong English proposition faithfully translated, structured so copy is swappable. Inventing what
  a Bengali or Korean audience finds persuasive is out of scope for an agent — this is flagged in
  `docs/plan/onboarding-funnel.md` as the human's piece.
- **The tour route (`/tour/{locale}`) may not exist yet** — spec 047 builds it. Link to it anyway;
  the two features merge independently and the href is defined by 045's registry.
- **Social preview images are in scope only if trivial**; otherwise defer with the OG tags already
  present.
- **No analytics.** The app has none, and adding it is a separate decision.
- **Screenshots or product imagery are optional.** If used they must be theme-aware and must not
  delay first paint of the text.

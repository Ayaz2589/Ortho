# Feature Specification: Onboarding Foundation

**Feature Branch**: `feat/045-onboarding-foundation`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Onboarding foundation — the shared plumbing for the signed-out onboarding funnel (landing → tour → sign-in → financial health), per `docs/plan/onboarding-funnel.md`. Scope is foundation ONLY; landing content, the tour, and the new-user hand-off are separate follow-on features (046/047/048)."

## Overview

Ortho has no front door. Someone who has never signed up and opens the site is sent straight to
the dashboard, which finds no session and bounces them to a sign-in form — a login prompt as a
first impression, in English, regardless of who they are.

This feature builds the *structure* of a proper front door: a set of language-specific entry
points, the rule that decides who sees them, and the shared contracts the three follow-on features
(landing content, the guided tour, the new-user hand-off) will each build on. It deliberately
ships **no marketing copy** — the six entry points arrive as structural placeholders. What it does
ship is the routing decision, the language hand-off, and the discoverability surface, all of which
are risky to change later and impossible to parallelize around.

The business reason for language-specific entry points: Ortho is marketed to distinct language
communities, and a campaign aimed at one community needs its own destination — one that opens in
that language and keeps the whole session in it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A newcomer reaches a page in their own language (Priority: P1)

Someone who has never used Ortho opens the site for the first time. Instead of being handed a
sign-in form, they land on a page presented in their own language, chosen from the language their
browser already asks for. If their language isn't one Ortho supports, they get the English page —
never a blank screen or an error.

**Why this priority**: This is the point of the feature and the only part with direct outward
value. Every other story supports or protects it.

**Independent Test**: Set a browser to Spanish, visit the site root while signed out, and confirm
arrival on the Spanish entry point. Repeat with an unsupported language (e.g. French) and confirm
arrival on the English one. Fully testable with the placeholder pages, before any marketing copy
exists.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor whose browser language is Spanish, **When** they open the site
   root, **Then** they arrive at the Spanish entry point.
2. **Given** a signed-out visitor whose browser language is French (unsupported), **When** they
   open the site root, **Then** they arrive at the English entry point.
3. **Given** a signed-out visitor whose browser reports no language at all, **When** they open the
   site root, **Then** they arrive at the English entry point.
4. **Given** a visitor who opens a language entry point directly by link (e.g. from an ad),
   **When** the page loads, **Then** it is presented in that link's language regardless of what
   the browser asks for.
5. **Given** any language entry point, **When** it renders, **Then** its text appears in the
   correct language on first paint — never briefly in English first.

---

### User Story 2 - Existing users and app users are untouched (Priority: P1)

Someone who already uses Ortho must never be shown marketing. A signed-in visitor goes straight to
their dashboard as before, and someone who opens the installed mobile app always lands in the app —
the front door belongs to the website only.

**Why this priority**: Equal to P1 because it is a regression guard on the two most valuable
audiences the product already has. A mistake here means the shipped mobile app opens on an advert,
or a returning user is bounced through a marketing page to reach their money.

**Independent Test**: Open the site root while signed in and confirm the dashboard loads with no
marketing page appearing at any point. Separately, launch the installed mobile app and confirm it
opens on the dashboard.

**Acceptance Scenarios**:

1. **Given** a signed-in visitor on the website, **When** they open the site root, **Then** they
   arrive at the dashboard and no entry point is displayed at any moment during the transition.
2. **Given** the installed mobile app, **When** it is launched, **Then** it opens the app itself
   and never displays an entry point, regardless of sign-in state or device language.
3. **Given** a visitor whose sign-in state is still being determined, **When** the root is
   loading, **Then** a neutral holding state is shown — never a flash of one destination followed
   by the other.
4. **Given** a signed-in visitor who opens a language entry point directly by link, **When** the
   page loads, **Then** it renders normally and does not forcibly redirect them away.

---

### User Story 3 - The chosen language carries through the whole journey (Priority: P2)

A visitor who arrives at a language-specific entry point and decides to continue — whether to learn
more or to sign in — stays in that language for everything that follows: the sign-in screen, and
the app itself once they have an account. They never have to find a language setting to undo an
English default.

**Why this priority**: Without this, the language-specific entry points are cosmetic — a visitor
would read a Spanish page and then be handed an English sign-in form. It is P2 only because the
entry points must exist before language can carry from them.

**Independent Test**: From the Spanish entry point, follow the continue action, then confirm the
sign-in screen presents in Spanish and the stored language preference reflects that choice without
the visitor ever opening settings.

**Acceptance Scenarios**:

1. **Given** a visitor on a non-English entry point, **When** they take an action that continues
   the journey, **Then** that page's language becomes their stored language preference.
2. **Given** a visitor who has adopted a language this way, **When** they reach the sign-in
   screen, **Then** it is presented in that language.
3. **Given** a visitor who only views an entry point without continuing, **When** they leave,
   **Then** their previously stored language preference is unchanged — merely viewing a page does
   not silently overwrite a returning user's setting.
4. **Given** a visitor who adopts a language and later signs in, **When** the app loads, **Then**
   the app is in that language.

---

### User Story 4 - The language pages can be found and correctly attributed (Priority: P3)

Each language entry point is discoverable on its own and is understood by search engines as the
language-specific version of the same page, so a search in one language surfaces that language's
page rather than the English one.

**Why this priority**: Discoverability compounds over time but nothing in the funnel breaks
without it, and it can be verified independently of the pages' content.

**Independent Test**: Inspect any published entry point and confirm it declares its own language,
its own address, and the addresses of its five siblings plus a default; confirm the site's
machine-readable index lists all six.

**Acceptance Scenarios**:

1. **Given** any language entry point, **When** its published page is inspected, **Then** it
   declares its own language, its own canonical address, and alternates for all six languages plus
   an unspecified-language default.
2. **Given** the site's machine-readable index, **When** it is fetched, **Then** it lists all six
   entry points and no signed-in-only destination.
3. **Given** automated crawlers, **When** they fetch the site's crawl rules, **Then** the entry
   points are permitted and the signed-in application is not advertised for indexing.
4. **Given** any language entry point, **When** it is fetched, **Then** its title and description
   are in that page's own language.

---

### User Story 5 - Three follow-on features can be built in parallel without colliding (Priority: P3)

The three efforts building the landing content, the guided tour, and the new-user hand-off can run
simultaneously in separate environments and merge in any order, because the contracts they share —
the list of supported entry languages, the marker that records that someone came through the
funnel, and the reserved regions of the shared translation files — already exist and are owned by
this feature.

**Why this priority**: Purely a delivery-velocity outcome with no outward-facing behavior, so it
ranks last — but it is the reason this foundation is a separate feature at all rather than being
absorbed into the first one.

**Independent Test**: Confirm exactly one place in the codebase defines the supported entry
languages; confirm the funnel marker can be set, read, and cleared independently of any page; and
confirm each translation file carries a reserved, empty region per follow-on feature such that two
branches editing different regions merge without conflict.

**Acceptance Scenarios**:

1. **Given** the supported entry languages, **When** the codebase is searched, **Then** exactly
   one definition exists and every consumer derives from it.
2. **Given** a seventh language is added to that one definition, **When** the project is built,
   **Then** a new entry point, index entry, and alternate declarations all follow without any
   other list being edited.
3. **Given** the funnel marker, **When** it is set, read, and cleared, **Then** it behaves
   correctly and survives a page reload on the same device.
4. **Given** two branches that each add text to a different reserved region of the same
   translation file, **When** they are merged, **Then** no conflict occurs.

---

### Edge Cases

- **Unsupported browser language** (e.g. `fr-FR`, `de-DE`) → the English entry point. Never a
  blank page, never an error.
- **Regional variants** (`es-MX`, `zh-TW`, `pt-BR`) → resolved to the supported base language
  where one exists (`es`, `zh`), otherwise English.
- **No browser language reported at all** → the English entry point.
- **The bare entry-point address with no language** → the visitor is forwarded to the entry point
  for their detected language rather than shown an error.
- **An unrecognized language in the address** (e.g. a mistyped or retired code) → the same
  forwarding behavior as the bare address, so a stale ad link never dead-ends.
- **Sign-in state still resolving at the root** → a neutral holding state; never a visible flash
  of one destination before the other.
- **A returning visitor with a stored language preference opens a different language's entry
  point** → the page renders in the address's language, but their stored preference changes only
  if they choose to continue.
- **Storage unavailable or blocked** (private browsing, storage disabled) → language detection and
  routing still work for the current visit; nothing is persisted and nothing errors.
- **A visitor who came through the funnel abandons before signing in** → the funnel marker simply
  remains until it is used or cleared; it carries no personal data and expires with the device's
  storage.
- **Adding a seventh language later** → one list changes; entry point, index, and alternates
  follow.

## Requirements *(mandatory)*

### Functional Requirements

**Supported entry languages**

- **FR-001**: The system MUST define the set of supported entry languages in exactly one place,
  each entry associating a short address code, the application's existing language option, and the
  regional formatting locale.
- **FR-002**: Every consumer of that set — entry points, the machine-readable index, the alternate
  declarations, and the language hand-off — MUST derive from that single definition rather than
  restating it.
- **FR-003**: The initial set MUST be the six languages the application already supports:
  English, Spanish, Bengali, Japanese, Simplified Chinese, and Korean.

**Root routing**

- **FR-004**: Opening the site root in the installed mobile app MUST always lead to the
  application, never to an entry point, irrespective of sign-in state or device language.
- **FR-005**: Opening the site root on the website while signed in MUST lead to the dashboard.
- **FR-006**: Opening the site root on the website while signed out MUST lead to the entry point
  matching the browser's language, falling back to English when that language is unsupported,
  unrecognized, or absent.
- **FR-007**: While the routing decision is still resolving, the system MUST show a neutral
  holding state and MUST NOT display either destination.

**Entry points**

- **FR-008**: The system MUST provide one independently addressable entry point per supported
  language, at a stable, predictable address derived from that language's code.
- **FR-009**: Each entry point MUST present its text in its own language on first paint, with no
  intermediate English rendering.
- **FR-010**: Each entry point MUST be a structural placeholder in this feature — the marketing
  content, the primary call to action, and the secondary sign-in link are delivered by the
  follow-on landing feature.
- **FR-011**: Requesting the entry-point address with no language, or with an unrecognized
  language, MUST forward the visitor to the entry point for their detected language.
- **FR-012**: Entry points MUST remain usable without a sign-in session and MUST NOT load the
  signed-in application's data layer.

**Language hand-off**

- **FR-013**: The system MUST provide a way for an entry point to adopt its language as the
  visitor's stored language preference, using the application's existing language setting so that
  the sign-in screen and the application both follow.
- **FR-014**: Adoption MUST occur only when the visitor takes an action to continue the journey,
  never merely from viewing a page.
- **FR-015**: When storage is unavailable, adoption MUST fail silently without breaking
  navigation.

**Funnel marker**

- **FR-016**: The system MUST provide a per-device marker recording that a visitor came through
  the onboarding journey, supporting set, read, and clear.
- **FR-017**: The marker MUST persist across page loads on the same device and MUST require no
  account, no server storage, and no schema change.
- **FR-018**: The marker MUST contain no personal or identifying information.
- **FR-019**: This feature MUST NOT itself set or act on the marker — setting it belongs to the
  tour feature and acting on it to the hand-off feature.

**Discoverability**

- **FR-020**: Each entry point MUST declare its own language, its own canonical address, and
  alternate addresses for every supported language plus an unspecified-language default.
- **FR-021**: Each entry point MUST carry a title and description in its own language.
- **FR-022**: The system MUST publish a machine-readable index listing all six entry points and
  excluding signed-in-only destinations.
- **FR-023**: The system MUST publish crawl rules that permit the entry points and do not
  advertise the signed-in application for indexing.

**Parallel-development contracts**

- **FR-024**: Each shared translation file MUST carry a reserved, clearly delimited, initially
  empty region per follow-on feature, positioned so that two branches editing different regions
  merge without conflict.
- **FR-025**: The reserved regions MUST be empty on delivery — this feature adds no translated
  marketing or tour text.

**Non-regression**

- **FR-026**: The signed-in application's behavior MUST be unchanged: no route, screen, or setting
  outside the root and the new entry points may alter its behavior.
- **FR-027**: The installed mobile app's launch experience MUST be unchanged.
- **FR-028**: The feature MUST introduce no database change, no schema migration, and no new
  server-side dependency.

### Key Entities

- **Supported entry language**: One of the six languages a visitor can arrive in. Carries a short
  address code used in the page address, the application's existing language option, and the
  regional formatting locale. The single list of these is the feature's central contract.
- **Funnel marker**: A per-device, non-identifying record that a visitor travelled the onboarding
  journey. Set by the tour, read by the hand-off, cleared once used. Not stored on any server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-out visitor arriving at the site root reaches a page in their own language
  for 100% of the six supported languages, and reaches the English page for 100% of unsupported
  languages — with no error state in any case.
- **SC-002**: Zero occurrences of an entry point being displayed to a signed-in visitor or inside
  the installed mobile app, across every combination of sign-in state and device language.
- **SC-003**: No entry point displays English text before its own language at any point during
  loading, in any of the six languages.
- **SC-004**: A visitor who continues from a non-English entry point reaches the sign-in screen in
  that language without ever opening a language setting.
- **SC-005**: All six entry points are individually reachable, are listed in the machine-readable
  index, and each declares alternates for all six languages plus a default.
- **SC-006**: Adding a seventh supported language requires editing exactly one list to produce a
  working entry point, index entry, and alternate declarations.
- **SC-007**: Two follow-on branches that each add text to a different reserved translation region
  merge with zero conflicts.
- **SC-008**: The existing automated test suite and the mobile app build both pass unchanged, and
  every route outside the root and the new entry points behaves identically to before.

## Assumptions

- **Placeholder content is expected.** The six entry points ship as structural placeholders. Real
  marketing copy — which needs to be transcreated per market rather than translated, and is the
  product owner's to write — is the follow-on landing feature's scope.
- **The existing language mechanism is reused, not replaced.** Language remains a per-device
  preference in the application's existing setting; this feature adds an entry-point-driven way to
  set it, and introduces no account-level language storage and no address-based language switching
  for the signed-in application.
- **Language detection uses the language the browser already advertises.** No IP-based or
  geographic inference, which is both less accurate and more privacy-invasive.
- **Regional variants collapse to their base language** where supported (`es-MX` → Spanish), and
  otherwise fall back to English.
- **The public site address is supplied as deployment configuration**, with a documented default,
  because canonical and alternate declarations require an absolute address and no production
  domain is currently recorded in the repository. Confirming the production domain is an operator
  task before the entry points are submitted for indexing.
- **Signed-in visitors are not redirected away from entry points reached by direct link** — the
  root is the only place the routing decision applies. This keeps a shared link predictable.
- **The follow-on features are 046 (landing content), 047 (guided tour), and 048 (new-user
  hand-off)**, as recorded in `docs/plan/onboarding-funnel.md`. This feature must land before they
  begin.
- **No analytics or conversion measurement is included.** The funnel is the first place it would
  pay off, but the application has none today and adding it is deliberately out of scope.
- **Social preview images are out of scope**, arriving with the landing content they would depict.

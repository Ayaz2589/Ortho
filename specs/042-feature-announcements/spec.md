# Feature Specification: Feature-Announcement Popup

**Feature Branch**: `feat/042-feature-announcements`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Reusable 'what's new' notification for existing users. When a new feature ships, an existing signed-in account is notified on their next app visit by a calm, dismissible popup showing a title + description and a CTA button that launches that feature's flow. Desktop = right slide-out Drawer; mobile = full-page takeover with an explicit close. Registry-driven; shows the next unseen announcement once per user (localStorage per-device). First user = spec 041 Financial Health: CTA opens /welcome/financial-profile; this replaces the hard onboarding redirect, and Skip becomes dismiss-only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Existing user is calmly notified of a new feature (Priority: P1)

An existing, signed-in user who has been using Ortho opens the app after a new feature ships. Instead of
being force-navigated somewhere, a calm popup appears telling them what's new — a short title and a
one-or-two-sentence description — with a single clear button that takes them into the new feature, plus a
way to dismiss. Once they act (either take the CTA or dismiss), the same popup never appears again on that
device.

**Why this priority**: This is the entire point of the feature — a friendly, non-intrusive "what's new"
surface that respects long-time users. It is the reusable mechanism every future feature will use to
introduce itself, so it must stand on its own.

**Independent Test**: Register a single announcement, load the app as a signed-in user who has not seen it,
confirm the popup renders with the title/description/CTA and a dismiss control; take the CTA and confirm it
navigates to the target route; reload and confirm the popup does not reappear.

**Acceptance Scenarios**:

1. **Given** a signed-in user who has not seen announcement X, **When** the app finishes loading, **Then**
   the announcement popup appears showing X's title, description, and CTA button.
2. **Given** the announcement popup is open, **When** the user clicks the CTA button, **Then** they are
   navigated to the announcement's target route and the announcement is marked seen.
3. **Given** the announcement popup is open, **When** the user dismisses it (close control / scrim / Escape),
   **Then** the popup closes and the announcement is marked seen — no navigation occurs.
4. **Given** a user who has already seen (acted on or dismissed) announcement X, **When** they reload or
   revisit the app, **Then** the announcement popup does NOT reappear.

---

### User Story 2 - The right surface on each canvas (Priority: P2)

The popup presents itself appropriately for the device: on desktop it is the familiar right slide-out
drawer with a scrim; on mobile it is a full-page takeover with an obvious close control. The experience
feels native to the canvas, consistent with the rest of Ortho.

**Why this priority**: Constitution III (Right Form Factor Per Canvas). A reusable pattern that looks wrong
on phones would undermine adoption for every future feature, but it depends on Story 1 existing first.

**Independent Test**: At a desktop width, confirm the popup renders as the right-side drawer with a scrim;
at a compact width, confirm it renders as a full-page takeover with a visible close control. Both expose the
same title/description/CTA/dismiss.

**Acceptance Scenarios**:

1. **Given** the app at an expanded (desktop) width, **When** an unseen announcement shows, **Then** it
   renders as the right slide-out drawer with a background scrim.
2. **Given** the app at a compact (mobile) width, **When** an unseen announcement shows, **Then** it renders
   as a full-page takeover with an explicit close/dismiss control.
3. **Given** either surface, **When** the popup is open, **Then** it is keyboard-reachable, traps focus, and
   closes on Escape.

---

### User Story 3 - Financial Health adopts the pattern; the forced redirect is gone (Priority: P1)

The Financial Health feature (spec 041) becomes the first user of this pattern. Existing profile-less users
are no longer hard-redirected into the questionnaire on load; instead they see the announcement popup whose
CTA opens the questionnaire. On the questionnaire, "Skip" no longer writes a misleading zero-income profile
— it simply leaves the profile unset and closes, so the dashboard widget honestly shows its "Set up your
profile" call-to-action.

**Why this priority**: This is the concrete migration that motivated the feature and removes two known
wrinkles (forced redirect + misleading Skip write). It ships alongside Story 1 as proof the pattern works.

**Independent Test**: As a signed-in user with no financial profile who has not seen the announcement,
confirm the app does NOT auto-navigate to the questionnaire and instead shows the announcement; take the CTA
and confirm arrival at the questionnaire; use Skip and confirm no profile is written and the widget shows
its setup CTA.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no financial profile who has not seen the Financial Health announcement,
   **When** the app loads, **Then** the app does not auto-redirect; the announcement popup appears with a CTA
   to the financial-profile questionnaire.
2. **Given** the user is on the financial-profile questionnaire, **When** they choose "Skip", **Then** no
   financial profile is persisted (profile remains unset) and the questionnaire closes.
3. **Given** the user skipped or dismissed the announcement, **When** they view the dashboard, **Then** the
   Financial Health widget shows its neutral "Set up your profile" CTA rather than a score derived from a
   zero-income profile.

---

### Edge Cases

- **Not signed in / still loading**: The popup never shows before the app has finished bootstrapping or for a
  signed-out visitor. It waits for a known signed-in user.
- **Multiple unseen announcements**: Only one announcement shows at a time — the next unseen one in registry
  order. After it is seen, the following unseen announcement may show on the next load (never two stacked at
  once).
- **localStorage unavailable / private mode**: If the seen-ledger cannot be read or written, the feature
  fails safe — reads treat the announcement as unseen and writes are best-effort; it must never throw or
  block the app.
- **Already on the CTA's target route**: Taking the CTA while already on the target route still marks the
  announcement seen and closes the popup.
- **Brand-new user (empty account)**: A first-run user may still see a gentle prompt into the questionnaire,
  but is not the target of the "existing user was notified" path; the announcement's once-per-user semantics
  apply the same way.
- **Announcement targets a removed route**: If a registered route no longer exists it is a registry
  maintenance concern; the popup still renders and the CTA attempts navigation (out of scope to validate
  routes at runtime).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain a reusable announcement registry where each entry declares a stable
  `id`, a `title`, a `description`, and a call-to-action with a `label` and a target `route`.
- **FR-002**: The system MUST show, to a signed-in user, the next announcement (in registry order) that the
  user has not yet seen — exactly one at a time.
- **FR-003**: The system MUST record that an announcement has been seen once the user either takes its CTA or
  dismisses it, and MUST NOT show a seen announcement again on that device.
- **FR-004**: The system MUST persist the seen state per-device using local browser storage keyed by
  announcement `id`, mirroring the existing text-size read/write helper pattern, and MUST fail safe when
  storage is unavailable (treat as unseen; never throw).
- **FR-005**: The system MUST NOT show any announcement while the app is still loading or when no user is
  signed in.
- **FR-006**: Taking the CTA MUST navigate the user to the announcement's target route AND mark the
  announcement seen; dismissing MUST mark it seen WITHOUT navigating.
- **FR-007**: On expanded (desktop) widths the popup MUST render as the shared right slide-out drawer with a
  scrim; on compact (mobile) widths it MUST render as a full-page takeover with an explicit close control.
- **FR-008**: The popup MUST be an accessible dialog: a real semantic control set, keyboard-reachable, focus
  trapped while open, dismissible via an explicit close control and via Escape, with a visible focus ring.
- **FR-009**: The popup MUST follow the calm design system — token-only styling, no red, no shimmer, no
  alarmist copy — presenting money-adjacent features without pressure.
- **FR-010**: The system MUST register a Financial Health announcement whose CTA opens the financial-profile
  questionnaire route.
- **FR-011**: The system MUST remove the forced redirect behavior for profile-less users: the app MUST NOT
  auto-navigate an existing signed-in user into the financial-profile questionnaire.
- **FR-012**: On the financial-profile questionnaire, the "Skip" action MUST be dismiss-only: it MUST NOT
  persist a financial profile (the profile remains unset) and MUST close the flow.
- **FR-013**: When no financial profile is set, the Financial Health dashboard widget MUST present its
  neutral "set up your profile" call-to-action rather than a score computed from an empty/zero profile.
- **FR-014**: All user-facing strings introduced by this feature MUST be present in all five non-English
  catalogs (bn/es/ja/zh/ko) with English as the key.

### Key Entities *(include if feature involves data)*

- **Announcement**: A declarative "what's new" entry. Attributes: stable `id`, `title`, `description`, and a
  CTA (`label` + target `route`). Lives in a code-level registry, not in the database.
- **Seen ledger**: A per-device record of which announcement `id`s the current browser has seen. Stored in
  local browser storage; read/written through a small helper. Not user-scoped in the database (per-device by
  design).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user who has not seen a new feature's announcement sees it exactly once; after
  taking the CTA or dismissing, it never reappears on that device across reloads.
- **SC-002**: No existing signed-in user is auto-redirected into the financial-profile questionnaire; 100% of
  entries into that questionnaire are user-initiated (via the announcement CTA, the widget CTA, or Settings).
- **SC-003**: Choosing "Skip" on the questionnaire results in no financial profile being stored in 100% of
  cases, and the dashboard widget then shows its "set up your profile" CTA.
- **SC-004**: The popup renders as a right drawer on desktop and a full-page takeover on mobile, is fully
  keyboard-operable, and closes on Escape — verified by automated behavior tests.
- **SC-005**: Adding a future announcement requires only appending one registry entry plus its catalog
  strings — no changes to the popup component or the seen-ledger logic.
- **SC-006**: Every new user-facing string ships in all five non-English catalogs (no missing keys).

## Assumptions

- The seen ledger is intentionally **per-device** (local browser storage), not cross-device. If the same
  user signs in on a second device, they may see the announcement again there. Cross-device suppression is
  explicitly out of scope for this version.
- Announcements are authored in code (a static registry), not managed through an admin UI or the database.
  There is no scheduling, targeting, or A/B logic — an announcement is either registered or not.
- Only one announcement is shown per app load, even if several are unseen; the rest surface on subsequent
  loads. This keeps the experience calm.
- The existing shared Drawer component (right slide-out on desktop, full-bleed on mobile) is the delivery
  surface and already provides scrim, focus trap, Escape handling, and scroll lock.
- The Financial Health questionnaire flow and dashboard widget already exist (spec 041); this feature changes
  only the entry point (announcement instead of forced redirect) and the Skip semantics, not the
  questionnaire itself.
- "Signed in" and "still loading" are determined from the existing app store state already used by the
  current onboarding gate.
</content>
</invoke>

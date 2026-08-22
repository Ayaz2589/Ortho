# Research & Decisions: Feature-Announcement Popup

All Technical Context items were resolvable from existing patterns in the repo; no external research needed.
This file records the design decisions and the alternatives weighed.

## D1 — Seen-ledger storage: per-device localStorage

- **Decision**: Store the seen set in `localStorage` under a single key `ortho.announcementsSeen` holding a
  JSON array of seen announcement ids. Access it through a small `announcementsSeen.ts` helper that mirrors
  `web/components/settings/textSize.ts` (guarded read/write, never throws).
- **Rationale**: The user explicitly chose per-device. It matches the existing `ortho.fhOnboardingDismissed`
  / textSize / appearance patterns, needs no migration or RLS table, and is the calmest to ship. A single
  JSON-array key makes "has this id been seen?" and "what's the next unseen id?" trivial and keeps the whole
  ledger inspectable/clearable as one entry.
- **Alternatives considered**:
  - *Per-id keys* (`ortho.announcement.<id>.seen = '1'`, like the current dismissal flag): simpler write but
    can't enumerate the seen set without scanning `localStorage` keys — rejected for the next-unseen query.
  - *User-scoped DB table (cross-device)*: correct for cross-device suppression but adds a migration, RLS,
    store wiring, and network reads for a calm cosmetic popup. Explicitly out of scope (spec Assumptions).

## D2 — Announcements live in a code registry, not the database

- **Decision**: A static `ANNOUNCEMENTS: Announcement[]` array in `registry.ts`. Each entry:
  `{ id, titleKey, descriptionKey, cta: { labelKey, route }, isRelevant? }`. Copy fields are i18n **keys**
  (English strings) passed through `t()` at render, matching the rest of the app.
- **Rationale**: Announcements ship with the code that introduces the feature — the registry entry is part of
  the feature's PR. No admin UI, scheduling, or targeting is in scope. Keys (not literal copy) keep the
  popup translatable across all 5 catalogs with zero special-casing.
- **Alternatives considered**: DB-managed announcements / a CMS — massive overkill; rejected. Passing raw
  translated strings instead of keys — breaks i18n; rejected.

## D3 — Optional `isRelevant` predicate for feature-specific gating

- **Decision**: Each announcement may declare `isRelevant?(ctx: AnnouncementContext): boolean`. The host
  shows the next announcement that is both **unseen** and (`isRelevant` absent or returns true). Financial
  Health uses `isRelevant: (ctx) => ctx.userFinancialProfile == null` so a user who already has a profile is
  never told to "set up financial health".
- **Rationale**: Keeps the registry reusable (predicate is optional and defaults to always-relevant) while
  letting a feature suppress its own announcement once the feature has been engaged. `AnnouncementContext` is
  a tiny typed slice of the store (`{ userFinancialProfile }` today) so the host stays decoupled from the
  full store shape and the predicate is trivially unit-testable.
- **Alternatives considered**: Hard-coding the profile check into the host — couples the reusable host to one
  feature; rejected. No relevance gating at all — would show a redundant "financial health is new" popup to
  users who already set it up; acceptable but worse UX; rejected.

## D4 — Delivery surface: reuse the shared `Drawer`

- **Decision**: Render the popup with the existing `Drawer` (`fullBleedOnMobile`) + `DrawerHeader`. Header
  title is a generic, reusable `What's new`; the body shows the announcement's feature title (emphasized),
  its description, and a `PrimaryButton` CTA.
- **Rationale**: `Drawer` already provides right-slide-out-on-desktop / full-page-on-mobile, a scrim, focus
  trap, Escape handling, and scroll-lock — exactly Constitution III + V. A generic header keeps the chrome
  identical for every future announcement; only the body varies.
- **Alternatives considered**: A bespoke modal — reinvents solved behavior and risks design drift; rejected.
  Putting the feature title in the drawer header — makes the header non-reusable; rejected.

## D5 — When the popup shows: signed-in + not loading, one at a time

- **Decision**: The host reads `loading` and `currentUserId` from `useApp()`. It renders nothing while
  loading or signed-out. Once ready, it opens for the first unseen+relevant announcement (registry order),
  and only one at a time. Additional unseen announcements surface on later loads.
- **Rationale**: Matches the existing gate's readiness checks and the spec's "calm, one at a time" rule. No
  distinction between "new" and "existing" users is attempted — an unseen announcement simply shows; a
  feature that shouldn't nag brand-new users can express that via `isRelevant`.
- **Alternatives considered**: Detecting account age to skip brand-new users — no reliable signal and adds
  complexity for little gain; the once-per-user + `isRelevant` semantics already suffice; rejected.

## D6 — Marking seen: on both CTA and dismiss

- **Decision**: Clicking the CTA calls `markAnnouncementSeen(id)` then `router.push(route)`. Any dismiss
  (close chip, scrim click, Escape) calls `markAnnouncementSeen(id)` with no navigation. Both close the
  popup for the session.
- **Rationale**: The user has now been notified either way, so it should never reappear (FR-003/FR-006).
  `push` (not `replace`) preserves back navigation from the feature flow.
- **Alternatives considered**: Mark seen only on CTA — a dismiss would re-pop the same announcement next
  load, which is nagging; rejected.

## D7 — Retire the onboarding gate; make Skip dismiss-only

- **Decision**: Delete `web/components/financial-health/onboardingGate.tsx` and its Shell mount; mount
  `AnnouncementHost` instead. In `welcome/financial-profile/page.tsx`, the Skip button no longer submits
  `neutralDraft()` nor writes the `ortho.fhOnboardingDismissed` key — it simply routes to `/dashboard`
  (dismiss-only). The primary "See my score" completion is unchanged (still requires a valid income and
  still writes the real profile + snapshot).
- **Rationale**: Removes the forced redirect (FR-011) and the misleading zero-income write (FR-012). With no
  profile persisted, the dashboard widget's existing `!hasProfile` branch shows "Set up your financial
  profile" honestly (FR-013) — no widget change required.
- **Alternatives considered**: Keeping the dismissal key for backward-compat — it's only read by the gate
  being deleted, so it's dead; drop it. Keeping `neutralDraft()` — still used as the form's initial draft in
  `useFinancialProfileForm`, so the function stays; only the Skip *submit* is removed.

## Cross-cutting: i18n

New user-facing strings (`What's new`, the FH announcement title, description, and CTA label) are added to
`lib/i18n/index.ts` (English identity keys) and translated into all five catalogs (bn/es/ja/zh/ko), guarded
by a new `test/i18n/announcements-i18n.test.ts` mirroring the spec-041 i18n test. Reused keys (e.g. `Close`)
are not re-added.
</content>

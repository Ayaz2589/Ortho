# Tasks: Feature-Announcement Popup

**Feature dir**: `specs/042-feature-announcements/` | **Branch**: `feat/042-feature-announcements`
**Inputs**: plan.md, spec.md, research.md, data-model.md, contracts/announcements.md, quickstart.md
**Approach**: TDD (Constitution VI) — every behavior gets a failing test before the code that satisfies it.

**Path conventions**: web app under `web/`; source in `web/components/announcements/`, `web/app/(app)/`,
`web/lib/i18n/`; tests in `web/test/`. All commands run from `web/`.

---

## Phase 1: Setup

- [X] T001 Create the module directory `web/components/announcements/` (source) and `web/test/announcements/`
      (tests) so the reusable pattern has a home separate from any one feature.
- [X] T002 [P] Add the new English i18n keys to `web/lib/i18n/index.ts`: `What's new`,
      `Financial health` (reuse existing key if present — do not duplicate), `See how your money's doing with a calm 0–100 score — answer a few questions to start.`,
      and `Set up financial health`. (English is the identity key; translations come in Phase 6.)

---

## Phase 2: Foundational (blocking prerequisites)

The seen-ledger and registry are pure and underpin every user story. Tests first.

- [X] T003 [P] Write failing unit tests for the seen-ledger in `web/test/announcements/announcementsSeen.test.ts`:
      `readSeenAnnouncements()` → `[]` when key missing / malformed JSON / storage throws; `markAnnouncementSeen(id)`
      appends idempotently (no dupes); `hasSeenAnnouncement(id)` reflects the ledger; `nextUnseenAnnouncement(list, ctx)`
      returns the first entry that is unseen AND (`isRelevant` absent or true), `null` when none. (Storage key `ortho.announcementsSeen`.)
- [X] T004 [P] Write failing unit tests for the registry in `web/test/announcements/registry.test.ts`:
      `ANNOUNCEMENTS` ids are unique; the `financial-health` entry has `cta.route === '/welcome/financial-profile'`
      and `isRelevant` returns `true` when `userFinancialProfile == null`, `false` when a profile object is present.
- [X] T005 Implement `web/components/announcements/registry.ts`: export `Announcement` + `AnnouncementContext`
      types and the `ANNOUNCEMENTS` array seeded with the `financial-health` entry (per data-model.md). Make T004 pass.
- [X] T006 Implement `web/components/announcements/announcementsSeen.ts` mirroring `web/components/settings/textSize.ts`
      (guarded read/write, never throws): `readSeenAnnouncements`, `hasSeenAnnouncement`, `markAnnouncementSeen`,
      `nextUnseenAnnouncement`. Make T003 pass.

**Checkpoint**: `npx vitest run test/announcements/announcementsSeen.test.ts test/announcements/registry.test.ts` green.

---

## Phase 3: User Story 1 — Existing user is calmly notified (Priority: P1) 🎯 MVP

**Goal**: A signed-in user with an unseen, relevant announcement sees a calm popup with title + description +
CTA + dismiss; CTA navigates and marks seen; dismiss marks seen; it never re-shows on that device.

**Independent test**: Register one announcement, mount the host as a signed-in user who hasn't seen it →
popup shows; CTA → navigates + seen; reload → gone. (Covered by `AnnouncementHost.test.tsx`.)

- [X] T007 [US1] Write failing behavior tests in `web/test/announcements/AnnouncementHost.test.tsx` (jsdom;
      mock `@/lib/store` `useApp` and `next/navigation`): (a) renders nothing while `loading`; (b) renders nothing
      when `currentUserId` falsy; (c) renders nothing when `nextUnseenAnnouncement` is null; (d) renders a
      `role="dialog"` with the translated title, description, and CTA when an unseen+relevant announcement exists;
      (e) CTA click calls `markAnnouncementSeen(id)` then `router.push(route)`; (f) dismiss (close button / Escape)
      calls `markAnnouncementSeen(id)` and does NOT navigate; (g) after seen, a fresh mount renders nothing.
- [X] T008 [US1] Implement `web/components/announcements/AnnouncementHost.tsx`: read `loading`, `currentUserId`,
      `userFinancialProfile`, `t` from `useApp()`; compute `nextUnseenAnnouncement(ANNOUNCEMENTS, { userFinancialProfile })`;
      render nothing unless ready + present; otherwise render the popup body (generic `What's new` header + feature
      title + description + `PrimaryButton` CTA). Wire CTA → `markAnnouncementSeen` + `router.push`; dismiss →
      `markAnnouncementSeen` + close. Make T007 pass. (Uses `Drawer`/`DrawerHeader`; surface details in US2.)

**Checkpoint**: `npx vitest run test/announcements/AnnouncementHost.test.tsx` green — MVP behavior verified.

---

## Phase 4: User Story 2 — Right surface per canvas (Priority: P2)

**Goal**: Desktop = right slide-out drawer + scrim; mobile = full-page takeover with an explicit close;
both are focus-trapped, keyboard-reachable, Escape-closable.

**Independent test**: The host renders through `Drawer` with `fullBleedOnMobile`; the dialog exposes the
close control and closes on Escape.

- [X] T009 [US2] Extend `web/test/announcements/AnnouncementHost.test.tsx` with surface assertions: the popup
      renders inside a `role="dialog" aria-modal="true"` with an accessible label; an explicit close control
      (`aria-label` "Close") is present; pressing `Escape` closes it (marks seen, no navigation).
- [X] T010 [US2] Finalize the `Drawer` wiring in `AnnouncementHost.tsx`: pass `fullBleedOnMobile`, an
      `aria-label`, and use `DrawerHeader` (title `What's new`, `onClose` = dismiss). Confirm token-only styling,
      no red, calm copy (Constitution I/II/IV). Make T009 pass.

**Checkpoint**: full `AnnouncementHost.test.tsx` green; popup is correct on both canvases.

---

## Phase 5: User Story 3 — Financial Health adopts the pattern (Priority: P1)

**Goal**: Mount the host in the Shell in place of the onboarding gate (no forced redirect); the FH announcement
CTA opens the questionnaire; questionnaire "Skip" is dismiss-only (no profile write, no dismissal key); the
widget's null-profile state shows honestly.

**Independent test**: A signed-in profile-less user is NOT auto-redirected; the FH announcement shows; Skip
writes no profile and routes to dashboard; widget shows "Set up your financial profile".

- [X] T011 [US3] Update `web/test/financial-health-onboarding.test.tsx`: replace the "Skip writes neutral
      defaults" test with **Skip is dismiss-only** — clicking `Skip` does NOT call `saveFinancialHealth`, writes
      no `ortho.fhOnboardingDismissed` key, and calls `router.replace('/dashboard')`. Keep the two existing tests
      (income-required; completion writes profile + snapshot) unchanged. (This test now fails against current code.)
- [X] T012 [US3] Make Skip dismiss-only in `web/app/(app)/welcome/financial-profile/page.tsx`: change the Skip
      button to route to `/dashboard` without calling `form.submit`; remove the `dismissOnboarding()` call and the
      `neutralDraft` import if now unused on the page. Leave the primary "See my score" completion path unchanged.
      Make T011 pass.
- [X] T013 [US3] Remove the forced redirect: delete `web/components/financial-health/onboardingGate.tsx` and its
      import + `<FinancialHealthOnboardingGate />` mount in `web/app/(app)/layout.tsx`; mount `<AnnouncementHost />`
      in its place. Delete the now-obsolete gate test `web/test/financial-health-onboarding.test.tsx` references to
      the gate if any, and remove/rename any dedicated gate test file. (The dismissal key `ortho.fhOnboardingDismissed`
      is retired — no reader remains.)
- [X] T014 [US3] Add a Shell-level test in `web/test/announcements/AnnouncementHost.test.tsx` (or a small
      `layout` test) asserting that mounting the host for a signed-in, profile-less user does NOT call
      `router.replace('/welcome/financial-profile')` (the forced redirect is gone — FR-011) and instead shows the
      FH announcement.

**Checkpoint**: `npx vitest run test/financial-health-onboarding.test.tsx test/announcements/` green; grep confirms
no remaining `FinancialHealthOnboardingGate` / `ortho.fhOnboardingDismissed` references.

---

## Phase 6: Polish & Cross-Cutting

- [X] T015 [P] Add `web/test/i18n/announcements-i18n.test.ts` (mirror `test/i18n/financial-health-i18n.test.ts`):
      assert every new key (`What's new`, the FH title/description/CTA-label keys) is present in bn/es/ja/zh/ko with
      matching `{n}` placeholder arity.
- [X] T016 Add the new keys' translations to all five catalogs `web/lib/i18n/{bn,es,ja,zh,ko}.ts`. Make T015 pass.
- [X] T017 [P] Verify no stale references remain: `grep -rn "FinancialHealthOnboardingGate\|onboardingGate\|fhOnboardingDismissed\|neutralDraft" web/{app,components,test}` returns only intended hits (`neutralDraft` may remain inside `useFinancialProfileForm`).
- [X] T018 Run the full gate: `npx tsc --noEmit` (UNPIPED — must be clean) then `npm test` (full suite green).
- [ ] T019 [P] Manual cross-canvas confirm per `quickstart.md` (desktop drawer / mobile full-page, CTA, dismiss,
      Skip-is-honest, already-set-up user) — to be done in a real browser before merge (no browser in sandbox).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** → **US1 (T007–T008)** → **US2 (T009–T010)** →
  **US3 (T011–T014)** → **Polish (T015–T019)**.
- US1 depends on the registry + ledger (Phase 2). US2 refines US1's rendering. US3 depends on US1's host existing.
- Foundational tests (T003, T004) are independent of each other → parallelizable `[P]`.
- i18n test/translations (T015/T016) and the grep/verify (T017) are independent of each other where marked `[P]`.

## Parallel Opportunities

- T002 (English keys) ∥ T003/T004 (foundational tests) — different files.
- T003 ∥ T004 — different test files, no shared state.
- T015 ∥ T017 — i18n test vs. grep verification.

## MVP Scope

**US1 (Phase 3)** on top of Setup + Foundational is the minimum viable slice: a working, dismissible,
once-per-device announcement popup driven by the registry. US2 makes it canvas-correct; US3 wires it to
Financial Health and removes the forced redirect (the concrete migration that motivated the feature).

## Task Count

19 tasks — Setup 2, Foundational 4, US1 2, US2 2, US3 4, Polish 5.
</content>

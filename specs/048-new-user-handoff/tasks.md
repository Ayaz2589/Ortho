---

description: "Task list for spec 048 — new-user hand-off to financial health"
---

# Tasks: New-User Hand-Off to Financial Health

**Input**: Design documents from `/specs/048-new-user-handoff/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED and written first. Constitution Principle VI is non-negotiable, the spec is
explicitly TDD, and SC-006 makes the *existing* suite part of this feature's acceptance criteria.

**Organization**: grouped by user story so each is independently verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1 / US2 / US3, mapping to spec.md
- All paths are repo-relative; commands run from `web/` unless stated otherwise

---

## The one rule this feature lives or dies by

This is a **scoped reversal of spec 042**. Four test files are the regression lock and **must not be
edited**:

```text
web/test/sign-in.test.tsx
web/test/announcements/            (AnnouncementHost, announcementsSeen, registry)
web/test/financial-health-onboarding.test.tsx
web/test/widgets/financial-health.test.tsx
```

If a change to any of them looks necessary, the feature has grown too wide — stop and re-scope.
(SC-006; checklists/requirements.md.)

---

## Phase 1: Setup

**Purpose**: a working suite and a recorded baseline to measure regressions against.

- [X] T001 Install dependencies and capture the pre-implementation baseline: `cd web && npm install && npm test`. Record the totals (expected: 275 files, 2569 passed, 3 expected fail) — every later run is compared against this.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the decision module every user story routes through.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

- [X] T002 [P] RED — write `web/test/onboarding/handoff.test.ts` covering the full behavior table in [contracts/post-sign-in-handoff.md](./contracts/post-sign-in-handoff.md): marker present → returns `HANDOFF_ROUTE`, marker cleared, announcement marked seen; marker absent → returns `DEFAULT_POST_SIGN_IN_ROUTE` with **no** writes; called twice → second call returns the default; storage throwing on read → returns the default without throwing. Run it and confirm it FAILS (module does not exist yet).
- [X] T003 [P] Add the named export `FINANCIAL_HEALTH_ANNOUNCEMENT_ID = 'financial-health'` to `web/components/announcements/registry.ts` and use it as the existing entry's `id`, so the string has exactly one definition.
- [X] T004 GREEN — implement `web/lib/onboarding/handoff.ts` with `DEFAULT_POST_SIGN_IN_ROUTE`, `HANDOFF_ROUTE`, and `resolvePostSignInRoute()` per the contract (clear → mark seen → return, in that order). Depends on T002, T003. Run `npx vitest run test/onboarding/handoff.test.ts` — must pass.
- [X] T005 Confirm `web/test/announcements/registry.test.ts` still passes **unedited** after T003: `npx vitest run test/announcements/registry.test.ts`.

**Checkpoint**: the hand-off decision is provable in isolation. Every FR except FR-004/007/008 is now covered without a component having been touched.

---

## Phase 3: User Story 1 — A funnel newcomer continues into financial health (Priority: P1) 🎯 MVP

**Goal**: a visitor who travelled the funnel lands on the questionnaire, not the dashboard, and is handed off exactly once.

**Independent Test**: seed `ortho.onboardingFunnel = '1'`, complete the OTP flow, confirm arrival at `/welcome/financial-profile`; sign in again and confirm the dashboard.

### Tests for User Story 1 ⚠️

> Write first; confirm FAIL before implementing.

- [X] T006 [US1] RED — write `web/test/onboarding/sign-in-handoff.test.tsx`, mirroring the hoisted-mock shape of `web/test/sign-in.test.tsx` (mock `next/navigation`, `@/lib/supabase/client`, `@capacitor/splash-screen`). With the marker seeded, drive the real two-step form and assert `router.replace('/welcome/financial-profile')`, that the marker is cleared, and that `financial-health` is in the seen-ledger. Confirm it FAILS.

### Implementation for User Story 1

- [X] T007 [US1] GREEN — in `web/app/sign-in/page.tsx`, import `resolvePostSignInRoute` and replace the literal `router.replace('/dashboard')` inside `verify()` with `router.replace(resolvePostSignInRoute())`. Leave `router.refresh()` and all error handling untouched. Do **not** touch the already-signed-in mount effect (research.md §2).
- [X] T008 [US1] Confirm `web/test/sign-in.test.tsx` passes **unedited**: `npx vitest run test/sign-in.test.tsx`.

**Checkpoint**: US1 is functional. FR-001, FR-002, FR-006 hold.

---

## Phase 4: User Story 2 — Everyone else is untouched (Priority: P1)

**Goal**: prove the reversal did not leak. This phase is mostly verification by design — it is the phase that defends spec 042.

**Independent Test**: with storage cleared, complete the OTP flow and confirm `/dashboard`, with the announcement path behaving exactly as before.

### Tests for User Story 2 ⚠️

- [X] T009 [US2] Extend `web/test/onboarding/sign-in-handoff.test.tsx` with the no-marker cases: the full OTP flow lands on `/dashboard`; the seen-ledger is **not** written; and the already-signed-in mount bounce still replaces to `/dashboard` even when a marker is present. (Same file as T006, so not parallel with it.)

### Verification for User Story 2

- [X] T010 [US2] Run the full spec 041/042 regression lock and confirm every test passes: `npx vitest run test/sign-in.test.tsx test/announcements/ test/financial-health-onboarding.test.tsx test/financial-health-settings.test.tsx test/widgets/financial-health.test.tsx`.
- [X] T011 [US2] Confirm none of the locked files appear in the diff: `git diff --stat origin/main...HEAD -- web/test/sign-in.test.tsx web/test/announcements web/test/financial-health-onboarding.test.tsx web/test/widgets/financial-health.test.tsx` must print nothing.

**Checkpoint**: FR-003, FR-005, SC-002 and SC-006 hold. The reversal is contained.

---

## Phase 5: User Story 3 — Skipping is still honest (Priority: P2)

**Goal**: the profile guard at the questionnaire's entry (FR-004), with Skip still writing nothing (FR-007) and the dashboard still honest (FR-008).

**Independent Test**: take the hand-off, decline, confirm the dashboard shows the unset state and no duplicate prompt.

### Tests for User Story 3 ⚠️

- [X] T012 [US3] RED — write `web/test/onboarding/financial-profile-guard.test.tsx` per [contracts/questionnaire-entry-guard.md](./contracts/questionnaire-entry-guard.md): profile present → no questionnaire heading rendered, `router.replace('/dashboard')` called, `saveFinancialHealth` never called; profile absent → the questionnaire renders with no navigation on mount, and Skip still writes no profile and lands on `/dashboard`. Confirm the profile-present cases FAIL.

### Implementation for User Story 3

- [X] T013 [US3] GREEN — add the entry guard to `web/app/(app)/welcome/financial-profile/page.tsx`: read `loading` + `userFinancialProfile` from `useApp()`, `router.replace('/dashboard')` in a mount effect when a profile exists, and return `null` while redirecting so the stepper never flashes. Change nothing inside the existing stepper, `finish`, or `skip`.
- [X] T014 [US3] Confirm `web/test/financial-health-onboarding.test.tsx` and `web/test/widgets/financial-health.test.tsx` pass **unedited**.

**Checkpoint**: all three user stories are independently functional. FR-004, FR-007, FR-008, FR-009 hold.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 Run the full suite and compare against the T001 baseline: `npm test`. Must be ≥ 275 files / 2569 passed, plus the new tests. Any drop is a regression.
- [X] T016 [P] Typecheck: `npx tsc --noEmit` — clean.
- [X] T017 [P] Confirm no money/date logic moved: `npm run gen:vectors` produces no diff.
- [X] T018 [P] Update the onboarding section of `docs/web.md` — record that `funnel.ts` now has its reader, and where the hand-off and the entry guard live.
- [X] T019 Confirm the scope bounds hold in the diff: no migration under `supabase/migrations/`, no change to `web/package.json`, and no change to any `web/lib/i18n/` catalog (FR-010; research.md §6).
- [X] T020 Run [quickstart.md](./quickstart.md) §1–3 end to end and tick its Definition of Done.
- [ ] T021 Commit, push to `feat/048-new-user-handoff`, mark draft PR #111 ready for review, and watch the Capacitor iOS CI run: `GH_TOKEN=placeholder gh run watch --exit-status`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories** — every story routes through `resolvePostSignInRoute()` or the constant it marks seen.
- **US1 (Phase 3)**: depends on Phase 2.
- **US2 (Phase 4)**: depends on Phase 3 — it verifies the *absence* of an effect on the path US1 wires, so the wiring must exist first.
- **US3 (Phase 5)**: depends on Phase 2 only. Independent of US1/US2 in code (a different file), though the hand-off is what makes the guard reachable in practice.
- **Polish (Phase 6)**: depends on all stories.

### Within Each User Story

- The failing test lands before the code that satisfies it, every time.
- The "confirm the locked file still passes unedited" task closes each story — a story is not done until it has proven what it did *not* break.

### Parallel Opportunities

- T002 and T003 — different files, no shared state.
- T016, T017, T018 — typecheck, vectors, and docs are mutually independent.
- US3 (Phase 5) could be built in parallel with US1/US2 by a second person: it touches only `web/app/(app)/welcome/financial-profile/page.tsx` and its own test file.

## Parallel Example: Phase 2

```bash
# Both at once — different files:
Task: "RED: web/test/onboarding/handoff.test.ts per contracts/post-sign-in-handoff.md"
Task: "Export FINANCIAL_HEALTH_ANNOUNCEMENT_ID from web/components/announcements/registry.ts"
```

---

## Implementation Strategy

### MVP (US1 only)

Phases 1 → 2 → 3. At that point a funnel-walker reaches the questionnaire and the hand-off fires
exactly once. **Do not ship the MVP alone**: US2 is what proves spec 042 is intact, and it is P1 for
that reason. Treat Phases 1–4 as the true minimum.

### Incremental Delivery

1. Phase 1 + 2 → the decision is provable in isolation.
2. Phase 3 → US1 works (the feature).
3. Phase 4 → US2 verified (the guarantee).
4. Phase 5 → US3 (declining stays honest).
5. Phase 6 → polish, docs, PR.

---

## Notes

- 21 tasks: 1 setup, 4 foundational, 3 US1, 3 US2, 3 US3, 7 polish.
- Roughly 30 lines of production code across 3 files. The test-to-implementation ratio is deliberate
  — the risk in this feature is regression, not novelty.
- Commit after each phase; every checkpoint is a valid stopping point.

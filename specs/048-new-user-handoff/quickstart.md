# Quickstart: Validating the New-User Hand-Off

**Feature**: `specs/048-new-user-handoff/` | **Date**: 2026-08-15

How to prove this feature works, and — just as importantly — how to prove it did **not** leak beyond
the case it was scoped to. Every automated check runs from `web/`.

---

## Prerequisites

```bash
cd web
npm install            # Next 16.2.9, React 19.2.4, Vitest 4.1.8
```

No Supabase credentials, no `.env.local`, and no migration are needed for the automated suite — the
whole feature is client routing over `localStorage`, and the data layer is mocked. Manual browser
verification does need a working env (see §4).

**Baseline before you start** (on this branch, before any implementation):

```bash
npm test
# Test Files  275 passed (275)
#      Tests  2569 passed | 3 expected fail (2572)
```

Any drop from this baseline is a regression, not a new expectation.

---

## 1. The feature's own tests

```bash
npx vitest run test/onboarding/handoff.test.ts \
               test/onboarding/sign-in-handoff.test.tsx \
               test/onboarding/financial-profile-guard.test.tsx
```

Expected: all pass. These cover the two contracts —
[post-sign-in-handoff.md](./contracts/post-sign-in-handoff.md) and
[questionnaire-entry-guard.md](./contracts/questionnaire-entry-guard.md) — and the three user
stories.

## 2. The regression lock (the part that matters most)

SC-006 requires every spec 041 and 042 test to pass **unchanged**. This feature reverses a deliberate
prior decision, so these files are the evidence the reversal stayed in its lane:

```bash
npx vitest run test/sign-in.test.tsx \
               test/announcements/ \
               test/financial-health-onboarding.test.tsx \
               test/financial-health-settings.test.tsx \
               test/widgets/financial-health.test.tsx
```

Expected: all pass, with **no edits to any of these files**. If a change here was needed to make the
feature work, the feature is too wide — that is the signal the checklist warns about.

Confirm they really are untouched:

```bash
git diff --stat origin/main...HEAD -- \
  web/test/sign-in.test.tsx web/test/announcements web/test/financial-health-onboarding.test.tsx
# expected: no output
```

## 3. Full suite + types

```bash
npm test                    # must match or beat the baseline above
npx tsc --noEmit            # clean
npm run gen:vectors         # must produce no diff — no money/date logic changed here
```

---

## 4. Manual verification in a browser

Needs a working `web/.env.local` (Supabase URL + anon key) and a real email you can receive a code
at. **A fresh Linux sandbox cannot do this** — see `docs/index.md`. Run it on a machine with app
credentials before merge, or accept the automated coverage.

```bash
npm run dev     # http://localhost:3000
```

### 4a. US1 — the funnel newcomer (the feature)

1. Open DevTools → Console on `/sign-in` and seed the marker the tour will set:
   ```js
   localStorage.setItem('ortho.onboardingFunnel', '1')
   ```
2. Sign in with a **brand-new** account (one with no financial profile).
3. **Expect**: you land on the financial-health questionnaire, not the dashboard.
4. In the console, confirm the hand-off was consumed exactly once:
   ```js
   localStorage.getItem('ortho.onboardingFunnel')   // → null
   localStorage.getItem('ortho.announcementsSeen')  // → '["financial-health"]'
   ```
5. Complete the questionnaire → dashboard, score visible.
6. Sign out, sign in again → **dashboard**. The hand-off does not repeat.

### 4b. US2 — everyone else is untouched

1. Clear storage entirely (`localStorage.clear()`), then sign in as a profile-less account.
2. **Expect**: the dashboard, with the "What's new" drawer offering Financial Health — exactly
   today's behavior. Dismiss it; reload; it stays gone.
3. Sign in as an account that already has a profile. **Expect**: nothing about the experience differs.

### 4c. US3 — skipping is still honest

1. Seed the marker, sign in as a new account, arrive at the questionnaire.
2. Press **Skip for now** on the first step.
3. **Expect**: the dashboard, and the Financial Health widget reads "Set up your financial profile" —
   *not* a score. Nothing was written.
4. **Expect**: no "What's new" drawer appears offering the same questionnaire — you were already
   asked once.
5. Navigate to `/settings/financial-profile`. **Expect**: the questionnaire is still reachable when
   the user chooses it.

### 4d. The stale-marker edge

1. Seed the marker but do **not** sign in.
2. Sign in as an account that **already has** a profile.
3. **Expect**: you end on the dashboard. The guard bounces you; you are never shown the
   questionnaire. (FR-004 / FR-009)

### 4e. Storage disabled

1. Open a browser profile with site data blocked (or Safari private mode).
2. Sign in normally.
3. **Expect**: sign-in succeeds and lands on the dashboard. Nothing throws. (FR-003)

---

## 5. iOS

No native change and no new Capacitor plugin. The installed app never walks the web funnel, so no
marker is ever set there and sign-in keeps today's behavior (spec's Edge Cases). The existing
`capacitor-ios-ci.yml` build-verifies the bundle on any `web/**` push — watch it with:

```bash
GH_TOKEN=placeholder gh run watch --exit-status
```

---

## Definition of done

- [ ] The three new test files pass.
- [ ] `npm test` matches or beats the 275-file / 2569-pass baseline.
- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run gen:vectors` produces no diff.
- [ ] No spec 041/042 test file appears in the diff.
- [ ] No migration, no new dependency, no catalog change in the diff.
- [ ] Capacitor iOS CI green on the pushed branch.

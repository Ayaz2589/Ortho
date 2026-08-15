# Phase 0 Research: New-User Hand-Off to Financial Health

**Feature**: `specs/048-new-user-handoff/` | **Date**: 2026-08-15

The spec left no `[NEEDS CLARIFICATION]` markers, but it does hand the plan an explicit design crux
(the decision keys on the funnel record, the profile check lives elsewhere) and a hard constraint
(this is a scoped *reversal* of spec 042 and must not leak). This document records the decisions that
resolve those, each read out of the code as it stands on this branch rather than assumed.

---

## 1. Where the hand-off decision lives

**Decision**: a new module `web/lib/onboarding/handoff.ts` exporting `resolvePostSignInRoute()`, which
returns the route to navigate to and performs the one-shot side effects. `web/app/sign-in/page.tsx`
calls it in `verify()` in place of the literal `'/dashboard'`.

**Rationale**: `sign-in/page.tsx` is a 183-line component whose only test seam is the mocked router
and Supabase client (`web/test/sign-in.test.tsx`). Writing the read/clear/mark-seen triple inline
would make each branch reachable only by driving the whole two-step OTP form, and would couple the
sign-in screen directly to the announcement registry. A module keeps the page's diff to one line and
gives the decision a direct unit test. It also mirrors what spec 045 already did with
`lib/onboarding/adoptLanguage.ts` — a tiny localStorage-touching module rather than inline code.

**Alternatives considered**:

- *Inline in `verify()`* — rejected: no unit seam, and it puts announcement-registry knowledge on the
  sign-in screen.
- *Navigate to `/dashboard?welcome=1` and let the app shell redirect* — rejected: it adds a URL
  contract, moves the decision to a second place, and re-creates a shell-level hard redirect, which
  is the exact mechanism spec 042 deleted (042 FR-011).

---

## 2. Which sign-in path fires the hand-off

**Decision**: only the successful `verifyOtp` path (`verify()`, `page.tsx:68–83`). The
already-signed-in mount bounce (`page.tsx:36–49`, which `router.replace('/dashboard')`s a user who
arrives at `/sign-in` with a live session) is left alone.

**Rationale**: FR-001 says "completes sign-in". The mount bounce fires for someone who *already had*
a session — by definition not someone who just created an account. Firing there would let a stale
per-device marker greet a returning user with a questionnaire, which FR-009 forbids. Narrow is the
correct reading, and the profile guard (§3) is the backstop rather than the primary mechanism.

**Alternatives considered**: *fire on both paths* — rejected, it widens the reversal for no
requirement.

---

## 3. Where the profile guard lives

**Decision**: at the questionnaire's entry, `web/app/(app)/welcome/financial-profile/page.tsx`, as a
mount effect over `useApp()`'s `loading` + `userFinancialProfile`. When a profile already exists the
page renders nothing and `router.replace('/dashboard')`s.

**Rationale**: this is the spec's stated crux (Assumptions §1) and the code confirms it — the sign-in
page's own comments say it is "not rendered under AppStateProvider" (`page.tsx:26`), so it has no
access to `userFinancialProfile`. The questionnaire is under `app/(app)/`, already calls `useApp()`,
and therefore can. That is why FR-004 exists as a separate requirement from FR-001.

**Confirmed, not assumed**: `app/(app)/layout.tsx:157` renders `<RouteSkeleton />` while
`loading` and only mounts `children` once loading resolves. So by the time the questionnaire mounts,
`userFinancialProfile` is settled — a `null` reading there means "no profile", never "not loaded
yet". The guard still reads `loading` defensively, so it stays correct if that Shell gate ever moves.

**Rendering choice**: return `null` while redirecting rather than rendering the form behind the
effect. A one-frame flash of a five-step questionnaire before being bounced is exactly the kind of
un-calm moment Principle II rules out.

**Blast radius checked**: `/welcome/financial-profile` has exactly one in-app entry point — the
announcement CTA in `components/announcements/registry.ts:49`, which is relevant only when
`userFinancialProfile == null`. The re-take flow lives at the separate `/settings/financial-profile`
route (`app/(app)/settings/page.tsx:34`), and the dashboard widget's unset state
(`FinancialHealthBody.tsx:68–75`) is plain text with no link. So the guard can never block a
legitimate entry: everyone it turns away already has the profile the questionnaire would collect.

---

## 4. How the duplicate prompt is suppressed (FR-006)

**Decision**: call `markAnnouncementSeen(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)` at hand-off time, inside
`resolvePostSignInRoute()`. The id becomes a named export of
`web/components/announcements/registry.ts` and is used by the registry entry itself, so there is one
source of truth for the string.

**Rationale**: the seen-ledger is already per-device guarded localStorage
(`announcementsSeen.ts`), and the funnel marker is per-device too — the semantics line up exactly,
with no new storage concept. Marking at hand-off rather than at questionnaire-exit means the
suppression holds for every exit: complete, skip, or close the tab mid-questionnaire. All three are
"already asked", which is what SC-004 measures.

**Alternatives considered**:

- *Teach the announcement's `isRelevant` to consult the funnel marker* — rejected twice over: the
  marker is cleared at hand-off so there would be nothing left to read, and it would push
  funnel-specific knowledge into the deliberately feature-agnostic registry (042 FR-001/SC-005).
- *Mark seen when the questionnaire unmounts* — rejected: a user who closes the tab mid-flow would
  be re-offered the same thing on their next load.

**Import direction**: `lib/onboarding/handoff.ts` importing from `components/announcements/` follows
existing precedent — `lib/widgets/registry.tsx`, `lib/useDashboardRange.ts` and `lib/reports/months.ts`
all import from `components/`. Neither `registry.ts` nor `announcementsSeen.ts` imports the store, so
the sign-in screen picks up no new runtime weight.

---

## 5. Accepted consequence: a marker set by one visitor, used by another

The marker is a single presence bit with no identifier by deliberate design (045 FR-018), so "was it
*this* person who walked the funnel?" is unanswerable. Two cases follow, and the spec's Edge Cases
already rule on both:

- **Sign out, then a different user signs in** — the marker was cleared when the first hand-off
  fired, so nothing fires for the second user. This is FR-009, and it is satisfied by *clearing on
  use*, not by identity.
- **A visitor abandons the funnel, and someone else later signs in on that device** — the marker is
  still set, so the hand-off fires. If that user has a profile, the guard bounces them (spec's
  "invited household member" edge case: "the profile guard governs"). If they have no profile, they
  reach the questionnaire instead of the announcement — the same offer, made once, with the
  announcement suppressed so they are not asked twice.

Recorded here as an accepted consequence rather than a defect: closing it would require putting an
identity in the marker, which 045 explicitly refused.

---

## 6. No new copy

**Decision**: this feature adds no user-facing string, and therefore touches no catalog.

**Rationale**: the hand-off is a navigation, and both endpoints — the questionnaire and the dashboard
— are already fully translated by specs 041/042. The profile guard renders `null` rather than a
"Redirecting…" line; adding one would need five catalog entries to display a message for a single
frame. The spec's Assumptions say the same ("No new copy is expected"). If review disagrees, the
repo convention is all five non-English catalogs (bn/es/ja/zh/ko), enforced by
`test/i18n/*-i18n.test.ts`.

---

## 7. Test strategy

**Decision**: three test files, all Vitest + Testing Library under `web/test/onboarding/`, matching
the layout spec 045 established.

| File | Covers |
|---|---|
| `handoff.test.ts` | The decision module in isolation: marker present → questionnaire route, marker cleared, announcement marked seen; marker absent → `/dashboard`, nothing cleared, announcement **not** marked seen; storage-unavailable fail-safe. |
| `sign-in-handoff.test.tsx` | The wiring: drive the real OTP form with and without the marker and assert the destination. Mirrors `test/sign-in.test.tsx`'s hoisted-mock shape. |
| `financial-profile-guard.test.tsx` | The entry guard: profile present → renders nothing and replaces to `/dashboard`; profile absent → the questionnaire renders and Skip stays dismiss-only. |

**Deliberately not touched**: `test/sign-in.test.tsx`, `test/financial-health-onboarding.test.tsx`,
`test/announcements/*`. SC-006 requires them to pass **unchanged** — they are the regression lock on
the 042 behavior this feature is scoped not to disturb. Both files clear `localStorage` in
`beforeEach` and set no marker, so they exercise the untouched path by construction.

**Testable before spec 047 exists**: nothing sets the marker until the tour ships, so every test
seeds `localStorage` directly via `markFunnelEntry()` or a raw `setItem`.

---

## 8. Framework facts checked, not recalled

Per `web/AGENTS.md`, Next.js API details were read from `web/node_modules/next/dist/docs/` at the
installed version (**Next 16.2.9**, React 19.2.4):

- `useRouter().replace(href)` from `next/navigation` — client-side navigation without a history
  entry; unchanged in 16.x
  (`01-app/03-api-reference/04-functions/use-router.md`). No new API is needed for this feature.
- No server-side redirect is available: the app builds with `output: 'export'`, so there is no
  middleware and no `redirects()` — every routing decision here is a client effect, as spec 045
  already established.

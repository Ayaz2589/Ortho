# Contract: Questionnaire Entry Guard

**Route**: `web/app/(app)/welcome/financial-profile/page.tsx` (modified)

**Requirements covered**: FR-004, FR-007, FR-008, FR-011.

---

## Why the guard is here and not at sign-in

The hand-off decision keys on the funnel marker alone, because `web/app/sign-in/page.tsx` renders
outside `AppStateProvider` and cannot read `userFinancialProfile` (its own comment, `page.tsx:26`).
So sign-in can answer "did this device walk the funnel?" but not "does this account already have a
profile?". The second question is answered here, at the destination, where `useApp()` is available.

This split is why FR-004 is a separate requirement from FR-001 rather than a clause inside it.

## Behavior

The guard asks **"did they *arrive* having already answered?"** — not "does a profile exist at this
instant". The first settled reading of `userFinancialProfile` is latched; later changes to it do not
re-trigger the guard.

| Precondition (at the first settled render) | Render | Navigation |
|---|---|---|
| `loading` | the questionnaire (unchanged); nothing latched yet | none — see note |
| `!loading && userFinancialProfile != null` | **nothing** (`null`) | `router.replace('/dashboard')` |
| `!loading && userFinancialProfile == null` | the questionnaire, unchanged | none |
| profile becomes non-null *later*, while mounted | the questionnaire, unchanged | none — see below |

**Why latched, not live.** `store.tsx`'s `saveFinancialProfile` sets `userFinancialProfile`
**optimistically**, before its own upsert resolves — and `saveFinancialHealth` then awaits three more
writes (fixed costs, dimension weights, baseline snapshot). A guard that re-read the profile live
would see that optimistic write, decide "already answered", and blank the page for the remaining
round-trips, leaving the user staring at nothing after pressing "See my score". Latching keeps the
completion path exactly as spec 041/042 left it, which is what FR-011 requires.

**Note on `loading`**: `app/(app)/layout.tsx:157` renders `<RouteSkeleton />` while loading and
mounts `children` only afterwards, so this page never actually observes a loading state today. The
condition is read anyway so the guard cannot silently invert if that Shell gate is ever moved — a
`null` profile must mean "no profile", never "not yet fetched".

**Remount re-evaluates.** The latch lives for one mount. A user who completes the questionnaire and
then navigates back to it gets a fresh reading, sees their now-existing profile, and is bounced —
which is the correct answer for that visit.

**Render `null`, do not flash.** Rendering the five-step form for one frame before bouncing is the
kind of un-calm moment Principle II rules out. No "Redirecting…" copy is added either — it would need
five catalog entries to show a message for a single frame (research.md §6).

## What must NOT change

Restated because FR-011 bounds this feature to two seams, and this is one of them.

1. **Skip stays dismiss-only.** No profile is written, no `ortho.fhOnboardingDismissed` key is
   revived, and the user lands on `/dashboard`. Spec 042 removed the zero-income neutral-defaults
   write because it produced a misleading score from no data; this feature does not bring it back.
   (FR-007; pinned by the untouched `test/financial-health-onboarding.test.tsx:71`.)
2. **Completion is unchanged** — `form.submit()` then `router.replace('/dashboard')`.
3. **The stepper itself** — sections, order, the income-required gate, progress indicator, Back — is
   untouched. This feature adds a guard above the component's existing body and changes nothing
   inside it.
4. **The dashboard's unset state** stays honest: with no profile, `FinancialHealthBody` shows
   "Set up your financial profile" rather than a score derived from nothing. (FR-008 — already true;
   this feature must not disturb it.)

## Blast radius

`/welcome/financial-profile` has exactly one in-app entry point: the announcement CTA
(`components/announcements/registry.ts:49`), whose `isRelevant` is `userFinancialProfile == null`. So
the guard can never turn away a legitimate visitor — everyone it bounces already has the profile the
questionnaire collects. Two adjacent surfaces are deliberately **not** touched:

- `/settings/financial-profile` — the re-take route for users who *do* have a profile. A separate
  page; unaffected.
- The dashboard widget's unset state — plain text, no link (`FinancialHealthBody.tsx:68–75`).

## Test expectations

`web/test/onboarding/financial-profile-guard.test.tsx`

- profile present → renders no questionnaire heading, calls `router.replace('/dashboard')`
- profile present → `saveFinancialHealth` is never called
- profile present but still `loading` → does not navigate yet
- profile absent → renders the questionnaire, no navigation on mount
- profile appears *while mounted* → the questionnaire stays rendered and nothing navigates (the
  optimistic-write case above)
- profile absent → Skip still writes no profile and lands on `/dashboard` (FR-007 restated at the
  guard's seam)

`web/test/financial-health-onboarding.test.tsx` — **unchanged**, and must stay green. Its `useApp`
mock supplies `userFinancialProfile: null`, so it exercises the unguarded path by construction and
is the regression lock for points 1–3 above. (SC-006)

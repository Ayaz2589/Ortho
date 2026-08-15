# Implementation Plan: New-User Hand-Off to Financial Health

**Branch**: `feat/048-new-user-handoff` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/048-new-user-handoff/spec.md`

## Summary

Close the onboarding funnel: a visitor who travelled landing → tour → sign-in continues straight into
the financial-health questionnaire instead of landing on an empty dashboard. Everyone else keeps
today's behavior exactly.

Technically this is **two small seams and one new pure module**. A new
`web/lib/onboarding/handoff.ts` answers "where does this person go after signing in?" by consuming
the per-device funnel marker spec 045 shipped; `web/app/sign-in/page.tsx` calls it in place of its
hardcoded `'/dashboard'`. Because the sign-in screen renders outside `AppStateProvider` and cannot
read the financial profile, the "do they already have one?" check lives at the questionnaire's entry
instead — a mount guard in `web/app/(app)/welcome/financial-profile/page.tsx`. That split is the
crux of the design and is why FR-004 exists separately from FR-001.

**This is a deliberate, scoped reversal of spec 042**, which removed spec 041's hard redirect on
purpose. The reversal applies to funnel-walkers only. The blast radius is bounded by keeping every
041/042 test file untouched and green (SC-006) — if making this work required editing one of them,
the feature has grown too wide.

No database change, no migration, no new dependency, no new user-facing copy.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js **16.2.9** (App Router). Per
`web/AGENTS.md`, `useRouter().replace` semantics were read from
`web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`, not recalled.

**Primary Dependencies**: existing only — `next`, `react`, `@supabase/ssr`. Nothing added (FR-010).

**Storage**: `localStorage` only, and **no new key** — `ortho.onboardingFunnel` (045) and
`ortho.announcementsSeen` (042) both already exist with guarded accessors. No Supabase table, no
migration, no server state.

**Testing**: Vitest 4.1.8 + Testing Library, `npm test` from `web/`. Baseline on this branch before
implementation: **275 files, 2569 passed, 3 expected fail**. That number is the regression lock.

**Target Platform**: static export (`output: 'export'`) on Vercel, plus the same bundle wrapped by
Capacitor for iOS. The installed app never walks the web funnel, so it never sets the marker and its
sign-in behavior is unchanged — no native work.

**Project Type**: web application (single codebase, `web/`), per the Constitution's
one-canonical-implementation framing.

**Performance Goals**: none beyond "no regression". The hand-off adds two guarded `localStorage`
reads to a path that already awaits a network round-trip; it is not measurable.

**Constraints**: no middleware and no `redirects()` under static export — every routing decision is a
client effect. The sign-in screen must not gain a dependency on `lib/store`; the modules it newly
imports (`lib/onboarding/*`, `components/announcements/*`) are store-free, which was verified.

**Scale/Scope**: 1 new module, 2 modified files, 1 added export. 3 new test files. Roughly 30 lines
of production code — the smallest feature in the funnel, and deliberately so.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I. One Design System, Tokens Only** | PASS — vacuously. No markup, no styling, and no new component is added. The guard's redirecting state renders `null`. |
| **II. Calm Over Dense** | PASS, and it shapes one decision: the entry guard renders nothing rather than flashing a five-step questionnaire for a frame before bouncing. The hand-off itself is the calmer path — continuing a journey beats dropping someone on an empty dashboard. Nothing nags: the marker is consumed on use and the duplicate announcement is suppressed. |
| **III. Right Form Factor Per Canvas** | PASS. Routing only; identical on every canvas. The Capacitor shell is unaffected because no marker is ever set there. |
| **IV. Plainspoken Voice & Money Formatting** | PASS — vacuously. No copy is added (research.md §6) and no money is rendered. |
| **V. Accessible & Interaction-Complete** | PASS. No new interactive element. The guard is a navigation, not a dialog, so it introduces no focus or keyboard surface. |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | PASS. Every seam is developed test-first (RED → GREEN → refactor). No money or date math is touched, so `npm run gen:vectors` must produce no diff. The genuinely load-bearing discipline here is the *unchanged* 041/042 suite — this feature's correctness is defined as much by what stays green as by what turns green. |

**Post-Phase-1 re-check**: still passing. The one decision worth a second look — `lib/onboarding/`
importing from `components/announcements/` — has precedent in three existing files
(`lib/widgets/registry.tsx`, `lib/useDashboardRange.ts`, `lib/reports/months.ts`) and pulls in no
store dependency. No entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/048-new-user-handoff/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 8 resolved decisions
├── data-model.md        # Phase 1 — no DB change; the three state items consumed
├── quickstart.md        # Phase 1 — validation guide, incl. the regression lock
├── contracts/
│   ├── post-sign-in-handoff.md
│   └── questionnaire-entry-guard.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
web/
├── lib/
│   └── onboarding/
│       ├── funnel.ts                       # UNCHANGED (045) — this feature is its first reader
│       └── handoff.ts                      # NEW — resolvePostSignInRoute()
├── app/
│   ├── sign-in/page.tsx                    # MODIFIED — one line in verify()
│   └── (app)/welcome/financial-profile/
│       └── page.tsx                        # MODIFIED — profile entry guard
├── components/
│   └── announcements/
│       └── registry.ts                     # MODIFIED — export the id as a constant
└── test/
    └── onboarding/
        ├── handoff.test.ts                 # NEW — the decision module
        ├── sign-in-handoff.test.tsx        # NEW — the wiring, through the real form
        └── financial-profile-guard.test.tsx # NEW — the entry guard
```

**Structure Decision**: the existing `web/` layout is used unchanged. The new pure module joins
`lib/onboarding/` alongside 045's `funnel.ts`/`adoptLanguage.ts`, and its tests join
`test/onboarding/`, matching the convention 045 established. Nothing is added outside `web/` — no
Supabase function, no migration, no shared vector, no catalog entry.

**Files deliberately NOT in the tree above**: `test/sign-in.test.tsx`, `test/announcements/*`,
`test/financial-health-onboarding.test.tsx`, `test/widgets/financial-health.test.tsx`. They are the
041/042 regression lock and must not appear in the diff (SC-006).

## Implementation Phasing

Ordered so each user story is independently verifiable, per the spec's priorities. Fully TDD — the
failing test lands before the code that satisfies it, in that order, at every step.

1. **Foundational — the decision module.** `lib/onboarding/handoff.ts` plus the
   `FINANCIAL_HEALTH_ANNOUNCEMENT_ID` export on the registry. Pure and fully unit-testable in
   isolation; every FR except FR-004/007/008 is provable here before a component is touched.
   *(Delivers the mechanics of US1 and US2.)*
2. **US1 — the funnel newcomer continues.** Wire `resolvePostSignInRoute()` into `verify()`. One
   line, but it is the feature; it lands with a test that drives the real OTP form.
3. **US2 — everyone else is untouched.** Not new code — a verification step. Assert the no-marker
   path through the form, then run the whole 041/042 suite and confirm those files are absent from
   the diff. *This is the phase that proves the reversal did not leak, so it gets its own step
   rather than being folded into a final polish pass.*
4. **US3 — skipping is still honest.** The questionnaire entry guard (FR-004), plus tests pinning
   that Skip remains dismiss-only and the widget's unset state stays honest (FR-007/FR-008 — already
   true today; the tests exist so this feature cannot quietly undo them).
5. **Polish** — full suite against the 275-file baseline, `tsc --noEmit`, `gen:vectors` no-diff, and
   the docs sweep (`docs/web.md`'s onboarding section, `CLAUDE.md`'s active-feature block).

## Risks

| Risk | Mitigation |
|---|---|
| **The reversal leaks and undoes spec 042** — the single highest-severity failure in this feature. A guard keyed on profile absence instead of the funnel marker would hard-redirect every profile-less user, exactly what 042 deleted. | The decision reads *only* the marker; the profile is read only at the destination, never at sign-in. US2 gets its own implementation phase, and SC-006 forbids editing any 041/042 test — `git diff --stat` over those paths must be empty. |
| **A stale marker greets a returning user with a questionnaire.** | The marker is consumed on use, so the sign-out → different-user case has nothing left to fire on; the profile guard catches the abandoned-funnel case. Only the mount-`verify()` path is wired, not the already-signed-in bounce (research.md §2). The one residual case is documented and accepted (research.md §5). |
| **The zero-income profile comes back.** Reintroducing a hand-off invites "and Skip should save neutral defaults", which produced a misleading score and is why 042 made Skip dismiss-only. | FR-007/FR-008 are restated in the guard contract, and `test/financial-health-onboarding.test.tsx:71` (untouched) fails loudly if a profile is written on Skip. |
| **The user is asked twice** — handed to the questionnaire, then offered the same thing by the announcement. | The hand-off marks the announcement seen at the moment it fires, so the suppression holds whether the user completes, skips, or abandons mid-flow (research.md §4). |
| **The questionnaire flashes before the guard bounces.** | The guard returns `null` while redirecting rather than rendering the form behind an effect. |
| **Sign-in gains weight or a store dependency**, regressing the signed-out first paint. | Verified: neither `registry.ts` nor `announcementsSeen.ts` imports `lib/store`; both are guarded-`localStorage` modules of a few dozen lines. |
| **Stacked on unmerged work.** This branch sits on spec 045 (PR #108), not on `main`. | PR #111 targets `docs/onboarding-funnel-plan` deliberately. The feature touches no file 045 is still changing, so a rebase onto `main` after 045 merges should be clean. |

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

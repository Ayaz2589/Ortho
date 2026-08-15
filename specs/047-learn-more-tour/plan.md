# Implementation Plan: Learn-More Tour

**Branch**: `feat/047-learn-more-tour` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/047-learn-more-tour/spec.md`

## Summary

A short, skippable, five-screen tour at `/tour/{locale}` for all six funnel languages, sitting
between the landing page and sign-in. Each screen describes one thing Ortho genuinely does today.
Both the finish CTA **and** Skip route through a single shared exit that adopts the page's
language, records the funnel marker spec 048 reads, and navigates to sign-in — so skipping cannot
silently cost the visitor the guided hand-off.

Technically it is one thin server component (`app/tour/[locale]/page.tsx`, mirroring 045's landing
route: `generateStaticParams` from the locale registry, `dynamicParams = false`, per-locale
metadata) rendering one client component that holds the whole deck in `useState`. Screens are
client state, never routes — six locales × five screens would be thirty static documents under
`output: 'export'` for no benefit. Copy lives strictly inside the `spec 047` reserved region of
`lib/i18n/landing/*.ts`, as a sibling named export so nothing outside the markers is touched and
spec 046 can merge in either order.

No database change, no migration, no new runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.9 (App Router, `output: 'export'`)

**Primary Dependencies**: `next`, `react`, `@capacitor/core` (native guard only). **No new
dependency** (FR-013). Existing 045 modules consumed as-is: `lib/onboarding/locales.ts`,
`funnel.ts`, `adoptLanguage.ts`.

**Storage**: None. The only persistence is the per-device `ortho.onboardingFunnel` localStorage
key, already owned by `lib/onboarding/funnel.ts`. No DB, no migration.

**Testing**: Vitest 4 + Testing Library (`npm test` in `web/`), jsdom per-file via
`// @vitest-environment jsdom`. Baseline on this branch: 275 files / 2569 passing.

**Target Platform**: Signed-out web, phone → ultrawide desktop. Explicitly **excluded** from the
Capacitor iOS shell (FR-011).

**Project Type**: Web application (`web/`, Next.js App Router).

**Performance Goals**: First paint already in the visitor's language, no English flash (FR-008 /
SC-004). Pre-auth bundle discipline: no `lib/store`, no Supabase client, no 32–55 KB app catalog,
no `components/ui` (which transitively imports the store — research §8).

**Constraints**: Static export — no server, no middleware, no redirects, no `useSearchParams`
without a Suspense boundary (045 research §1–5; 047 research §2). Constitution: tokens only, calm
voice, `prefers-reduced-motion` respected, ≥44 px touch targets, visible focus ring.

**Scale/Scope**: 5 screens × 6 locales = 30 title/body pairs plus 5 control labels per locale.
~4 new source files, ~6 catalog edits, 1 narrowed assertion in an existing 045 test.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. One Design System, Tokens Only** | No new colors, no ad-hoc sizes. Reuses `--text`/`--bg`/`--text-2`/`--hairline` and `PrimaryButton`'s recipe. | ✅ Pass — research §8 duplicates the *recipe*, not the palette. |
| **II. Calm Over Dense** | No gradients, illustrations, or emoji in chrome. | ✅ Pass — the spec's own Assumptions call illustrations "optional and likely unnecessary"; the design ships none. Typographic only. |
| **III. Right Form Factor Per Canvas** | Swipe on touch, keys + click on desktop; content capped and centered. | ✅ Pass — US2 *is* this principle. Reading width capped at 560px per the responsive contract. |
| **IV. Plainspoken Voice & Money Formatting** | Second-person, no hard sell; money reads as money and loss is never red. | ✅ Pass — US3 is a hard requirement. The design shows **no example money at all** (research: the cheapest way to satisfy US3 scenario 3 is to have no amounts to format). |
| **V. Accessible & Interaction-Complete** | Real controls, DOM-order keyboard reach, visible focus ring, ≥44 px targets, reduced motion. | ✅ Pass — all controls are `<button>`; position exposed to assistive tech as text, not colored dots alone; reduced motion inherited from the global CSS reset (research §5). |
| **VI. Test-Driven & Regression-Safe** | Failing test first; `npm test` green; behavior via accessible DOM. | ✅ Pass — every task below is RED→GREEN. No money/date math in this feature, so no golden vectors apply. |

**Additional constraints**: no new dependency ✅; no DB change ✅; responsive 0–639 / 640–1023 /
1024+ honored ✅; `iOS/Ortho-iOS/` untouched ✅.

**Post-Phase-1 re-check**: unchanged — no violation appeared during design. Complexity Tracking
is empty.

## Project Structure

### Documentation (this feature)

```text
specs/047-learn-more-tour/
├── plan.md              # This file
├── spec.md              # Pre-existing (scaffolded)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── tour-contracts.md
├── checklists/
│   └── requirements.md  # Pre-existing
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── app/
│   └── tour/
│       └── [locale]/
│           └── page.tsx            NEW — server component: generateStaticParams,
│                                   dynamicParams=false, per-locale metadata (noindex)
├── components/
│   └── tour/
│       └── TourDeck.tsx            NEW — the client component: deck state, swipe,
│                                   keys, position, Skip/Back/Next/Finish
├── lib/
│   ├── onboarding/
│   │   └── tour.ts                 NEW — pure: clampScreen, nextScreen, prevScreen,
│                                   swipeIntent, formatPosition
│   └── i18n/
│       └── landing/
│           ├── tour.ts             NEW — TourCopy type + TOUR_CATALOGS registry
│           ├── en.ts               EDIT — copy inside the spec 047 region only
│           ├── es.ts               EDIT — "
│           ├── bn.ts               EDIT — "
│           ├── ja.ts               EDIT — "
│           ├── zh.ts               EDIT — "
│           └── ko.ts               EDIT — "
└── test/
    ├── onboarding/
    │   ├── tour-logic.test.ts      NEW — the pure module
    │   ├── tour-route.test.tsx     NEW — static params, metadata, module-graph guard
    │   └── tour-deck.test.tsx      NEW — US1/US2 behavior, native guard, exit contract
    └── i18n/
        ├── tour-catalogs.test.ts   NEW — six-locale coverage, script, arity, region
        └── landing-catalogs.test.ts  EDIT — one assertion narrowed to the 046 region

docs/web.md                         EDIT — §2 route tree + the "only server component" line
```

**Structure Decision**: Standard Next.js App Router layout, matching spec 045 exactly — a route
folder under `web/app/`, its client body under `web/components/`, pure logic under `web/lib/`, and
tests mirroring that tree under `web/test/`. The one deliberate departure from 045 is that the
tour's *pure* logic (index clamping, swipe intent, position formatting) is split into
`lib/onboarding/tour.ts` rather than living in the component: it is the part with real edge cases
(first/last screen, sub-threshold and diagonal swipes), and Principle VI wants that pinned by fast
node tests rather than exercised only through the DOM.

## Implementation approach

Four TDD layers, each RED before GREEN, in dependency order:

1. **Pure logic** (`lib/onboarding/tour.ts`) — no React, node-environment tests. Establishes
   clamping and swipe-intent semantics before any component depends on them.
2. **Catalogs** (`lib/i18n/landing/tour.ts` + six region edits) — the guard test comes first and
   fails on the missing registry, then on each missing/untranslated locale.
3. **Client deck** (`components/tour/TourDeck.tsx`) — the US1/US2 acceptance scenarios as jsdom
   tests: advance/back by click, key and swipe; position visible; Skip on every screen; the
   native guard; and the exit contract (adopt → mark → navigate) asserted for **both** exits.
4. **Route** (`app/tour/[locale]/page.tsx`) — static params, per-locale metadata, noindex, and the
   module-graph guard that keeps the store and app catalogs out.

Then the two documentation/regression edits: narrow the 045 region assertion, and refresh
`docs/web.md` §2 (the tour is the second server component).

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

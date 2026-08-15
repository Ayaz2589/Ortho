---

description: "Task list for spec 047 — learn-more tour"
---

# Tasks: Learn-More Tour

**Input**: Design documents from `/specs/047-learn-more-tour/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/tour-contracts.md)

**Tests**: **Required.** Constitution Principle VI is NON-NEGOTIABLE — a failing test describes the
intended behavior before the code that satisfies it. Every implementation task below is preceded by
the test task that must be RED first.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `US1` / `US2` / `US3` from spec.md
- Paths are relative to the repository root

## Path Conventions

This is the `web/` Next.js App Router application. Routes under `web/app/`, client components under
`web/components/`, pure logic under `web/lib/`, tests mirroring that tree under `web/test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the suite runnable and record the pre-feature baseline.

- [x] T001 Install dependencies with `npm install` in `web/` (the sandbox clone ships without `node_modules`)
- [x] T002 Record the pre-feature baseline by running `npm test` in `web/` and noting the file/test counts — the number every later run is compared against

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure logic and content model every user story renders through. Nothing in Phase 3+
can be written until the deck has semantics and copy.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Pure deck logic

- [x] T003 Write failing tests for the pure deck helpers in `web/test/onboarding/tour-logic.test.ts`: `clampScreen` (in-range, negative, over-range, fractional, `NaN`, `Infinity`, `total<=0`), `nextScreen`/`prevScreen` saturating at the ends rather than wrapping, `swipeIntent` (left past threshold → `'next'`, right past threshold → `'prev'`, sub-threshold → `'none'`, vertical-dominant diagonal → `'none'`, exactly-at-threshold boundary), and `formatPosition` substituting `{0}`/`{1}` — asserting against the exported `SWIPE_THRESHOLD_PX`, never a re-stated `44`
- [x] T004 Implement `web/lib/onboarding/tour.ts` to green: `SWIPE_THRESHOLD_PX`, `clampScreen`, `nextScreen`, `prevScreen`, `swipeIntent`, `formatPosition`. Pure — no React, DOM, storage or clock imports

### Content model and catalogs

- [x] T005 Write failing tests in `web/test/i18n/tour-catalogs.test.ts` covering `TOUR_CATALOGS`: one entry per `landingSlugs()` (registry alignment), `screens.length === TOUR_SCREEN_COUNT` for every locale, every string non-blank, no non-English catalog reusing an English string, `bn`/`ja`/`zh`/`ko` written in their own script, `position` carrying both `{0}` and `{1}` in every locale, and `tourCatalog()` falling back to English for an unknown slug
- [x] T006 Add a source-text assertion to `web/test/i18n/tour-catalogs.test.ts` proving FR-009: in each `web/lib/i18n/landing/{slug}.ts` the tour export lies strictly **between** the `spec 047` markers, and the `spec 046` region is still empty
- [x] T007 Implement `web/lib/i18n/landing/tour.ts`: the `TourScreen`/`TourCopy` interfaces, `TOUR_SCREEN_COUNT = 5`, the statically-imported `TOUR_CATALOGS` map and `tourCatalog()`. Do **not** touch `web/lib/i18n/landing/index.ts` or the `LandingCatalog` interface — that is what keeps spec 046's merge surface at zero (research §3)
- [x] T008 Add the English tour copy as a named export inside the `spec 047` region of `web/lib/i18n/landing/en.ts`, using the five screens in `data-model.md` §3 verbatim
- [x] T009 [P] Add the Spanish translation inside the `spec 047` region of `web/lib/i18n/landing/es.ts`
- [x] T010 [P] Add the Bengali translation inside the `spec 047` region of `web/lib/i18n/landing/bn.ts`
- [x] T011 [P] Add the Japanese translation inside the `spec 047` region of `web/lib/i18n/landing/ja.ts`
- [x] T012 [P] Add the Simplified Chinese translation inside the `spec 047` region of `web/lib/i18n/landing/zh.ts`
- [x] T013 [P] Add the Korean translation inside the `spec 047` region of `web/lib/i18n/landing/ko.ts`
- [x] T014 Narrow the `'leaves both regions empty on delivery'` assertion in `web/test/i18n/landing-catalogs.test.ts` to the **046** region only, with a comment recording that this encoded spec 045's FR-025 and that 047 filling its own region is the marker mechanism working as designed (research §4)
- [x] T014a Narrow the `'has exactly one catalog file per registry slug'` assertion in the same file to exclude `tour.ts` **by name** alongside `index.ts`, so it stays a one-file-per-slug check rather than a file count. These two are the only changes permitted in that file
- [x] T014b Narrow spec 045's FR-019 guard in `web/test/onboarding/funnel.test.ts` — `'is imported by no production module'` becomes `'is set by the tour and by nothing else'`, naming `components/tour/TourDeck.tsx` as the one permitted caller — and add a companion case asserting `readFunnelEntry`/`clearFunnelEntry` still have no production caller, since that half of FR-019 belongs to spec 048. (This guard is *supposed* to fail here: 047 is the feature it was waiting for.)
- [x] T015 Re-run `npm test -- test/i18n/landing-catalogs.test.ts` and confirm the byte-budget guard still passes with six populated catalogs; if the total has crossed 30,000 bytes, raise the bound deliberately in the same commit with the measured figure in the comment

**Checkpoint**: `npm test -- test/onboarding/tour-logic.test.ts test/i18n/tour-catalogs.test.ts test/i18n/landing-catalogs.test.ts` is green. The deck has semantics and six languages of honest copy, and nothing renders yet.

---

## Phase 3: User Story 1 — A visitor sees what Ortho does before signing up (P1) 🎯 MVP

**Goal**: Five screens in the visitor's language, an advance path to sign-in, a Skip on every
screen, and the funnel marker recorded on **both** exits.

**Independent Test**: Walk all screens in one language and confirm arrival at `/sign-in`; then skip
from the first screen and confirm the same destination — with `ortho.onboardingFunnel` set in both
cases.

### Tests (RED first)

- [x] T016 [US1] Write failing behavior tests in `web/test/onboarding/tour-deck.test.tsx` for the render contract: the deck renders the first screen's title as an `<h1>`, exposes a `role="region"` named from `copy.regionLabel`, marks the subtree with the locale's BCP-47 `lang`, and shows a Skip control on **every** screen (loop all five)
- [x] T017 [US1] Add failing tests in `web/test/onboarding/tour-deck.test.tsx` for advancing: clicking Next moves through screens 1→5, the last screen offers Finish instead of Next, and clicking Finish navigates to `/sign-in`
- [x] T018 [US1] Add the **FR-006 pair** to `web/test/onboarding/tour-deck.test.tsx` — the assertions the spec's checklist flags as most likely to be inverted: finishing calls `markFunnelEntry()` **and** skipping calls `markFunnelEntry()`, each also calling `adoptLandingLanguage(slug)` and landing on `/sign-in`. Assert skip-from-screen-1 and skip-from-a-middle-screen
- [x] T019 [US1] Add a failing test in `web/test/onboarding/tour-deck.test.tsx` that the deck still navigates when the marker cannot be written (mock `markFunnelEntry` to throw) — the spec's "storage unavailable" edge case: the visitor always reaches sign-in
- [x] T020 [US1] Add a failing test in `web/test/onboarding/tour-deck.test.tsx` for the native guard (FR-011), mocking `@capacitor/core` per 045 research §6: on native the deck renders nothing and replaces to `/dashboard`; assert no screen title is ever in the DOM
- [x] T021 [US1] Add failing tests in `web/test/onboarding/tour-deck.test.tsx` that each of the five non-English locales renders its own copy and **not** the English string (FR-008 / SC-004)
- [x] T022 [P] [US1] Write failing route tests in `web/test/onboarding/tour-route.test.tsx`: `generateStaticParams()` returns exactly one param per registry slug, `dynamicParams === false`, and the page renders the correct locale's first screen for each of the six slugs
- [x] T023 [P] [US1] Add failing metadata tests to `web/test/onboarding/tour-route.test.tsx`: a per-locale `title`, distinct across locales, and `robots` set to `{ index: false, follow: true }` (research §7)
- [x] T024 [P] [US1] Add the failing module-graph guard to `web/test/onboarding/tour-route.test.tsx` over `app/tour/[locale]/page.tsx`, `components/tour/TourDeck.tsx`, `lib/onboarding/tour.ts` and `lib/i18n/landing/tour.ts`: none may import `@/lib/store`, `@/lib/supabase/client`, `@/lib/i18n/{bn,es,ja,zh,ko}` or `@/components/ui` (contracts §3)

### Implementation (GREEN)

- [x] T025 [US1] Implement `web/components/tour/TourDeck.tsx` to green: `useState` index, the native guard as the first effect returning `null` until checked, the current screen's title/body, and the Next/Finish/Skip controls as real `<button>`s. Tokens only — reuse `PrimaryButton`'s recipe (`h-12 rounded-full`, `background: var(--text)`, label in `var(--bg)`) **without** importing `@/components/ui` (research §8)
- [x] T026 [US1] Implement the single `leaveForSignIn()` exit inside `TourDeck.tsx` — `adoptLandingLanguage(slug)` → `markFunnelEntry()` → `router.push('/sign-in')` — and wire **both** Finish and Skip to it, so Skip has no path of its own to forget (data-model §2)
- [x] T027 [US1] Implement `web/app/tour/[locale]/page.tsx`: `generateStaticParams()` from `landingSlugs()`, `dynamicParams = false`, `generateMetadata()` with the per-locale title and `robots: { index: false, follow: true }`, and `notFound()` for an unresolvable slug — mirroring `app/landing/[locale]/page.tsx`

**Checkpoint**: US1 is independently deliverable. `/tour/{locale}` works end to end in all six
languages, both exits reach sign-in, and both record the marker.

---

## Phase 4: User Story 2 — Moving through the tour feels natural on any device (P2)

**Goal**: Swipe on touch, arrow keys on desktop, visible position, working Back, suppressed motion
under `prefers-reduced-motion`.

**Independent Test**: Complete the tour using only touch, then only the keyboard, then only clicks.

### Tests (RED first)

- [x] T028 [US2] Add failing tests in `web/test/onboarding/tour-deck.test.tsx` for keyboard control: `ArrowRight` advances, `ArrowLeft` goes back, `ArrowLeft` on the first screen is a no-op, and `ArrowRight` on the last does **not** wrap or exit
- [x] T029 [US2] Add failing swipe tests in `web/test/onboarding/tour-deck.test.tsx` driving `fireEvent.touchStart`/`touchEnd`: a left swipe past the threshold advances, a right swipe goes back, a sub-threshold drag does nothing, and a vertical-dominant diagonal does nothing (so page scroll is never stolen)
- [x] T030 [US2] Add failing tests in `web/test/onboarding/tour-deck.test.tsx` for position and Back: the position text is present on every screen and reflects the current index via `copy.position`, Back is absent on the first screen and present thereafter, and going back shows the previous screen's content
- [x] T031 [US2] Add failing reduced-motion tests to `web/test/onboarding/tour-deck.test.tsx`: the screen wrapper carries **no** `transition`/`animate` class (screens swap instantly, so there is nothing to suppress), every control carries `motion-reduce:transition-none` for its press feedback, and `web/app/globals.css` still ships the global `prefers-reduced-motion` reset the tour inherits (research §5)
- [x] T032 [US2] Add a failing test in `web/test/onboarding/tour-deck.test.tsx` that every control is a real `<button>` reachable in DOM order — Back before Next/Finish before Skip — so keyboard traversal matches reading order (Principle V)

### Implementation (GREEN)

- [x] T033 [US2] Add the keyboard handler to `web/components/tour/TourDeck.tsx` — a `window` `keydown` listener routing `ArrowRight`/`ArrowLeft` through `nextScreen`/`prevScreen`, cleaned up on unmount
- [x] T034 [US2] Add `onTouchStart`/`onTouchEnd` to the deck element in `web/components/tour/TourDeck.tsx`, deciding intent with `swipeIntent(dx, dy)` and clearing the recorded start point on every end
- [x] T035 [US2] Add the position indicator and Back control to `web/components/tour/TourDeck.tsx`: position rendered as **text** via `formatPosition(copy.position, index + 1, total)` with decorative `aria-hidden` dots alongside — never color alone (Principle I) — and Back hidden on the first screen
- [x] T036 [US2] Settle motion in `web/components/tour/TourDeck.tsx`: give the screen content **no** transition or animation (calmer, and never mid-animation on arrival), and put `motion-reduce:transition-none` on the controls, whose press feedback is real. CSS only — no `requestAnimationFrame`, no animation library, nothing that escapes the global reduced-motion reset

**Checkpoint**: US1 + US2 both work. The tour is completable by touch alone, keyboard alone, or
clicks alone.

---

## Phase 5: User Story 3 — The tour is honest about the product (P2)

**Goal**: Every screen's claim maps to a feature that ships today, in the product's plain, calm
voice.

**Independent Test**: Check each screen's claim against a shipped feature.

- [x] T037 [US3] Add a failing content-honesty test to `web/test/i18n/tour-catalogs.test.ts` asserting the English deck contains **no currency-formatted amount** in any screen — the cheapest way to satisfy US3 scenario 3 is to have no amounts to format (data-model §3)
- [x] T038 [US3] Verify each of the five screens against the shipped feature backing it, using the evidence table in `data-model.md` §3 (`lib/splits.ts`; `app/(app)/planning/`; `lib/finance/financialHealth.ts`; `lib/finance/routines.ts`; `lib/language.ts` + `is_household_member` policies), and correct any claim that has drifted
- [x] T039 [US3] Review the six catalogs for voice against Constitution Principle IV — second-person, plainspoken, no superlatives, no urgency, no hard sell — and confirm screen 3 still states no dimension **count** (the engine went from five to six in spec 044; a number would rot)

**Checkpoint**: All three user stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T040 Run the full suite with `npm test` in `web/` and confirm the count is the T002 baseline plus this feature's additions, with **zero** pre-existing tests broken (SC-007)
- [x] T041 [P] Run `npx tsc --noEmit` in `web/` and clear any type error
- [x] T042 Run `npm run build` in `web/` and confirm `out/tour/` contains exactly six documents — one per locale, not thirty (the assumption the whole client-state design rests on) — and that a built page carries `noindex`
- [x] T043 [P] Update `docs/web.md` §2: add `tour/[locale]/` to the route tree, and correct the section heading's "all `'use client'` except the landing route" — the tour route is the codebase's second server component
- [x] T044 [P] Update the spec-047 bullet in `docs/plan/onboarding-funnel.md` to record what was actually built, matching how the 045 entry was reconciled after it shipped
- [ ] **T045 — NOT DONE, operator-pending.** Walk `quickstart.md` §4 in a browser: the six-language no-flash check, the Skip-sets-the-marker check in DevTools → Local Storage, Back-does-not-trap, reduced-motion, 360 px wrapping with the longest translations, and 1440 px capped width. **This sandbox has no browser**, so it cannot be claimed. What *was* verified headlessly, and how far it goes:
  - *No English flash* — the built `out/tour/es.html` was inspected: it carries the Spanish title and the Spanish body copy, and contains zero occurrences of the English string. The first painted frame is therefore correct by construction, not by timing. This is stronger evidence than a visual check would be.
  - *Six documents, not thirty* — `out/tour/` contains exactly `en|es|bn|ja|zh|ko`.
  - *`noindex`* — `out/tour/es.html` carries `<meta name="robots" content="noindex, follow">`, and `out/sitemap.xml` has no `/tour` entry.
  - *Skip sets the marker* — asserted in `tour-deck.test.tsx` from the first, a middle and the last screen. The DevTools check would confirm the same thing one layer down.
  - **Genuinely unverified**: physical swipe feel, and text wrapping at 360 px with the longest Bengali/Japanese strings. The controls were laid out to pair Back and Skip on one row specifically to reduce that risk, but it is a judgement, not a measurement.
- [x] T046 Commit, push to `feat/047-learn-more-tour`, and mark PR #110 ready for review

---

## Dependencies

```text
Phase 1 (Setup)
   │
Phase 2 (Foundational) ── T003→T004 (logic) ── T005,T006→T007→T008→T009..T013 (catalogs) ── T014,T015
   │                                    ▲                                          │
   │                                    └─────── blocks everything below ──────────┘
   ├──────────────► Phase 3 / US1 (P1)  T016..T024 (RED) → T025..T027 (GREEN)   🎯 MVP
   │                          │
   │                          ▼  (US2 extends the component US1 creates)
   ├──────────────► Phase 4 / US2 (P2)  T028..T032 (RED) → T033..T036 (GREEN)
   │
   └──────────────► Phase 5 / US3 (P2)  T037..T039   — depends only on Phase 2's catalogs
                              │
                              ▼
                     Phase 6 (Polish)  T040..T046
```

**Story independence**:

- **US1** depends only on Phase 2. It is the MVP and ships alone.
- **US2** edits the component US1 creates, so it follows US1 — the spec says as much ("the content
  must exist before the interaction can be judged").
- **US3** is a content story over Phase 2's catalogs. It does **not** depend on US1 or US2 and can
  run in parallel with either.

## Parallel execution examples

**Phase 2 — the five translations** (T009–T013): different files, no shared state.

```text
T009 es.ts   ┐
T010 bn.ts   │
T011 ja.ts   ├── all [P], after T008 establishes the English source
T012 zh.ts   │
T013 ko.ts   ┘
```

**Phase 3 — route tests vs deck tests**: T022/T023/T024 all touch
`tour-route.test.tsx` while T016–T021 touch `tour-deck.test.tsx`. The two files are independent,
so the route and deck test suites can be written in parallel. Within a file, tasks are sequential.

**Phase 5 and Phase 3/4**: US3 is pure content review over files US1/US2 do not edit, so it runs
alongside either.

**Phase 6**: T041 (typecheck), T043 and T044 (docs) are independent of each other and of T040.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That is a working, six-language, five-screen tour
whose two exits both reach sign-in and both record the funnel marker — the feature's entire reason
for existing. It is shippable without US2 (the deck would advance by click only) and without US3's
review pass.

**Increment 2 = Phase 4 (US2)** makes it feel right on a phone and a keyboard.

**Increment 3 = Phase 5 (US3)** is the honesty audit, which is fast because the copy was written
against the evidence table from the start.

Every phase ends at a checkpoint where `npm test` is green. Work strictly RED → GREEN → refactor:
no implementation task above may be started before its paired test task is failing for the right
reason.

## Requirements coverage

| Requirement | Covered by |
|---|---|
| FR-001 per-language address | T022, T027 |
| FR-002 at most five screens | T005, T007 |
| FR-003 shipped capabilities only | T037, T038 |
| FR-004 skip on every screen | T016 |
| FR-005 both exits reach sign-in | T017, T018 |
| FR-006 both exits record the marker | **T018**, T026 |
| FR-007 touch + keyboard + position | T028–T030, T033–T035 |
| FR-008 own language on first paint | T021, T007 (static import) |
| FR-009 copy only in the reserved region | T006, T008–T013 |
| FR-010 no signed-in data layer | T024 |
| FR-011 never in the installed app | T020, T025 |
| FR-012 tokens + reduced motion | T031, T036, T025 |
| FR-013 no DB change, no new dependency | T041, T042 (nothing added to `package.json`) |
| SC-001 under 60 seconds | T045 |
| SC-002 marker set on finish **and** skip | T018 |
| SC-003 touch / keyboard / clicks alone | T028–T032 |
| SC-004 no English flash | T021, T045 |
| SC-005 zero aspirational claims | T038 |
| SC-006 never inside the installed app | T020 |
| SC-007 existing suite and iOS build unchanged | T040, T042 |

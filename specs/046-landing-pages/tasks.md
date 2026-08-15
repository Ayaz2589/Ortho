---

description: "Task list for spec 046 — per-language landing pages"
---

# Tasks: Per-Language Landing Pages

**Input**: Design documents from `/specs/046-landing-pages/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/landing-page.md](./contracts/landing-page.md),
[quickstart.md](./quickstart.md)

**Tests**: REQUIRED. This feature is built fully test-first per Constitution VI — every unit gets a
failing test (RED) before the code that satisfies it (GREEN). Tasks are labelled **RED** or **GREEN**
so the discipline is visible in the task list itself, not just in the commit history.

**Organization**: grouped by user story. Every phase boundary must leave the repository green —
`npx tsc --noEmit` clean and `npm test` passing — with the single, deliberate exception of a RED task,
whose whole purpose is to fail until its GREEN partner lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different file, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3, mapping to the spec's user stories

## Path Conventions

All paths are relative to `web/` unless stated otherwise. Run every command from `web/`.

---

## Phase 1: Setup (the catalog contract, RED)

**Purpose**: state the copy contract as failing tests before any copy or type exists. Nothing in this
phase compiles into a shipping change — it is the specification of §K1–K8 in
[contracts/landing-page.md](./contracts/landing-page.md), executable.

- [X] T001 Confirm the baseline is green before touching anything: run `npm ci` then `npm test` in `web/` and record that 275 files pass. A feature that starts from an unknown baseline cannot prove it broke nothing.
- [X] T002 **RED** Extend `test/i18n/landing-catalogs.test.ts`: replace the `KEYS` list's `placeholderLine` with the new copy surface, so the existing "defines every key, none blank", "leaves no English string in a non-English catalog" and "writes each catalog in a script plausible for its language" guards all cover `landing.headline`, `landing.subhead`, every `points[].title`/`points[].body`, `landing.primaryCta`, `landing.secondaryPrompt` and `landing.secondaryCta`. Fails: `landing` does not exist.
- [X] T003 **RED** Add to `test/i18n/landing-catalogs.test.ts` a guard that every locale's `landing.points` is a non-empty array of `{title, body}` objects (data-model §1 validation rules). Fails for the same reason.
- [X] T004 **RED** Narrow the "leaves both regions empty on delivery" test in `test/i18n/landing-catalogs.test.ts` to assert only the **`spec 047`** region is empty, and add an assertion that the `spec 046` region is now **non-empty** in all six files. Keep the marker-presence, marker-ordering and blank-gap tests untouched — spec 047 depends on them (contract §K4). Fails: the 046 regions are still empty.

**Checkpoint**: `npx vitest run test/i18n/landing-catalogs.test.ts` fails with clear, expected
failures naming the missing copy. `npm test` is otherwise unchanged.

---

## Phase 2: Foundational (the copy itself, GREEN) — BLOCKS ALL USER STORIES

**Purpose**: give all six locales their real words, typed and guarded. Every user story below reads
this copy, so nothing else can start until it exists.

**Why the placeholder is edited rather than deleted here**: removing `placeholderLine` (research §4)
breaks `LandingPlaceholder.tsx`, which still renders it. Pointing the placeholder at the new headline
in this phase keeps `tsc` clean at the phase boundary; US1 deletes the file outright.

- [X] T005 **GREEN** In `lib/i18n/landing/index.ts`: add the `LandingPoint` and `LandingCopy` interfaces exactly as specified in [data-model.md](./data-model.md) §1, add the required `landing: LandingCopy` field to `LandingCatalog`, and remove `placeholderLine`. Document on `points` *why* it is an array (US3 acceptance scenario 2) — the next person to touch this file must not "simplify" it to numbered keys.
- [X] T006 **GREEN** Write the English copy in `lib/i18n/landing/en.ts` inside the `spec 046` markers: `landing` with headline, subhead, three `{title, body}` points, `primaryCta`, `secondaryPrompt`, `secondaryCta`; restructure the file to the shape in data-model §2 (`base` declaration, region, region, composed `export default`). Also rewrite `metaTitle`/`metaDescription` to match the new proposition (FR-012). Every claim must trace to a shipped feature per research §9 — no price, no user count, no security claim, no competitor comparison.
- [X] T007 [P] **GREEN** Same for `lib/i18n/landing/es.ts`. Use the app catalog's existing translation for shared terminology (`lib/i18n/es.ts` renders "Sign in" as "Iniciar sesión") so the funnel and the app do not disagree with each other.
- [X] T008 [P] **GREEN** Same for `lib/i18n/landing/bn.ts` ("Sign in" → "সাইন ইন").
- [X] T009 [P] **GREEN** Same for `lib/i18n/landing/ja.ts` ("Sign in" → "サインイン").
- [X] T010 [P] **GREEN** Same for `lib/i18n/landing/zh.ts` ("Sign in" → "登录").
- [X] T011 [P] **GREEN** Same for `lib/i18n/landing/ko.ts` ("Sign in" → "로그인").
- [X] T012 **GREEN** Point `components/landing/LandingPlaceholder.tsx` at `copy.landing.headline` instead of the removed `copy.placeholderLine`. One line; the file is deleted in T017.
- [X] T013 [P] **GREEN** Retarget the three spec-045 tests that referenced `placeholderLine` at `landing.headline` — `test/onboarding/landing-route.test.tsx` (3 assertions), `test/onboarding/landing-index.test.tsx` (1), `test/onboarding/root-router.test.tsx` (1). These tests were always asserting "this locale's own words, not English"; only the key they read changes.

**Checkpoint**: `npm test` green, `npx tsc --noEmit` clean. Each entry point still shows the 045
placeholder layout, but now headlined with its real proposition. **Phase 1's RED tests are now
green** — the copy contract holds.

---

## Phase 3: User Story 1 — A newcomer understands what Ortho is (P1) 🎯 MVP

**Goal**: each entry point presents the proposition, one prominent action to the tour, and one
quieter sign-in link — in its own language, with either action adopting that language.

**Independent test**: open all six entry points; confirm proposition, primary action and sign-in link
are present, in that language, ordered by visual weight; click each action and confirm both the
destination and the stored language.

- [X] T014 **RED** Create `test/onboarding/landing-view.test.tsx` (`// @vitest-environment jsdom`) pinning contract §1 C1–C5 and C11: renders the headline, the subhead and every point in array order; contains exactly two interactive elements; the primary anchor's `href` is `/tour/{slug}` and the sign-in anchor's is `/sign-in`; the primary precedes the sign-in link in DOM order; both are real `<a href>`. Fails: `LandingView` does not exist.
- [X] T015 **RED** Add to `test/onboarding/landing-view.test.tsx` the adopt-on-act pair (C6/C7, FR-003/FR-004) — the sharpest assertion in the feature: rendering leaves `localStorage.getItem('language')` null; clicking the primary action sets it to the locale's `Language` (e.g. `日本語`); clicking the sign-in link does the same. Assert the stored value is the `Language`, never the slug. Fails for the same reason.
- [X] T016 **RED** Update `test/onboarding/landing-route.test.tsx`: invert "ships no interactive controls yet — CTAs arrive with 046" into an assertion that the route renders exactly two anchors with the expected hrefs, retarget the `LandingPlaceholder` describe block at `LandingView` (keeping the `lang`-attribute and document-`lang` restore tests, contract C8), and swap `components/landing/LandingPlaceholder.tsx` for `components/landing/LandingView.tsx` in the module-graph guard's file list (C9).
- [X] T017 **GREEN** [US1] Create `components/landing/LandingView.tsx` and delete `components/landing/LandingPlaceholder.tsx`. Client component. Props `{ locale, copy }` unchanged from the placeholder. Carries over the document-`lang` effect and the `lang` subtree marker verbatim — that behavior is inherited, not reinvented. Renders wordmark, `<h1>` headline, subhead, the two actions, then the points mapped in order. Both actions are plain `<a href>` with `onClick={() => adoptLandingLanguage(locale.slug)}` — no `preventDefault`, no `next/link`, no `router.push` (research §2). Imports nothing from `lib/store`, the app catalogs, `lib/supabase/client`, or `components/ui.tsx`.
- [X] T018 **GREEN** [US1] Swap the render in `app/landing/[locale]/page.tsx` from `LandingPlaceholder` to `LandingView`. This is the only line that changes in the route — `generateStaticParams`, `dynamicParams` and `generateMetadata` are inherited and must not be restructured (contract §2).

**Checkpoint**: US1 is independently deliverable. All six entry points are real marketing pages;
`npm test` green; `npx tsc --noEmit` clean.

---

## Phase 4: User Story 2 — The page reads as Ortho, on any screen (P2)

**Goal**: the page looks like the product it introduces and is legible from a 320px phone to an
ultrawide monitor, in both themes.

**Independent test**: view each entry point at compact, medium and expanded widths; confirm capped,
centered content, no horizontal body scroll, and tokens-only styling.

**Note on honesty**: T017 lands a structurally complete component — it is not styled twice. This
phase *pins* the presentation properties that can be asserted headlessly and *verifies* the ones that
cannot. jsdom has no layout engine; a "no horizontal scroll" assertion there would pass regardless of
the CSS and is worth less than nothing (contract §5).

- [X] T019 **RED** [US2] Add to `test/onboarding/landing-view.test.tsx`: exactly one `<h1>`, and the point titles do not outrank it (contract A4); the primary action carries the 48px height class (A3); neither action sets `outline-none`, so the global sand focus-visible ring survives (A2). Fails if T017's markup does not already satisfy them.
- [X] T020 **GREEN** [US2] Reconcile `components/landing/LandingView.tsx` with whatever T019 exposed, and confirm the layout decisions from research §6 are in place: one centered column capped at the constitution's 560px reading width, `px-6` gutters, `min-h-screen` (never `h-screen` — the double-scroll failure PRs #104/#105 fixed under spec 040's `zoom`), hero above the fold with the points below a hairline rule. Tokens only.
- [X] T021 [P] **GREEN** [US2] Verify the tokens-only sweep covers the new file: `npx vitest run test/tokens-only-backgrounds.test.ts`. No new CSS should be needed at all — hover/active come from the existing `.ortho-interactive` utility and the focus ring from the global `:where(a, button, …):focus-visible` rule (research §7). If this feature needed a new rule in `globals.css`, that is a signal to re-read the design system, not to add one.
- [X] T022 **Operator** [US2] Browser walkthrough, [quickstart.md](./quickstart.md) §4 steps 7–11: keyboard order and visible ring; widths 320/375/768/1440/2560 with `bn` checked hardest (Bengali line-breaking is the likeliest overflow); both themes; X-Large text size; storage disabled. SC-004 and A5–A7 are gated here and nowhere else.

**Checkpoint**: the page is correct at every width and in both themes.

---

## Phase 5: User Story 3 — Each market can be spoken to differently (P3)

**Goal**: the six pages are structured so positioning can diverge per market without a code change.

**Independent test**: change one locale's proposition and confirm no other locale and no component
requires editing.

**Note**: this story is a *property* of the T017 implementation (the `points` array), not new
behavior. The work here is proving it holds and cannot silently regress.

- [X] T023 **RED** [US3] Add to `test/onboarding/landing-view.test.tsx` the structural proof for US3 acceptance scenario 2: render `LandingView` with a fabricated copy object carrying **two** points, and again with **four**, and assert both render every point with no per-locale branching. This is the test that fails the day someone "simplifies" `points` into `point1`/`point2`/`point3`.
- [X] T024 **GREEN** [US3] Confirm T023 passes against the T017 implementation unchanged. If it does not, the component is branching on locale or assuming a fixed count — fix the component, never the test.
- [ ] T025 [P] [US3] Prove SC-005 mechanically: `git diff --name-only` for a trial edit of one locale's `landing` block must list exactly one file. Record the result in the PR description; revert the trial edit.

**Checkpoint**: per-market positioning is a one-region edit, and a test says so.

---

## Phase 6: Polish & cross-cutting

- [X] T026 Measure the catalog byte budget ([quickstart.md](./quickstart.md) §2): `wc -c lib/i18n/landing/*.ts`. Must stay under the 30,000-byte guard, which is **not** to be raised — if the copy approaches it, the page has too many words (research §5).
- [X] T027 [P] Reconcile `docs/web.md` §2: the spec-045 bullet describes six *placeholder* pages and names `LandingPlaceholder.tsx`. Update it to describe the real landing pages and `LandingView.tsx`, and record the plain-`<a>`/no-`next/link` decision so the next person does not "upgrade" it and reintroduce prefetches to `/tour/*`.
- [X] T028 [P] Reconcile `docs/plan/onboarding-funnel.md`: mark feature 046 implemented, and note the primary CTA ships as "See how it works" rather than the diagram's "Learn more" (research §9), so the doc and the product agree.
- [ ] T029 Verify the full gate: `npx tsc --noEmit` clean and `npm test` green (275+ files). Keeping `tsc` clean is not optional — a type error fails `next build`, and there is no other build gate.
- [ ] T030 Verify the static export really produced six real pages ([quickstart.md](./quickstart.md) §3): `npm run build`, then confirm `out/landing/*.html` exists for all six, the `ja` title is in Japanese, `ja` carries seven hreflang links, and `out/landing/ko.html` links to `/tour/ko`. That last grep is the whole feature in one line.
- [ ] T031 **Operator** Browser walkthrough, [quickstart.md](./quickstart.md) §4 steps 1–6: above-the-fold on a phone; no English flash on first paint; view-adopts-nothing then click-adopts; the Korean sign-in hand-off. Step 2 and step 3 are the two that catch subtle regressions — a lost static import, and an over-eager adopt.
- [ ] T032 **Operator, macOS only** iOS shell confirm ([quickstart.md](./quickstart.md) §5): the installed app opens on `/dashboard` or `/sign-in` and never displays a landing page. This feature adds the first interactive landing surface, so re-confirm spec 045's guard.
- [ ] T033 **Product owner** Copy review ([quickstart.md](./quickstart.md) §6): read all six `landing` blocks. What ships is a translated English proposition making only supportable claims; per-market positioning is deliberately not invented and is a one-region edit when you want it.

---

## Dependencies & execution order

```
Phase 1 (RED: catalog contract)
   └─► Phase 2 (GREEN: types + six catalogs)      ← BLOCKS everything below
          └─► Phase 3 / US1 (component + route)    ← MVP
                 ├─► Phase 4 / US2 (presentation)
                 └─► Phase 5 / US3 (structural proof)   ← independent of US2
                        └─► Phase 6 (polish, docs, operator gates)
```

- **US2 and US3 are independent of each other** and can proceed in either order once US1 is green.
- **US1 alone is a shippable increment**: six real landing pages, correctly linked and adopting
  language. US2 refines how it presents; US3 proves a property US1 already has.

## Parallel opportunities

- **T007–T011** — the five non-English catalogs. Different files, no shared symbol; the largest
  parallel block in the feature.
- **T013** runs alongside T012 (test files vs. component).
- **T021** runs alongside T020; **T025** alongside T023/T024.
- **T027 and T028** — two different docs.

Everything else is sequential: a RED task must land before its GREEN partner, by definition.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That delivers the feature's entire user-visible purpose: six
language-specific marketing pages, each linking onward in its own language. Phases 4–6 make it
correct at every width, prove it stays swappable, and close the operator gates.

**Suggested commit boundaries**, each independently green:

1. Phases 1–2 — "the copy exists, typed and guarded"
2. Phase 3 — "the real landing page"
3. Phases 4–5 — "presentation pinned, structure proven"
4. Phase 6 — "docs reconciled, gates closed"

**Total: 33 tasks** — 29 automatable, 4 gated on a human: T022, T031 and T032 need a browser or a Mac,
and T033 is the product owner's copy review. No task in this feature touches the database, adds a
dependency, or edits the app catalogs.

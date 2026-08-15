# Implementation Plan: Per-Language Landing Pages

**Branch**: `feat/046-landing-pages` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/046-landing-pages/spec.md`

## Summary

Spec 045 built six statically exported language entry points and everything around them — routing,
per-locale metadata and hreflang, first-paint catalogs, and the language hand-off. Each one
currently shows a wordmark and a single holding line.

This feature fills them in: a value proposition, three supporting points, one prominent action to
`/tour/{slug}`, and one quieter sign-in link — both actions adopting the page's language before they
navigate. It replaces exactly one component and adds copy to the six landing catalogs' reserved
`spec 046` regions. **No new module, no new dependency, no database change.**

The technical substance is small and concentrated in three decisions:

1. **`points` is an array**, so a market can carry a different number of supporting ideas with no
   per-locale branch in the component (US3 / FR-011).
2. **The actions are plain `<a href>`**, not `next/link` and not `router.push` — crawlable, which is
   the funnel's whole purpose, and free of prefetches to `/tour/*`, a route spec 047 has not built
   yet.
3. **Adoption rides the click handler**, which is synchronous `localStorage`, so "adopt then
   navigate" needs no `preventDefault` and no await.

The rest is words. Six locales ship a faithful translation of one English proposition whose every
claim traces to a shipped feature; per-market positioning is left to the product owner, structured
so any locale is a one-region edit.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16.2.9 (App Router, `output: 'export'`)

**Primary Dependencies**: none added. The feature uses only what spec 045 shipped
(`lib/onboarding/*`, `lib/i18n/landing/*`) plus Tailwind v4 utilities already in `globals.css`.

**Storage**: none. The only persisted value is the pre-existing `language` `localStorage` key,
written through spec 045's `adoptLandingLanguage()`. No table, no migration, no RLS.

**Testing**: Vitest (`npm test`), jsdom per-file via `// @vitest-environment jsdom`,
`@testing-library/react`. Four spec-045 suites are edited; one new suite is added.

**Target Platform**: static-exported web, served by any static host. Explicitly **not** the
Capacitor iOS shell — the installed app must never display a landing page (spec 045's guards).

**Project Type**: web front-end, pre-auth marketing surface.

**Performance Goals**: text paints in its own language on the first frame, with no English flash and
no post-mount catalog swap. No decorative asset may precede the proposition.

**Constraints**: tokens only; content capped at the 560px reading column with no horizontal body
scroll from 320px to 2560px; the page may not import `lib/store`, an app catalog, or the Supabase
client; the six landing catalogs must stay under 30,000 bytes in total; the `spec 047` catalog
region must survive untouched for a parallel branch.

**Scale/Scope**: one component replaced, one interface changed, six catalogs edited, five test files
touched (four edited, one new). Six statically exported documents.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes clean — no entry in
Complexity Tracking.*

| Principle | How this feature satisfies it |
|---|---|
| **I. One Design System, Tokens Only** | No new color, size, shadow or palette entry. The primary action reuses `PrimaryButton`'s treatment (`var(--text)` fill, `var(--bg)` label); the sign-in link reuses `not-found.tsx`'s quiet `text-accent` anchor. Hover/active come from the existing `.ortho-interactive` utility. Enforced by `test/tokens-only-backgrounds.test.ts`, which already sweeps `components/`. |
| **II. Calm Over Dense (NON-NEGOTIABLE)** | One centered 560px column; empty margins on wide screens are the intent, not a gap to fill. No gradient, illustration, emoji, or shadow on inset content. Three supporting points, not a feature matrix. Nothing red — the page has no loss/cost framing at all. |
| **III. Right Form Factor Per Canvas** | One column that is correct from 320px to ultrawide with no breakpoint branch. The hero fits a phone viewport above the fold; the points fall below it. `min-h-screen` (a floor), never `h-screen` — the failure mode PRs #104/#105 fixed under spec 040's `zoom`. Never rendered on iOS. |
| **IV. Plainspoken Voice** | Second-person, plain sentences, no marketing superlatives. The primary label says what happens next ("See how it works") rather than gesturing at it. No money is displayed on this page, so the money-formatting rules do not apply. |
| **V. Accessible & Interaction-Complete** | Two real `<a href>` elements, in DOM order matching visual weight, with the global sand focus-visible ring and a 48px primary target. One `<h1>`. The content subtree and the document element both carry the BCP-47 tag. |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | Every unit is written test-first: the tests for the catalog shape, the component contract and the adopt-on-act behavior all fail before their implementation exists. No money or date logic is introduced, so no golden vector applies. Tests assert accessible DOM and public contracts — roles, hrefs, and `localStorage` — never internals. |

**Post-Phase-1 re-check**: unchanged. The design added no shared primitive, no new CSS, no
dependency, and no import into the landing module graph.

## Project Structure

### Documentation (this feature)

```text
specs/046-landing-pages/
├── spec.md              # pre-existing (scaffolded)
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1 — the content model; there is no DB model
├── quickstart.md        # Phase 1 — headless checks + the operator walkthrough
├── contracts/
│   └── landing-page.md  # Phase 1 — the page/component/catalog contract
├── checklists/
│   └── requirements.md  # pre-existing
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source code

```text
web/
├── components/landing/
│   ├── LandingPlaceholder.tsx        # DELETED — the single file this feature replaces
│   └── LandingView.tsx               # NEW — hero, points, two actions
├── lib/i18n/landing/
│   ├── index.ts                      # +LandingCopy, +LandingPoint, +landing, −placeholderLine
│   └── {en,es,bn,ja,zh,ko}.ts        # copy inside the `spec 046` region; meta values rewritten
├── app/landing/[locale]/page.tsx     # renders LandingView; otherwise unchanged
└── test/
    ├── onboarding/
    │   ├── landing-view.test.tsx     # NEW — the component contract
    │   ├── landing-route.test.tsx    # EDITED — headline not placeholderLine; CTAs now expected
    │   ├── landing-index.test.tsx    # EDITED — headline reference
    │   └── root-router.test.tsx      # EDITED — headline reference
    └── i18n/landing-catalogs.test.ts # EDITED — new keys; 047 region still empty
```

**Structure Decision**: no new directory. The feature lives entirely inside the two directories
spec 045 created for it (`components/landing/`, `lib/i18n/landing/`) plus their existing test homes.
Adding a `web/lib/landing/` module was considered and rejected — there is no logic here to extract;
a module holding a `map` over an array would be indirection without a payer.

## Phase sequencing

The user stories are independently testable and land in priority order, each green before the next
begins:

| Phase | Delivers | Independent test |
|---|---|---|
| **Setup** | `LandingCopy`/`LandingPoint` types; English copy; catalog guards extended | `landing-catalogs` green on `en`; other five still fail their new-key guards |
| **US1 (P1)** | `LandingView` + the route swap + all six locales' copy | Open each entry point: proposition, primary action, sign-in link, in that language, correctly ordered |
| **US2 (P2)** | Layout, tokens, focus, responsive pass | Each entry point at compact/medium/expanded: capped, centered, no horizontal scroll, both themes |
| **US3 (P3)** | Structural proof | Change one locale's `points` length and its copy; confirm no other locale and no component needs editing |
| **Polish** | metadata values (FR-012), docs reconciliation, byte-budget check | `npm test`, `tsc --noEmit`, quickstart §3 |

US1 is the feature; US2 refines how it looks; US3 is a property the US1 implementation already has
(the array), proven rather than added.

## Risks and how they are handled

| Risk | Handling |
|---|---|
| **Merge conflict with spec 047**, which edits the same six catalogs in a parallel sandbox | Copy goes only inside the `spec 046` region, ≥3 lines from 047's. The one shared line is each file's final composition (`{ ...base, landing }` → `{ ...base, landing, tour }`) — accepted and documented in research §3 so 047's agent is not surprised. |
| **`/tour/{slug}` does not exist yet** | Linked anyway, per the spec's Assumptions. Until 047 merges, the primary action lands on the calm not-found page. Plain `<a>` (not `next/link`) means no prefetch storms against the missing route. |
| **Removing `placeholderLine` breaks four spec-045 tests** | Intended: two of those tests assert conditions explicitly true "until 046". They are retargeted at the headline, not deleted — the 047 halves of the same guards must survive. |
| **Byte budget** | 6,303 of 30,000 bytes used before this feature; measured again after the copy lands (quickstart §2). |
| **Copy is a product decision, not an engineering one** | Only supportable claims ship (research §9 traces each to a shipped surface); the structure makes any locale's positioning a one-region edit; quickstart §6 is the product-owner review step. |

## Complexity Tracking

No constitution violations. Table intentionally empty.

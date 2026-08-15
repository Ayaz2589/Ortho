# Implementation Plan: Onboarding Foundation

**Branch**: `feat/045-onboarding-foundation` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/045-onboarding-foundation/spec.md`

## Summary

Build the structural front door for the signed-out onboarding funnel: a locale registry that is the
single source of truth for six language entry points, a three-branch root router that keeps the
installed iOS app and signed-in users away from marketing, six statically exported placeholder
landing pages with per-locale SEO metadata, the first robots/sitemap surface, plus two pure modules
(language adoption, funnel marker) and the reserved translation regions that let features 046/047/048
build in parallel.

Technically this is a **client-routing + static-metadata** feature. Two research findings shaped it
materially: the funnel gets its **own small translation catalogs** rather than reserved regions in
the 32–55 KB app catalogs (§3 of research.md), and the six entry points are **one dynamic route with
`generateStaticParams()`** rather than six hand-written folders, so SC-006's "adding a language is
one list edit" actually holds (§4).

No database change, no migration, no new runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js **16.2.9** (App Router). Per `web/AGENTS.md`,
API details were read from `web/node_modules/next/dist/docs/`, not recalled.

**Primary Dependencies**: existing only — `next`, `react`, `@capacitor/core`, `@supabase/ssr`.
Nothing added.

**Storage**: `localStorage` only (the existing `language` key; one new funnel-marker key). No
Supabase table, no migration, no server state.

**Testing**: Vitest + Testing Library, `npm test` from `web/`. Capacitor mocked with
`vi.mock('@capacitor/core', …)`, the pattern already used in five existing test files.

**Target Platform**: static export (`output: 'export'`) served by Vercel, and the same bundle wrapped
by Capacitor for iOS. Both canvases must be correct.

**Project Type**: web application (single codebase, `web/`), per Constitution's one-canonical-
implementation framing.

**Performance Goals**: landing routes must not regress first paint. Hard constraint: a landing route
may **not** import an app translation catalog (32–55 KB) nor `lib/store`. Its own catalog is a few KB
and statically imported so there is no post-mount language flash.

**Constraints**: no server, no middleware, no `redirects`/`rewrites`/`headers` (unsupported under
static export); every routing decision is a client effect. `Capacitor.isNativePlatform()` must be the
first branch of the root router, evaluated before any async work.

**Scale/Scope**: 6 locales × 1 dynamic route; 2 pure modules; 1 rewritten root route; 3 new
metadata/error routes; 6 new small catalogs. Roughly 15 new files, 1 modified.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I. One Design System, Tokens Only** | PASS. The placeholder body and not-found page use existing tokens (`--bg`, `--text`, `--text-2`) and the existing wordmark treatment from `app/sign-in/page.tsx`. No new palette entry, no marketing-specific color. |
| **II. Calm Over Dense** | PASS. Placeholders are a wordmark and one line. The not-found page is calm and non-alarmist — no red, no alarm language (FR/Principle IV). Marketing density is 046's problem, and 046 inherits this gate. |
| **III. Right Form Factor Per Canvas** | PASS, and this feature is largely *about* it: the native canvas is explicitly excluded from the marketing surface (FR-004). Landing placeholders are centered and width-capped like every other reading-column screen. |
| **IV. Plainspoken Voice & Money Formatting** | PASS. No money is rendered anywhere in this feature. Copy is second-person and plain; the not-found and holding states are short and never alarmist. |
| **V. Accessible & Interaction-Complete** | PASS. The placeholder has no interactive controls yet; the not-found page's single "back" affordance is a real `<button>`/`<a>` with a visible focus ring. Each landing document sets a correct `lang` for assistive tech — a genuine accessibility gain over today's single English document. |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | PASS. Every module is developed test-first. No money or date math is introduced, so the golden-vector suite is untouched (`npm run gen:vectors` must produce no diff). The native-platform branch is pinned by a dedicated guard test that asserts ordering, not just destination. |

**Post-Phase-1 re-check**: still passing. The one design decision that warranted scrutiny — adding
the codebase's first server components — introduces no new dependency and no styling deviation; it
is the only way Next.js permits a `metadata` export, and the client boundary sits immediately
beneath it. No entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/045-onboarding-foundation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 10 resolved decisions
├── data-model.md        # Phase 1 — locale registry + funnel marker
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── locale-registry.md
│   ├── root-router.md
│   └── seo-surface.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
web/
├── app/
│   ├── page.tsx                        # MODIFIED — three-branch smart router
│   ├── not-found.tsx                   # NEW — calm 404; /landing/-scoped recovery
│   ├── robots.ts                       # NEW — static Route Handler
│   ├── sitemap.ts                      # NEW — static Route Handler, six entries
│   ├── layout.tsx                      # MODIFIED — metadataBase only
│   └── landing/
│       ├── page.tsx                    # NEW — bare /landing → detected locale
│       └── [locale]/
│           └── page.tsx                # NEW — server component: generateStaticParams + metadata
├── components/
│   └── landing/
│       └── LandingPlaceholder.tsx      # NEW — shared client body (046 replaces this)
├── lib/
│   ├── onboarding/
│   │   ├── locales.ts                  # NEW — THE registry: slug ↔ Language ↔ BCP-47
│   │   ├── funnel.ts                   # NEW — per-device marker: mark/read/clear
│   │   └── adoptLanguage.ts            # NEW — write the existing `language` key
│   ├── siteUrl.ts                      # NEW — absolute-origin resolution
│   └── i18n/
│       └── landing/                    # NEW — small funnel-only catalogs
│           ├── en.ts  es.ts  bn.ts
│           └── ja.ts  zh.ts  ko.ts     #   each with 046/047 reserved regions
└── test/
    ├── onboarding/
    │   ├── locales.test.ts
    │   ├── funnel.test.ts
    │   ├── adoptLanguage.test.ts
    │   ├── root-router.test.tsx        # incl. the native-platform guard
    │   ├── landing-route.test.tsx
    │   └── not-found.test.tsx
    ├── i18n/
    │   └── landing-catalogs.test.ts    # parity + reserved-region guard
    └── seo/
        ├── sitemap.test.ts
        └── robots.test.ts
```

**Structure Decision**: the existing single-codebase `web/` layout is used unchanged. New pure logic
goes under `web/lib/onboarding/` (mirroring `web/lib/finance/`, `web/lib/location/`); the shared UI
body goes under `web/components/landing/` (mirroring `web/components/routines/`); tests mirror the
source tree under `web/test/`, matching the convention every prior spec follows. Nothing is added
outside `web/` — no Supabase function, no migration, no shared vector.

## Implementation Phasing

Ordered so each user story is independently verifiable, per the spec's priorities.

1. **Foundational (blocks everything)** — `lib/onboarding/locales.ts`, `lib/siteUrl.ts`, and the six
   `lib/i18n/landing/*.ts` catalogs with their reserved regions. Test-first; these are pure and
   fully unit-testable. *(Delivers US5's first and third acceptance scenarios.)*
2. **US1 — newcomer reaches their language**: the `[locale]` dynamic route, `generateStaticParams`,
   the shared placeholder body, the bare `/landing` redirect, and the `not-found.tsx` recovery.
3. **US2 — existing users untouched**: rewrite `app/page.tsx` as the three-branch router, with the
   native guard test asserting `getUser()` is never reached on native. *Highest regression risk in
   the feature; it lands with its guard test in the same change.*
4. **US3 — language carries through**: `lib/onboarding/adoptLanguage.ts` plus `lib/onboarding/funnel.ts`.
   Adoption is wired to the placeholder's continue affordance only insofar as 046 needs the contract
   to exist; this feature ships the module and its tests, not marketing CTAs.
5. **US4 — discoverability**: `app/robots.ts`, `app/sitemap.ts`, `metadataBase` in the root layout,
   and the per-locale `alternates` block. Includes the built-HTML `x-default` verification.
6. **Polish** — full-suite run, `tsc --noEmit`, `npm run gen:vectors` no-diff check, and the
   documentation sweep (`docs/web.md`, `docs/index.md`, `CLAUDE.md` active-feature block).

## Risks

| Risk | Mitigation |
|---|---|
| **The iOS app opens on marketing.** The single highest-severity failure in this feature. | Native branch is first and synchronous; a dedicated guard test asserts both the destination and that no auth call occurs; `capacitor-ios-ci.yml` build-verifies on every `web/**` push. |
| **`x-default` is undocumented in Next 16.2.9** and may not pass through. | Verified against built HTML in quickstart, not assumed; literal-`<link>` fallback documented in research §2. |
| **First server components in the codebase** — an unfamiliar boundary in an otherwise all-client app. | Kept to metadata-only; all behavior sits in the client body beneath. Any accidental client hook in the server file fails the build loudly, not silently. |
| **A landing route accidentally imports `lib/store` or an app catalog**, regressing first paint. | An explicit test asserts the landing route's module graph excludes both — a cheap static guard, since both are single well-known import paths. |
| **Unknown-slug recovery via a global `not-found.tsx`** could throw signed-in users out of the app on a typo'd in-app URL. | The redirect is scoped to paths beginning `/landing/`; every other path renders an ordinary calm not-found page. Pinned by test. |
| **No production domain exists**, so canonicals will carry the Vercel host. | Layered `NEXT_PUBLIC_SITE_URL` resolution with a documented default; recorded as an operator task before submitting for indexing. |

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

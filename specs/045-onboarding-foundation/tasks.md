# Tasks: Onboarding Foundation

**Feature dir**: `specs/045-onboarding-foundation/` | **Branch**: `feat/045-onboarding-foundation`
**Inputs**: plan.md, spec.md, research.md, data-model.md, contracts/{locale-registry,root-router,seo-surface}.md, quickstart.md
**Approach**: TDD (Constitution VI) — every behavior gets a failing test before the code that
satisfies it. No money or date math is introduced, so `shared/test-vectors/` is untouched and
`npm run gen:vectors` must produce no diff.

**Path conventions**: web app under `web/`; commands run from `web/` unless noted.

**Before writing any route, metadata, sitemap or robots code**: read the relevant page under
`web/node_modules/next/dist/docs/` (per `web/AGENTS.md` — this is Next.js 16.2.9, not the Next.js in
training data). The pages that matter are listed in research.md §1–2.

---

## Phase 1: Setup

- [X] T001 Create the new source and test directories: `web/lib/onboarding/`,
      `web/lib/i18n/landing/`, `web/components/landing/`, `web/app/landing/[locale]/`,
      `web/test/onboarding/`, `web/test/seo/`. No dependency changes — this feature adds none, so
      `npm install` must remain a no-op.

---

## Phase 2: Foundational (blocking prerequisite for all 5 stories)

The locale registry is the contract every later phase and all three follow-on features consume.
Nothing else may start until T003 and T005 are green.

- [X] T002 [P] Write failing tests in `web/test/onboarding/locales.test.ts` for the registry per
      `contracts/locale-registry.md`: the six invariants (length 6; exactly one entry per app
      `Language` except `System`, asserted in BOTH directions so a new app language without a
      landing page fails; slugs unique/lowercase-ASCII; `locale === LOCALE_BY_LANGUAGE[language]`
      for every entry; `landingSlugs()[0] === 'en'`; `detectLandingSlug` never throws), plus the
      full `detectLandingSlug` table — `es-ES`/`es-MX`/`es` → `es`, `zh-TW`/`zh-Hans` → `zh`,
      `pt-BR`/`fr-FR`/`de` → `en`, `''`/`null`/`undefined` → `en`, `'EN-us'` → `en`.
- [X] T003 Implement `web/lib/onboarding/locales.ts`: `LandingSlug`, `LandingLocale`,
      `LANDING_LOCALES` (six entries per data-model.md §1, `en` first, `bn` keeping the existing
      `bn-BD-u-nu-latn` locale), `landingSlugs()`, `localeForSlug()`, `detectLandingSlug()`.
      `detectLandingSlug` MUST delegate to `effectiveLanguage()` from `@/lib/i18n` and map its
      `Language` result to a slug — do NOT reimplement tag parsing (research §7). Import
      `LOCALE_BY_LANGUAGE`/`Language` from `@/lib/language`; never restate a locale string.
- [X] T004 [P] Write failing tests in `web/test/onboarding/siteUrl.test.ts`: `siteUrl()` resolves
      `NEXT_PUBLIC_SITE_URL` → `https://${NEXT_PUBLIC_VERCEL_URL}` → `http://localhost:3000` in that
      precedence, always returns an absolute origin with NO trailing slash (including when the env
      var is set with one), and `landingUrl(slug)` returns `${siteUrl()}/landing/${slug}`.
- [X] T005 Implement `web/lib/siteUrl.ts` with `siteUrl()` and `landingUrl()` per research §8,
      mirroring the layered-resolution style of the existing `web/lib/app-env.ts`.
- [X] T006 [P] Write failing tests in `web/test/i18n/landing-catalogs.test.ts` per
      `contracts/seo-surface.md` §4: one catalog file per registry slug (no more, no fewer); every
      catalog exports every `LandingCatalog` key, none empty and none left as the English string in
      a non-English file; every catalog contains both reserved marker pairs, correctly ordered and
      EMPTY; no landing catalog imports an app catalog.
- [X] T007 Create the six catalogs `web/lib/i18n/landing/{en,es,bn,ja,zh,ko}.ts` exporting the
      `LandingCatalog` shape (`metaTitle`, `metaDescription`, `placeholderLine`) with real
      translations in each language, plus the two empty reserved regions in the exact delimiter
      format from research §9. Add the `LandingCatalog` interface and the slug-keyed static import
      map in `web/lib/i18n/landing/index.ts`. These are NEW small files — do not add funnel strings
      to `web/lib/i18n/{bn,es,ja,zh,ko}.ts`, which stay untouched by this feature (research §3).

**Checkpoint**: registry, site URL and catalogs are green and independently usable. US5's first and
third acceptance scenarios are already satisfied here.

---

## Phase 3: User Story 1 — A newcomer reaches a page in their own language (P1)

**Goal**: six statically exported landing pages, each in its own language, reachable directly and
recoverable from a bare or stale address.

**Independent test**: visit `/landing/es` directly and see Spanish on first paint; visit `/landing`
and `/landing/fr` and land on the detected locale.

- [X] T008 [P] [US1] Write failing tests in `web/test/onboarding/landing-route.test.tsx`: the route
      renders its locale's copy (not English) for at least `es` and `ja`; the document's `lang` is
      the entry's BCP-47 locale; `generateStaticParams()` returns exactly `landingSlugs()`;
      `dynamicParams` is `false`. Include the module-graph guard asserting the route's imports
      exclude `@/lib/store` AND every `@/lib/i18n/{bn,es,ja,zh,ko}` app catalog — this is the
      first-paint constraint and the reason the funnel has its own catalogs.
- [X] T009 [US1] Create `web/components/landing/LandingPlaceholder.tsx` — a client component taking
      `{ locale, copy }`, rendering the wordmark treatment from `web/app/sign-in/page.tsx` plus the
      one localized `placeholderLine`. Tokens only, content capped and centered, no interactive
      controls, no `lib/store`, no network. This is the single file feature 046 replaces.
- [X] T010 [US1] Create `web/app/landing/[locale]/page.tsx` as a SERVER component (the codebase's
      first — no `'use client'`): `generateStaticParams()` from `landingSlugs()`,
      `export const dynamicParams = false`, and a `generateMetadata()` returning that locale's
      `metaTitle`/`metaDescription`. It renders `<LandingPlaceholder>` with the statically imported
      catalog. Metadata `alternates` are added in T021 — keep this task to structure and copy.
- [X] T011 [P] [US1] Write a failing test in `web/test/onboarding/landing-index.test.tsx`: the bare
      `/landing` route renders no content of its own and replaces to `/landing/{detected}`.
- [X] T012 [US1] Create `web/app/landing/page.tsx` — a client route that on mount calls
      `router.replace('/landing/' + detectLandingSlug(navigator.language))`, rendering the neutral
      holding state meanwhile.
- [X] T013 [P] [US1] Write failing tests in `web/test/onboarding/not-found.test.tsx` for BOTH
      branches: a path beginning `/landing/` replaces to `/landing/{detected}`; and — the negative
      case that matters — `/transactions/typo` renders the calm not-found page and does NOT redirect
      to marketing.
- [X] T014 [US1] Create `web/app/not-found.tsx` (the codebase's first): scoped recovery per
      `contracts/root-router.md` §4. Calm and non-alarmist per Constitution II/IV — no red, no error
      chrome, no apology — with a single real `<a>`/`<button>` back-affordance carrying a visible
      focus ring. Must not import `lib/store`.

**Checkpoint**: US1 is independently demonstrable — all six pages render in-language and no address
under `/landing` dead-ends.

---

## Phase 4: User Story 2 — Existing users and app users are untouched (P1)

**Goal**: the root router sends the installed iOS app and every signed-in user to the app, and only
signed-out web visitors to marketing.

**Independent test**: open `/` signed in (dashboard, no marketing frame) and launch the iOS shell
(app, never marketing).

**This phase carries the feature's highest regression risk. The guard test lands in the same change
as the router — never after it.**

- [X] T015 [US2] Write the failing native-guard tests in `web/test/onboarding/root-router.test.tsx`
      FIRST, before touching `app/page.tsx`. Mock Capacitor with the established pattern
      `vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))` (see
      `web/test/store/context-render-isolation.test.tsx:15`; use the parameterized form from
      `web/test/supabase/client.test.ts:34` to cover both platforms in one file). Assert: on native
      the router reaches `/dashboard` AND `supabase.auth.getUser()` is **never called** — the
      ordering, not just the destination, is the regression; and that native with a signed-out
      session and an `es-ES` device language still reaches `/dashboard`.
- [X] T016 [US2] Extend `web/test/onboarding/root-router.test.tsx` with the remaining rows of the
      matrix in `contracts/root-router.md` §1: web+signed-in → `/dashboard` with no landing render
      at any point; web+signed-out+`es-ES` → `/landing/es`; web+signed-out+`fr-FR` → `/landing/en`;
      web+signed-out+absent-language → `/landing/en`; and while the decision is resolving, neither
      destination is rendered.
- [X] T017 [US2] Rewrite `web/app/page.tsx` as the three-branch smart router. Branch 1
      (`Capacitor.isNativePlatform()` → `/dashboard`) MUST be first and synchronous — no await, no
      storage read, no language read before it. Use `router.replace()`, never `window.location` (a
      hard navigation would hit the extensionless-path fallback documented in `web/lib/nav.ts`), and
      `replace` not `push` so the root never becomes a back-button trap. Render the existing neutral
      hold until a branch resolves.

**Checkpoint**: US2 verified. Every pre-existing route still behaves identically — `npm test` must
show zero changes to tests this feature did not add.

---

## Phase 5: User Story 3 — The chosen language carries through the journey (P2)

**Goal**: the modules that let an entry point hand its language and funnel provenance forward.
This feature ships the contracts and their tests; 046 wires the CTAs and 047/048 use the marker.

- [X] T018 [P] [US3] Write failing tests in `web/test/onboarding/adoptLanguage.test.ts`:
      `adoptLandingLanguage('es')` writes `'Español'` (the `Language` value, NOT the slug — writing
      a slug would silently fall back via `asLanguage()`) to the existing `language` localStorage
      key; an unknown slug writes nothing; and with `localStorage.setItem` throwing, the call is a
      silent no-op that does not propagate (FR-015).
- [X] T019 [US3] Implement `web/lib/onboarding/adoptLanguage.ts` per `contracts/locale-registry.md`.
- [X] T020 [P] [US3] Write failing tests in `web/test/onboarding/funnel.test.ts`: `markFunnelEntry`
      /`readFunnelEntry`/`clearFunnelEntry` round-trip on key `ortho.onboardingFunnel`;
      `readFunnelEntry()` is strict (only exactly `'1'` is true — absent, malformed and truncated
      values all read false); every function tolerates `localStorage` throwing. Add the FR-019
      guard: no production module outside `web/lib/onboarding/` imports this module yet.
- [X] T021 [US3] Implement `web/lib/onboarding/funnel.ts`, mirroring
      `web/components/announcements/announcementsSeen.ts`. Define it only — this feature must not
      call it anywhere in production code (FR-019).

**Checkpoint**: the three follow-on features have every contract they need. US5 fully satisfied.

---

## Phase 6: User Story 4 — The language pages can be found and attributed (P3)

- [X] T022 [P] [US4] Write failing tests in `web/test/seo/sitemap.test.ts` per
      `contracts/seo-surface.md` §2: exactly `landingSlugs().length` entries generated by mapping
      the registry (not hand-listed); every URL absolute and origin-consistent with `siteUrl()`;
      every entry carries all six alternates plus `x-default`; no signed-in route present; and no
      `lastModified` field (a build-time date would churn the sitemap on every deploy and make the
      build non-deterministic).
- [X] T023 [P] [US4] Write failing tests in `web/test/seo/robots.test.ts`: `/landing/` allowed;
      every signed-in destination disallowed (`/dashboard`, `/transactions`, `/planning`,
      `/housing`, `/settings`, `/routines`, `/welcome`, `/sign-in`); the `sitemap` field uses the
      same `siteUrl()` origin.
- [X] T024 [US4] Implement `web/app/sitemap.ts` and `web/app/robots.ts` as static Route Handlers
      (supported under `output: 'export'` — research §1).
- [X] T025 [US4] Add `metadataBase: new URL(siteUrl())` to the existing `metadata` export in
      `web/app/layout.tsx`. Change nothing else there — the appearance and text-size boot scripts
      and the existing title/description stay exactly as they are.
- [X] T026 [US4] Extend `generateMetadata()` in `web/app/landing/[locale]/page.tsx` with
      `alternates.canonical = landingUrl(slug)`, `alternates.languages` mapping all six
      `locale → landingUrl(slug)` plus `'x-default' → landingUrl('en')`, and `openGraph.locale`.
      Extend `web/test/onboarding/landing-route.test.tsx` to assert the generated object.

---

## Phase 7: Polish & cross-cutting

- [X] T027 Run the full gates from `web/`: `npx tsc --noEmit` clean; `npm test` green with zero
      pre-existing tests modified; `npm run gen:vectors` followed by
      `git diff --exit-code shared/test-vectors/` (must be empty — this feature adds no money or
      date math).
- [X] T028 Run `npm run build` and confirm the static export: `web/out/landing/{en,es,bn,ja,zh,ko}/`
      all exist, plus `web/out/robots.txt` and `web/out/sitemap.xml`.
- [X] T029 **Verify `x-default` survived into the built HTML** (research §2 flags it as undocumented
      in Next 16.2.9, so it must be checked rather than assumed):
      `grep -o 'hreflang="[^"]*"' web/out/landing/es/index.html | sort -u` must show seven values
      including `x-default`. Also confirm `web/out/landing/es/index.html` has a Spanish `<title>`,
      `lang="es-ES"`, and a canonical pointing at `…/landing/es`. If `x-default` is missing, apply
      the documented fallback — a literal `<link rel="alternate" hreflang="x-default">` in the
      landing layout — and re-verify.
- [X] T030 [P] Update `docs/web.md` (the new pre-auth surface: landing routes, the root router's
      three branches, robots/sitemap, the first server components and first `not-found.tsx`) and
      `docs/index.md` (add `NEXT_PUBLIC_SITE_URL` to the env-var table and note the funnel's
      separate landing catalogs).
- [X] T031 [P] Simulate the parallel-merge guarantee per quickstart §6: create two throwaway
      branches inserting into the 046 and 047 reserved regions of the same landing catalog, merge
      both, and confirm zero conflicts. Delete the temp branches.

---

## Operator-pending (cannot run in a Linux sandbox)

No browser and no Xcode here — see `docs/index.md`. These stay unchecked until run on a real canvas.

- [ ] T032 **Operator** — browser walkthrough, quickstart §4 steps 1–9. The two that catch subtle
      failures: step 1 (signed-out `es-ES` at `/` shows Spanish with **no English flash on the first
      frame**) and step 3 (signed-in at `/` shows the dashboard with **no landing frame at any
      moment**). Watch the first painted frame, not the settled state.
- [ ] T033 **Operator, macOS only** — iOS shell confirm, quickstart §5 steps 1–3. Step 3 (device
      language set to Spanish, relaunch → still the app) is the one an implementer is most likely to
      break by reading the language before checking the platform. Alternatively rely on
      `.github/workflows/capacitor-ios-ci.yml`, which build-verifies on every `web/**` push.
- [ ] T034 **Operator** — set `NEXT_PUBLIC_SITE_URL` in the Vercel production environment to the
      marketing domain before submitting the entry points for indexing. Until then canonicals and
      the sitemap carry the Vercel deployment host, which is functional but would get the wrong
      domain indexed. Requires deciding the production domain, which is not recorded anywhere in the
      repo today.

---

## Dependencies

```
Phase 1 (T001)
   ↓
Phase 2 — Foundational (T002-T007)      ← BLOCKS everything; registry is the shared contract
   ↓
   ├─ Phase 3 — US1 (T008-T014)   landing routes        ─┐
   ├─ Phase 4 — US2 (T015-T017)   root router            ├─ US2/US3 independent of US1;
   ├─ Phase 5 — US3 (T018-T021)   adoption + marker     ─┘  US4 needs US1's route to exist
   └─ Phase 6 — US4 (T022-T026)   SEO surface  ← needs T010
   ↓
Phase 7 — Polish (T027-T031)
   ↓
Operator (T032-T034)
```

- **US1 → US4**: T026 extends the route file created in T010.
- **US2** depends only on Phase 2 (`detectLandingSlug`), not on US1 — the router can be built and
  tested against routes that render placeholders.
- **US3** depends only on Phase 2. Fully parallel with US1 and US2.
- **US5** (parallel-build contracts) has no phase of its own: it is satisfied by T003/T007 in Phase 2
  and T021 in Phase 5, and verified by T031.

## Parallel opportunities

- **Phase 2**: T002, T004, T006 are three independent test files — write together, then implement
  T003, T005, T007.
- **After Phase 2**: US1, US2 and US3 are independent. With three implementers, T008/T015/T018 start
  simultaneously.
- **Within US1**: T008, T011, T013 are three separate test files.
- **Within US4**: T022 and T023 are independent.
- **Phase 7**: T030 and T031 touch nothing in common.

## Implementation strategy

**MVP = Phase 2 + Phase 4 (US2) + Phase 3 (US1).** That is the smallest slice that is safe to
merge: the registry, a root router that provably cannot show marketing in the installed app, and six
pages to route to. US3 and US4 are additive and could ship in a follow-up without leaving anything
broken — though all three follow-on features need US3's modules, so deferring it would only move the
work.

**Suggested commit boundaries** (mirroring spec 044's shape): one commit per phase —
setup+foundational, then US1, US2, US3, US4, then polish.

**Do not defer T015.** The native guard test is what makes this feature safe to merge at all; write
it before `app/page.tsx` is touched, not after.

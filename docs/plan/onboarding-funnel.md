# Onboarding funnel — landing page → tour → sign-in → financial health

**Status:** **spec 045 (foundation) is implemented** — see `specs/045-onboarding-foundation/`.
046, 047 and 048 are planned and ready to build in parallel Docker Sandboxes off 045.

> **Two decisions below were superseded during 045's research and implementation.** They are marked
> inline where they appear, and both are recorded in `specs/045-onboarding-foundation/research.md`:
> §3 (the funnel gets its own catalogs rather than reserved regions in the app catalogs) and §4
> (one dynamic route rather than six hand-written folders). The sequencing — foundation first, then
> three parallel features — is unchanged.

The funnel: a language-specific marketing landing page → a ≤5-slide "what Ortho does" tour →
the existing OTP sign-in → the existing Financial Health questionnaire. Today the app has no
pre-auth surface at all: `/` client-redirects to `/dashboard`, which bounces a signed-out visitor
to `/sign-in`. This adds the front door.

```
/                     smart router
  ├─ native (iOS)  ──────────────────────────────────► /dashboard
  ├─ signed-in     ──────────────────────────────────► /dashboard
  └─ signed-out web ─► /landing/{en|es|bn|ja|zh|ko}
                          ├─ "Log in" (small link) ──► /sign-in
                          └─ "Learn more" (big CTA) ─► /tour/{locale}
                                                          ├─ Skip ─────┐
                                                          └─ 5 slides ─┴─► /sign-in
                                                                             │
                                            funnel flag set? ────────────────┤
                                              yes ─► /welcome/financial-profile ─► /dashboard
                                              no  ─► /dashboard (announcement drawer as today)
```

---

## Architectural constraints (verified in-repo, 2026-08-15)

These are the things an agent will get wrong if it doesn't read them first.

1. **`output: 'export'` — the app is a fully static export** (`web/next.config.ts`). There is no
   server, no middleware, no `redirect()`, no SSR. Every landing route is a static HTML file, and
   *all* locale detection happens client-side. This is good for SEO (real static HTML per locale)
   but means the root router is a client effect, not a server redirect.

2. **The same bundle is the iOS app.** Capacitor wraps `web/out` (`capacitor.config.ts`,
   `webDir: 'out'`). `/` is the installed app's entry point, so a landing page at `/` would make
   the App Store build open on marketing. The `/` router must check
   `Capacitor.isNativePlatform()` first. Related trap: `web/lib/nav.ts` documents that Capacitor's
   iOS asset router serves `index.html` for *any extensionless path*, which is why signed-out hard
   navigations target `/sign-in.html`. Any new hard navigation on native hits the same rule.

3. **The catalog loader flashes English.** `useTranslate` (`web/lib/i18n/index.ts`) dynamically
   imports the active catalog *after mount* and returns the English identity until it resolves.
   That is correct for the app (language is a user setting) but wrong for a landing page whose
   locale is fixed by its URL — a Spanish visitor would see an English flash before hydration.
   **Each landing/tour route must statically import its own single catalog.** One catalog per
   route costs nothing (the route only ships its own) and removes the flash entirely.

4. **Every page in `app/` is currently `'use client'`** — there are zero server components. Next.js
   only allows a `metadata` export from a server component, so the landing routes will be the
   first server components in the codebase: a thin server `page.tsx` exporting per-locale
   `metadata` + `hreflang`, rendering a client body. Don't collapse them back into client
   components or the SEO value is lost.

5. **No SEO surface exists yet** — no `robots.txt`, no sitemap, `public/` still holds the Next.js
   starter SVGs. The funnel introduces the first indexable pages.

6. **Pre-auth routes must not import `lib/store`.** `AppStateProvider` bootstraps Supabase and
   pulls the full household data layer. `app/sign-in/page.tsx` deliberately builds its own `t`
   from localStorage instead; landing and tour must do the same.

7. **Spec 042 deliberately deleted the forced redirect** into `/welcome/financial-profile`,
   replacing it with the dismissible `AnnouncementHost` drawer. Feature 048 reintroduces a hard
   hand-off, but **only for users who came through this funnel** — the announcement path stays
   intact for everyone else. This is a deliberate, scoped reversal, not a regression.

8. **Language today is a localStorage key**, not a route concern (`web/lib/language.ts`, six
   options: `System`, `English`, `বাংলা`, `Español`, `日本語`, `简体中文`, `한국어`). The funnel's
   real product value is that a landing slug *adopts* the language for the whole downstream
   session — sign-in, questionnaire, and app all continue in it.

---

## Decisions

| Decision | Choice |
|---|---|
| Route slugs | **Locale codes** — `/landing/en`, `/es`, `/bn`, `/ja`, `/zh`, `/ko`. SEO-conventional, pairs with `hreflang`, ASCII-safe in ads and QR codes. |
| Root `/` | **Smart router** — native → `/dashboard`; signed-in → `/dashboard`; signed-out web → `/landing/{detected}` via `effectiveLanguage(navigator.language)`, falling back to `en`. |
| New-user hand-off | **Funnel-flagged hard hand-off** — the tour sets a localStorage flag; the first sign-in after that routes into `/welcome/financial-profile`. Non-funnel users keep the spec-042 announcement drawer. |
| Parallelism | **Foundation spec lands on main first**, then three feature sandboxes branch off it and run in parallel. |

---

## Feature breakdown

### Spec 045 — Onboarding foundation ✅ **IMPLEMENTED** *(lands on main first; not parallel)*

Small, low-risk, unblocks everything else. Ships behind no user-visible change except the `/`
router. Delivered in `specs/045-onboarding-foundation/` — 31 of 34 tasks, the remaining three being
operator-only (browser walkthrough, iOS device confirm, setting `NEXT_PUBLIC_SITE_URL` in Vercel).

**Scope**
- `web/lib/onboarding/locales.ts` — single source of truth: `LANDING_LOCALES` = the six slugs, each
  mapping slug → `Language` (from `lib/language.ts`) → BCP-47 locale. Both the routes and the
  language-adoption helper read this; nothing else may hardcode a slug list.
- `web/lib/onboarding/funnel.ts` — the funnel flag (`localStorage`, key `ortho.onboardingFunnel`),
  mirroring `announcementsSeen.ts` / `textSize.ts`: `markFunnelEntry()` / `readFunnelEntry()` /
  `clearFunnelEntry()`. Pure module, unit-tested.
- Language adoption: `adoptLandingLanguage(slug)` writes the `language` localStorage key so the
  whole downstream flow continues in that language.
- **`app/page.tsx` → the smart router** (native / signed-in / signed-out branches above). This is
  the one behavior change users see, and the one place iOS can regress — test it hard.
- ~~Six `app/landing/{en,es,…}/page.tsx` route folders.~~ **SUPERSEDED** (research §4): **one**
  dynamic route `app/landing/[locale]/page.tsx` with `generateStaticParams()` derived from the
  registry. Six hand-written folders would have made adding a seventh language a list edit *plus* a
  new directory, failing SC-006. It is a server component (the codebase's first) exporting
  per-locale `metadata`, rendering a shared placeholder client body. Real content is 046.
- `app/robots.ts` + `app/sitemap.ts` covering the six landing routes.
- ~~**Catalog marker blocks** appended to `web/lib/i18n/{bn,es,ja,zh,ko}.ts`.~~ **SUPERSEDED**
  (research §3). The app catalogs are 32–55 KB each and `useTranslate` resolves them *after* mount,
  which would flash English on a locale-fixed marketing page. The funnel got its **own** small
  catalogs at `web/lib/i18n/landing/{en,es,bn,ja,zh,ko}.ts`, and the reserved marker regions live
  there instead. The app catalogs are untouched by the funnel. Same guarantee, stronger: 046 and
  047 no longer share an edit surface with the rest of the app at all.
- Parity test: every `LANDING_LOCALES` entry has a route, a sitemap entry, and a catalog block.

**Files touched:** `web/next.config.ts` (none expected), `web/app/page.tsx`, new
`web/app/landing/*`, `web/app/robots.ts`, `web/app/sitemap.ts`, `web/lib/onboarding/*`,
`web/lib/i18n/{bn,es,ja,zh,ko}.ts` (markers only), tests.

**Acceptance**
- iOS Capacitor build still opens on `/dashboard` (guard test asserting the native branch).
- A signed-in web user hitting `/` still lands on `/dashboard` with no landing flash.
- A signed-out `es-ES` browser hitting `/` lands on `/landing/es`.
- `npm run build` emits six static landing HTML files.

---

### Spec 046 — Per-language landing pages *(sandbox 1)*

**Scope**
- Real marketing content for all six locales at `/landing/{locale}`, built from the shared
  `ortho-web` design system (calm, money-first, never-red tokens).
- **One big "Learn more" CTA** → `/tour/{locale}`. **One smaller "Log in" link** → `/sign-in`.
  Both call `adoptLandingLanguage(slug)` before navigating.
- Static single-catalog import per route (constraint 3) — no English flash.
- Full SEO: per-locale `<title>`/description, canonical, `hreflang` alternates across all six
  plus `x-default`, Open Graph / Twitter card images.
- Responsive: desktop hero + mobile-first stack, per the `ortho-web` skill.

**Depends on:** 045 (locales module, route scaffolding, adoption helper, catalog markers).

**Open content question — needs you, not an agent.** You said the point is *marketing to
different demographics*. That means the six pages should be **transcreated, not translated** —
different value propositions and social proof per market, not one English page run through five
catalogs. An agent can build the six-page machine and write a solid English page; it should not
invent market-specific positioning for Bengali or Korean audiences. Recommend: agent ships all
six with the English proposition faithfully translated, structured so copy is swappable, and you
replace the per-market messaging afterward.

---

### Spec 047 — Learn-more tour ✅ **IMPLEMENTED** *(sandbox 2)*

Built as planned, with three decisions worth recording because they were open when this was
written (details in `specs/047-learn-more-tour/research.md`):

- **Position is not in the URL at all.** The scope below left "dots indicator" open as to whether
  the address tracked the slide. It does not: `useSearchParams` fails a production build without a
  Suspense boundary, and a pushed history entry per slide would trap the Back button for five
  presses. Back now leaves the tour in one.
- **Tour copy is a sibling named export inside the marker region**, not a `LandingCatalog` field —
  the catalog object literal sits *above* the region, so a field could not have satisfied
  "copy only inside the markers". `TourCopy` and the registry live in a new
  `lib/i18n/landing/tour.ts`; `index.ts` is untouched, leaving 046 a zero-line conflict surface.
- **The tour is `noindex, follow` and stays out of the sitemap.** It is step two of a journey; six
  more indexable documents would compete with the six landing pages for the same queries.

Two spec-045 assertions in `test/i18n/landing-catalogs.test.ts` were narrowed (the "both regions
empty on delivery" case, and the directory sweep that now also excludes `tour.ts`). Everything else
in the 045 surface is untouched.

**Scope**
- `/tour/{locale}` for the same six locales, **max 5 slides**, drawn from what actually shipped:
  (1) transactions + household sharing, (2) planning — budgets & goals, (3) financial health
  score, (4) routines — recurring charges detected automatically, (5) privacy + six languages.
- Slides live in **client state, not routes** (static export makes six locales × five slides = 30
  HTML files for no benefit). Dots indicator, swipe on mobile, arrow keys on desktop, a "Skip"
  affordance on every slide.
- Both the final CTA and Skip call `markFunnelEntry()` then navigate to `/sign-in` — skipping the
  tour must not cost the user the guided hand-off.
- Same static-catalog-import rule as 046. Same design system. No `lib/store` import.
- Slide content in the `// --- spec 047 tour ---` catalog region only.

**Depends on:** 045 (funnel flag, locales, catalog markers). Independent of 046 — the two connect
only through the `/tour/{locale}` href, which 045's locales module already defines.

---

### Spec 048 — New-user hand-off to financial health *(sandbox 3)*

**Scope**
- In `app/sign-in/page.tsx`, after a successful `verifyOtp`: if `readFunnelEntry()` is set, replace
  to `/welcome/financial-profile` instead of `/dashboard`, then `clearFunnelEntry()`.
- Guard in `app/(app)/welcome/financial-profile/page.tsx`: if a profile already exists (a returning
  user who happened to walk the funnel), bounce to `/dashboard` rather than re-asking.
- **Suppress the double-ask**: mark the `financial-health` announcement seen when the hand-off
  fires, so a user who skips the questionnaire isn't immediately handed the same prompt again by
  `AnnouncementHost`.
- Preserve spec 042's "Skip is dismiss-only" contract — skipping still writes **no** profile, so
  the widget shows its honest "set up your financial profile" empty state.
- Non-funnel users: zero behavior change. Pin that with a test.

**Depends on:** 045 (funnel flag). Independent of 046/047 — it reads the flag, never the tour.

**Note the constraint:** the sign-in page renders *outside* `AppStateProvider`, so it cannot read
`userFinancialProfile` to decide. That's why the decision keys on the funnel flag alone (a
funnel-walker is new by definition) and the profile check moves to the welcome page's guard.

---

## Sequencing and sandbox mapping

```
main
 └─ feat/045-onboarding-foundation   ← DONE; merge FIRST, before the three below start
     ├─ feat/046-landing-pages       ← sandbox 1  ┐
     ├─ feat/047-learn-more-tour     ← sandbox 2  ├─ parallel, branched off 045
     └─ feat/048-new-user-handoff    ← sandbox 3  ┘
```

**045 must be on `main` before the three sandboxes are created**, so each clones a base that already
contains `lib/onboarding/locales.ts`, `funnel.ts`, `adoptLanguage.ts` and the landing catalogs. A
sandbox cut from a base without them would have to reinvent the contracts, which is the exact
duplication the foundation exists to prevent.

Use the `docker-sandbox` skill to spin these up (one microVM per feature, named by branch). Each
sandbox needs: the GitHub secret, Claude login, `web/.env.local`, and network policy — the skill's
bootstrap section covers it.

Merge 046/047/048 in any order. Their only shared files are the five i18n catalogs, in
non-adjacent marker regions, plus `web/lib/onboarding/locales.ts` which they only read.

**Brief each sandbox agent with:** this document's constraints section, the target spec number,
`docs/index.md`, and the `ortho-web` skill. The repo's convention is the full Spec Kit flow —
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` — tests-first, with
an i18n guard test covering all five catalogs for every new key.

---

## Cross-cutting requirements

- **TDD**, per repo convention. Every pure module (`locales.ts`, `funnel.ts`) unit-tested; every
  route smoke-tested; an i18n guard test per feature mirroring `test/i18n/routines-i18n.test.ts`.
- **i18n across all five catalogs** for every new string, with placeholder-arity parity.
- **No DB change and no migration** anywhere in this funnel. The funnel flag is per-device
  localStorage, exactly like `announcementsSeen` and `textSize`.
- **Bundle discipline**: landing and tour are pre-auth. They must not import `lib/store`, and each
  ships exactly one catalog. Watch the build output — a landing page pulling the app bundle is a
  bug, not a nit.
- **iOS regression watch**: `.github/workflows/capacitor-ios-ci.yml` build-verifies on every `web/**`
  push. The `/` router is the risk surface; 045 must land its native-branch guard test.

## Open questions

1. **Per-market positioning copy** (spec 046) — yours to write; see that section. Agents ship the
   structure and a faithful English-derived translation.
2. **OG/social images** — do the six locales share one image, or does each market get its own?
   Defaults to shared unless you say otherwise.
3. **Domain and analytics** — the funnel is the first place conversion measurement would pay off,
   and there is no analytics in the app today. Deliberately out of scope here; flag if you want it.
4. **`/landing` with no slug** — 045 will redirect it to the detected locale. Say so if you'd
   rather it 404.

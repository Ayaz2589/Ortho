# Phase 0 Research: Onboarding Foundation (spec 045)

All findings verified against this repository and against the bundled Next.js 16.2.9 docs in
`web/node_modules/next/dist/docs/` (per `web/AGENTS.md`: this is not the Next.js in training data —
the docs were read, not recalled).

---

## 1. Static export permits `robots.ts` and `sitemap.ts` — but not redirects

**Decision**: Use the file conventions `app/robots.ts` and `app/sitemap.ts`. Do **not** use
`next.config.ts` `redirects`.

**Rationale**: `01-app/02-guides/static-exports.md` §"Route Handlers" states Route Handlers render
a static response at `next build` (GET only), which is exactly what the `robots`/`sitemap`
conventions are. The same document's "Unsupported Features" list explicitly includes `Rewrites`,
`Redirects`, `Headers`, `Proxy`, `Cookies`, and Dynamic Routes without `generateStaticParams()`.

**Consequence**: every routing decision in this feature is a client-side effect. There is no
server-side redirect available at any point.

**Alternatives considered**: a static `app/robots.txt` file — rejected because the sitemap URL must
be built from the same configured site origin as the canonical/alternate links, and a literal file
would duplicate that origin in a second place (violates FR-002).

---

## 2. `alternates.canonical` / `alternates.languages` is the hreflang mechanism

**Decision**: Set `metadataBase` once in the root layout and emit per-locale `alternates` from each
landing route's `metadata`.

**Rationale**: `03-api-reference/04-functions/generate-metadata.md` §`alternates` documents exactly
this shape, emitting `<link rel="canonical">` plus one `<link rel="alternate" hreflang=…>` per
entry. `metadataBase` is documented as belonging in the root layout so relative URL-based metadata
fields resolve across all routes.

**Open verification (carried to quickstart)**: `x-default` does not appear anywhere in the bundled
docs. It is a plain key in the `languages` record, so it is expected to pass through verbatim, but
this must be **confirmed against built HTML** rather than assumed. If Next's types reject the key,
the fallback is a literal `<link rel="alternate" hreflang="x-default">` rendered by the landing
layout. A test asserts the built output either way.

---

## 3. The landing routes must NOT import the app translation catalogs

**Decision**: Create a **separate, small per-locale catalog set** at `web/lib/i18n/landing/` —
`en.ts`, `es.ts`, `bn.ts`, `ja.ts`, `zh.ts`, `ko.ts` — holding only funnel copy. The app catalogs
in `web/lib/i18n/*.ts` are **not touched** by the funnel.

**Rationale**: two independent constraints collide otherwise.

- FR-009 forbids an English flash, and `web/lib/i18n/index.ts`'s `useTranslate` resolves its
  catalog *after mount*, returning the English identity until then. A locale-fixed page therefore
  needs its catalog available synchronously — i.e. a static import.
- The app catalogs are large. Measured this session:

  | catalog | bytes |
  |---|---|
  | `bn.ts` | 54,621 |
  | `ja.ts` | 37,411 |
  | `ko.ts` | 35,694 |
  | `es.ts` | 35,144 |
  | `zh.ts` | 31,967 |

  Statically importing one into the most performance-sensitive page in the product — a marketing
  page reached from an ad, often on mobile — would undo exactly what spec 023 P1 achieved by making
  the catalogs dynamic. The funnel needs a few dozen strings, not two thousand.

**This supersedes the "reserved regions in the app catalogs" mechanism** sketched in
`docs/plan/onboarding-funnel.md`. The intent behind it — features 046 and 047 editing the same
files must merge cleanly — is preserved and in fact strengthened: the reserved regions now live in
the new `web/lib/i18n/landing/*.ts` files, and the app catalogs stop being a shared edit surface for
the funnel altogether. Foundation-first sequencing is unchanged.

**Alternatives considered**:
- *Reserved regions in the existing app catalogs* — rejected on bundle size, above.
- *Dynamic import of the landing catalog* — rejected: reintroduces the English flash that FR-009
  prohibits.

---

## 4. One dynamic route, not six hand-written folders

**Decision**: `web/app/landing/[locale]/page.tsx`, with `generateStaticParams()` derived from the
locale registry and `export const dynamicParams = false`.

**Rationale**: SC-006 requires that adding a seventh language be **one list edit**. Six hand-written
route folders would make it a list edit *plus* a new folder, failing that criterion. Static export
supports dynamic routes precisely when `generateStaticParams()` is present, and `dynamicParams =
false` makes unknown slugs a build-time exclusion rather than a runtime attempt.

Because the landing catalogs are small (§3), resolving them through a static map keyed by locale is
cheap — the whole set is a few KB, versus ~35 KB for a single app catalog.

**Alternatives considered**: six explicit folders each statically importing one catalog — marginally
better code-splitting, rejected because it fails SC-006 and duplicates the metadata block six times.

---

## 5. Unknown and bare landing addresses under a static host

**Decision**: two distinct mechanisms.

- **Bare `/landing`** → a real route, `web/app/landing/page.tsx`, that client-redirects to the
  detected locale. Fully within the app's control.
- **Unknown slug** (e.g. `/landing/fr`, a stale ad link) → handled by a new `web/app/not-found.tsx`
  that redirects **only** when the path begins with `/landing/`, and otherwise renders an ordinary
  calm not-found page.

**Rationale**: with `dynamicParams = false` and no server, an unknown slug cannot reach the app's
routing at all — the static host serves the 404 document. Next emits `404.html` for a static export,
so `not-found.tsx` is the only place that path can be recovered. Scoping the redirect to
`/landing/` prevents a mistyped in-app URL from throwing a signed-in user out to marketing.

**Consequence**: this feature introduces the app's first `not-found.tsx`. It must be calm and
non-alarmist per Constitution Principle IV, and it must not import `lib/store`.

**Alternatives considered**: a catch-all `[...slug]` segment under `/landing` — rejected because
static export would still need every path enumerated at build, which is impossible for arbitrary
stale links.

---

## 6. Root router ordering and the native branch

**Decision**: `web/app/page.tsx` becomes a three-branch client router, evaluated strictly in this
order:

1. `Capacitor.isNativePlatform()` → `/dashboard`. **First, unconditionally** — no session check, no
   language read, no await.
2. `await supabase.auth.getUser()` returns a user → `/dashboard`.
3. otherwise → `/landing/{detected}`.

Until a branch resolves, render the same neutral holding state the app already uses, so neither
destination is ever painted (FR-007).

**Rationale**: FR-004 is absolute and must not depend on an async result that could resolve late or
fail. Ordering it first also means the installed app performs no extra network round-trip at
launch. `web/lib/nav.ts` documents that Capacitor's iOS asset router serves `index.html` for any
extensionless path — so a *hard* navigation on native would loop; these are `router.replace()`
client navigations, which fetch segment data rather than a document, and are unaffected. No new
hard navigation is introduced by this feature.

**Test strategy**: mirror the pattern already used in five existing test files, e.g.
`test/store/context-render-isolation.test.tsx:15`:

```ts
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
```

`test/supabase/client.test.ts:34` shows the parameterized variant
(`vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))`) for asserting both
platforms in one file. The native guard test must assert the router reaches `/dashboard` **without**
`supabase.auth.getUser()` ever being called — that ordering, not just the destination, is the
regression risk.

---

## 7. Locale detection reuses existing code

**Decision**: reuse `effectiveLanguage()` from `web/lib/i18n/index.ts` and `LOCALE_BY_LANGUAGE` /
`asLanguage()` from `web/lib/language.ts`. The new registry maps *slug ↔ existing `Language`*; it
does not reimplement tag parsing.

**Rationale**: `effectiveLanguage()` already lowercases `navigator.language`, splits on `-`, and
switches on the prefix — which is exactly the regional-variant collapsing the spec's edge cases
require (`es-MX` → `Español`, `zh-TW` → `简体中文`), with English as the default for unsupported
tags. Duplicating that logic would create two sources of truth for the same question and drift.

**Consequence**: the registry is a thin bidirectional mapping — six entries of
`{ slug, language, locale }` — and slug→`Language` is its only genuinely new information.

---

## 8. Site origin for absolute URLs

**Decision**: a small module resolving, in order: `NEXT_PUBLIC_SITE_URL` → `https://` +
`NEXT_PUBLIC_VERCEL_URL` → a documented development default of `http://localhost:3000`.

**Rationale**: canonical and alternate links must be absolute. No production domain is recorded
anywhere in the repository (checked: `web/vercel.json` carries only `git.deploymentEnabled`, and
the deploy workflows pull env from Vercel rather than hardcoding a host). The layered fallback
mirrors the existing precedent in `web/lib/app-env.ts`, which resolves `NEXT_PUBLIC_APP_ENV` then
`NEXT_PUBLIC_VERCEL_ENV`. Values are read at build time, which is correct for a static export.

**Operator task**: set `NEXT_PUBLIC_SITE_URL` in the Vercel production environment before the entry
points are submitted for indexing. Until then the sitemap and canonicals will carry the Vercel
deployment host, which is functional but not the marketing domain.

---

## 9. Reserved-region delimiter format

**Decision**: paired sentinel comments in each `web/lib/i18n/landing/*.ts` file, with at least one
blank line and a non-empty line on both sides:

```ts
// --- spec 046 landing copy — insert only between these markers ---
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---
```

**Rationale**: git's diff3/ort merge conflicts only where changed hunks overlap or abut. Two
branches inserting into regions separated by a closing marker, a blank line, and an opening marker
have at least three lines of unchanged context between them — comfortably more than the zero-line
adjacency that would force a conflict. Named, paired markers also make an accidental
insert-in-the-wrong-region reviewable, and a test asserts every landing catalog carries both pairs.

**Alternatives considered**: alphabetical key ordering with no markers — rejected, since two
features adding adjacent keys in the same alphabetical neighbourhood is precisely the conflict case.

---

## 10. Shared placeholder body

**Decision**: `web/components/landing/LandingPlaceholder.tsx` — one client component taking the
resolved locale and its landing catalog, rendering the Ortho wordmark, a localized holding line, and
nothing else. The route's server `page.tsx` supplies `metadata` and renders it.

**Rationale**: keeps the first server component in the codebase as thin as possible (metadata only),
concentrates all client behavior in one reviewable file, and gives feature 046 a single, obvious
file to replace. `web/app/sign-in/page.tsx` is the precedent for a pre-auth screen that builds its
own translation without `lib/store`.

---

## Resolved unknowns summary

| Question | Resolution |
|---|---|
| Do `robots`/`sitemap` conventions survive `output: 'export'`? | Yes — static Route Handlers (§1) |
| How are hreflang links emitted? | `metadataBase` + per-route `alternates` (§2) |
| Is `x-default` supported? | Undocumented; verified against built HTML, with a literal-`<link>` fallback (§2) |
| Where does landing copy live? | New small `web/lib/i18n/landing/*.ts`; app catalogs untouched (§3) |
| Six folders or one dynamic route? | One dynamic route + `generateStaticParams` (§4) |
| How is a stale `/landing/xx` link recovered? | Scoped redirect in a new `not-found.tsx` (§5) |
| How is the native branch tested? | `vi.mock('@capacitor/core', …)`, asserting no auth call (§6) |
| Where do absolute URLs get their origin? | `NEXT_PUBLIC_SITE_URL` → Vercel host → localhost (§8) |

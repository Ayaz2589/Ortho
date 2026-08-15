# Phase 0 Research: Learn-More Tour (spec 047)

Verified against this repository and against the bundled Next.js 16.2.9 docs in
`web/node_modules/next/dist/docs/` (per `web/AGENTS.md`: this is not the Next.js in training
data — the docs were read, not recalled). Spec 045's `research.md` §1–5 is the inherited
baseline; this document only records what is **new or decided differently** for 047.

---

## 1. Route shape: a thin server component, mirroring the landing route

**Decision**: `web/app/tour/[locale]/page.tsx` — one dynamic route, a **server component**
exporting `generateStaticParams()` (from `landingSlugs()`), `dynamicParams = false`, and
`generateMetadata()`, rendering a single client child that holds all behavior.

**Rationale**: this is the shape spec 045 already proved for `/landing/[locale]`, and the same
two forces apply. SC-006-style single-edit locale addition requires deriving params from
`LANDING_LOCALES` rather than hand-writing six folders (045 research §4); and per-locale
`metadata` is only exportable from a server component. Copying a proven in-repo pattern is
worth more than novelty here — the reviewer already knows how to read it.

**Consequence**: this becomes the codebase's **second** server component (`docs/web.md` §2 says
"all `'use client'` except the landing route" — that line needs updating).

**Alternatives considered**: a `'use client'` page exporting `generateStaticParams` — rejected.
The bundled docs
(`01-app/03-api-reference/04-functions/generate-static-params.md`) document the function for
Pages and Layouts without sanctioning a client page, and the landing precedent already answers
the question. Not worth discovering the edge at build time.

---

## 2. Screen position lives in React state only — **not** in the URL

**Decision**: the deck's current index is `useState` inside the client component. No query
parameter, no route segment, no `history.pushState`.

**Rationale**: the spec permits reflecting position in the address "if that is cheap" (spec
Assumptions). It is **not** cheap here, for two independent reasons:

1. **`useSearchParams` breaks the static build without Suspense.** The bundled docs
   (`use-search-params.md:179`) state plainly: *"During production builds, a static page that
   calls `useSearchParams` from a Client Component must be wrapped in a `Suspense` boundary,
   otherwise the build fails with the Missing Suspense boundary with useSearchParams error."*
   Buying a query parameter costs a Suspense boundary and a fallback state on the most
   latency-sensitive page in the funnel.
2. **A pushed history entry per screen traps the back button.** The spec's edge case is
   explicit — *"the tour must not trap the back button."* If each advance pushes an entry, a
   visitor on screen 5 presses Back five times to leave. Keeping position out of history means
   Back does exactly one predictable thing: it leaves the tour the way they came in.

**How the edge cases are still met**:

| Edge case | Resolution |
|---|---|
| Direct entry to a middle screen | There is no middle-screen address to enter. Every entry resolves to screen 1 — a valid position, which is what the edge case asks for ("resolve to a valid position rather than erroring"). |
| Browser back during the tour | Leaves the tour immediately. No trap. |
| Abandons mid-tour, returns later | Starts at screen 1. Nothing stale is forced on them — and nothing is persisted to go stale. |

**Alternatives considered**:
- *`?screen=N` read via `useSearchParams`* — rejected on the build constraint above.
- *`?screen=N` read from `window.location.search` in an effect* — technically static-safe, but
  the value is only readable after mount, so screen 1 paints first and then jumps. Trading a
  no-flash guarantee (FR-008's whole point) for a bookmark nobody asked for is a bad deal.
- *Reading it in a `useState` initializer* — hydration mismatch: the prerendered HTML says
  screen 1, the client says screen 3.

---

## 3. Tour copy is a **separate named export** in the reserved region, not a `LandingCatalog` field

**Decision**: each `web/lib/i18n/landing/{slug}.ts` gains one named export, declared **entirely
inside** its `spec 047` marker region:

```ts
// --- spec 047 tour copy — insert only between these markers ---
export const enTour: TourCopy = { screens: [...], next: '…', … }
// --- end spec 047 ---
```

`TourCopy` and the slug-keyed `TOUR_CATALOGS` map live in a **new** 047-only file,
`web/lib/i18n/landing/tour.ts`. `web/lib/i18n/landing/index.ts` and the `LandingCatalog`
interface are **not touched**.

**Rationale**: FR-009 requires all copy to live inside the reserved region. The obvious design —
adding `tour: TourCopy` to `LandingCatalog` — cannot satisfy that: the object literal
`const en: LandingCatalog = { … }` sits *above* the region, so the copy would have to go outside
it. A sibling named export is the only shape that puts 100% of the copy inside the markers.

It also **eliminates the conflict surface with spec 046** entirely. The two features merge in any
order (spec Overview), and the marker mechanism (045 research §9) protects the per-locale files —
but `index.ts` is unprotected shared ground. Not editing it means 046 can restructure
`LandingCatalog` freely and 047 never collides.

**Consequence**: a new file is added to `lib/i18n/landing/`. The 045 guard test
`landing-catalogs.test.ts` enumerates `[...landingSlugs(), 'index']` by name, so it does not
sweep the directory for imports — 047 adds its own equivalent guard for `tour.ts`.

**Alternatives considered**:
- *`tour` as a `LandingCatalog` field* — rejected: violates FR-009 and adds an `index.ts`
  conflict with 046 for no gain.
- *A separate `lib/i18n/tour/*.ts` catalog set* — rejected: the reserved regions exist precisely
  so 047's copy lands in the landing catalogs; a seventh directory would strand them.

---

## 4. Three spec-045 test assertions must change — all narrowings

**Decision**: `web/test/i18n/landing-catalogs.test.ts` is edited in two places, both narrowings:

1. `'leaves both regions empty on delivery'` → `'leaves the 046 region empty'`. That assertion
   encodes spec 045's FR-025 (*"this feature adds no marketing or tour text"*) — a statement about
   what **045** delivered, not a standing invariant. 047 filling its own region is the mechanism
   working as designed. Narrowing rather than deleting keeps the guard live for 046, which has not
   landed yet.
2. `'has exactly one catalog file per registry slug'` excludes `tour.ts` as well as `index.ts`.
   The case sweeps the directory and subtracts known non-catalog modules; §3 adds a second one.
   Excluding it **by name** keeps the assertion a real one-file-per-slug check rather than letting
   it decay into a file count.

And `web/test/onboarding/funnel.test.ts` in one:

3. `'is imported by no production module in this feature'` becomes `'is set by the tour and by
   nothing else'`. This is spec 045's FR-019 — the foundation defines the marker but must not act
   on it — and **047 is the feature it was waiting for**. Narrowed to name the one permitted
   caller (`components/tour/TourDeck.tsx`) rather than deleted, so a *second* writer appearing
   still fails. A companion case was added asserting `readFunnelEntry`/`clearFunnelEntry` still
   have no production caller, since that half of FR-019 belongs to spec 048 and is not yet claimed.

*(The second and third were found by running the suite, not by reading it — the original estimate
of "one assertion" was wrong twice. Recorded rather than quietly fixed, since the count is exactly
the sort of thing the next feature will want to trust. The third failure is the system working:
a guard written by the foundation forced 047 to state explicitly that it is the intended caller.)*

**Verified non-issues** (checked, no change needed):
- *The `<30,000` byte budget.* All six catalogs totalled 4,258 bytes before this feature and
  **13,928 bytes** after — well under the guard, and still far below one 32–55 KB app catalog.
- *`KEYS`-driven quality guards.* They iterate a fixed `KEYS` array over `LANDING_CATALOGS`, so a
  new named export is invisible to them. 047 supplies its own equivalents over `TOUR_CATALOGS`.
- *`no-eager-catalog.test.ts`.* Already skips this directory (noted in the 045 guard's comment).

---

## 5. Reduced motion is already handled globally — the tour must use CSS, not JS, to inherit it

**Decision**: **the screens have no motion at all** — they swap instantly. The only transitions in
the feature are the controls' press feedback, which is CSS and carries Tailwind's
`motion-reduce:transition-none`. No JS animation loop, no `requestAnimationFrame`, no animation
library.

**Rationale**: `web/app/globals.css:263–272` already ships a global reduced-motion reset —
`transition-duration: 0.01ms !important` on `*`, `*::before`, `*::after` — so any CSS transition is
covered for free, and a JS-driven animation would be the one thing that **escapes** it. But the
stronger move for the screens themselves is to have no motion: it is calmer (Principle II), and it
means the content is never mid-animation when someone arrives, which is what FR-008's no-flash rule
is really protecting. Reduced motion is then correct *by construction* rather than by a rule that
has to keep working.

*(Revised during implementation. The first pass put `transition-opacity` on a `key`-ed wrapper —
which never animates, because a changed `key` remounts the element rather than transitioning it.
Asserting reduced-motion compliance on CSS that does nothing would have been a test that passed
while proving nothing, so the dead transition was removed and the assertion rewritten to pin what
is actually true: the screen wrapper carries no `transition`/`animate` class, and every control
does carry the opt-out.)*

**Test approach**: `test/setup.ts` stubs `window.matchMedia` to `matches: false`, so a
media-query-reading hook would silently test the "motion on" branch only. Asserting the class is
present is deterministic and honest about what is being pinned.

**Alternatives considered**: a `useReducedMotion()` hook over `matchMedia` — rejected: more code,
a jsdom stub to fight, and it duplicates a global rule that already works.

---

## 6. Swipe: React touch handlers with a vertical-dominance guard

**Decision**: `onTouchStart` / `onTouchEnd` on the deck element. Record the start point; on end,
advance or go back when horizontal travel exceeds **44 px** *and* exceeds vertical travel.

**Rationale**: the codebase has **no** existing swipe utility (`grep` for
`onTouchStart|swipe|touchstart` across `app/`, `components/`, `lib/` hits only
`TransactionsDesktop.tsx` and `globals.css`), so there is nothing to reuse and nothing to match.
React synthetic touch events are what `fireEvent.touchStart/touchEnd` drives in jsdom, which
keeps US2's swipe scenarios genuinely testable rather than manual-only.

The vertical-dominance guard is what stops a diagonal scroll gesture from stealing a page scroll —
the standard failure of naive swipe handlers. 44 px matches the constitution's touch-target floor,
so the threshold is not a new invented constant.

**Alternatives considered**:
- *Pointer events* — unify mouse and touch, which is exactly wrong here: a desktop click-drag
  across the copy would page the deck.
- *A swipe library* — rejected on FR-013 (no new runtime dependency).

---

## 7. The tour is `noindex` and stays out of the sitemap

**Decision**: `generateMetadata` returns `robots: { index: false, follow: true }`. `app/sitemap.ts`
is unchanged.

**Rationale**: 045's sitemap deliberately lists only the six landing pages — the funnel's intended
entry points. The tour is step two of a journey; a searcher dropped into screen 1 of a tour has
skipped the page that explains what the product is. `follow: true` still lets crawlers traverse to
sign-in. Per-locale `title` is still emitted so a **shared link** previews correctly, which is the
realistic way a tour URL travels.

**Alternatives considered**: adding the tour to the sitemap — rejected: six more indexable
documents competing with the six landing pages for the same queries.

---

## 8. No `@/components/ui` — it transitively imports the store

**Decision**: the tour renders its own controls with tokens and Tailwind, reusing
`PrimaryButton`'s visual recipe (`h-12 w-full rounded-full`, `background: var(--text)`, label in
`var(--bg)`) without importing it.

**Rationale**: `web/components/ui.tsx:5` is `import { useApp } from '@/lib/store'`. Importing
`PrimaryButton` would pull Supabase and the entire household data layer into a pre-auth page,
breaking FR-010 and the funnel plan's bundle-discipline rule. `app/sign-in/page.tsx` does import
it — that is a pre-existing cost on a page that needs auth anyway, not a precedent to copy onto a
signed-out marketing surface. `LandingPlaceholder.tsx` is the right precedent: tokens only.

**Consequence**: ~8 lines of duplicated button classes. Accepted deliberately, and cheaper than
splitting `ui.tsx` (which would touch dozens of unrelated imports in a funnel PR).

---

## 9. Language adoption fires on leaving, not on arriving

**Decision**: one shared `leaveForSignIn()` action, called by **both** the finish CTA and Skip,
performing exactly three steps in order: `adoptLandingLanguage(slug)` → `markFunnelEntry()` →
`router.push('/sign-in')`.

**Rationale**: 045's `adoptLanguage.ts` header states adoption happens *"ONLY on an explicit
continue action, never on page view (FR-014)"* — a visitor opening a shared `/tour/ja` link must
not have their language preference silently rewritten. Finish and Skip are both explicit
continues, so both adopt; a visitor who leaves by closing the tab changes nothing.

Routing **both** exits through one function is also the structural defense for FR-006, the
requirement the spec's own checklist flags as the one most likely to be got backwards. Skip
cannot forget to mark the funnel, because Skip does not have its own path.

`push`, not `replace`: the visitor should be able to press Back from sign-in and return to the
tour.

---

## 10. Native guard: mirror the root router, first and synchronously

**Decision**: the client component's first effect is
`if (Capacitor.isNativePlatform()) { router.replace('/dashboard'); return }`, and it renders
`null` until that has been evaluated.

**Rationale**: FR-011/SC-006 — the installed app must never show the tour. 045 research §6
established both the ordering rule and the test pattern
(`vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))`). Unlike
the root router there is no auth call to race against, so the requirement here is simply that
nothing of the tour paints before the platform check.

---

## Resolved unknowns summary

| Question | Resolution |
|---|---|
| Server or client page? | Thin server component + client child, mirroring `/landing/[locale]` (§1) |
| Position in the URL? | No — `useState` only; `useSearchParams` would break the static build (§2) |
| Where does tour copy live? | A named export **inside** the `spec 047` region; new `tour.ts` registry; `index.ts` untouched (§3) |
| Do 045's tests need changing? | One assertion narrowed; byte budget and quality guards verified fine as-is (§4) |
| How is reduced motion respected? | CSS transition only — `globals.css` already resets it globally (§5) |
| How is swipe implemented and tested? | React touch handlers, 44 px + vertical-dominance guard (§6) |
| Should the tour be indexed? | No — `noindex, follow`; sitemap unchanged (§7) |
| Can the tour use `PrimaryButton`? | No — `components/ui.tsx` imports `lib/store` (§8) |
| When is the language adopted? | On explicit exit, in the one shared action both Finish and Skip call (§9) |
| How is the native guard ordered? | First effect, renders nothing until checked (§10) |

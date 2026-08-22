# Contracts: Learn-More Tour (spec 047)

The tour exposes no network API. Its contracts are (a) the **addresses** it answers on, (b) the
**module interfaces** it publishes, (c) the **inherited** spec-045 interfaces it consumes without
modifying, and (d) the **accessible DOM contract** the tests assert against.

---

## 1. Address contract

| Address | Produced by | Behavior |
|---|---|---|
| `/tour/en`, `/tour/es`, `/tour/bn`, `/tour/ja`, `/tour/zh`, `/tour/ko` | `generateStaticParams()` from `landingSlugs()` | Renders the deck in that language, starting at screen 1. |
| `/tour/<anything else>` | Excluded at build (`dynamicParams = false`) | The static host serves `404.html`; `app/not-found.tsx` renders its calm page. Its redirect is scoped to `/landing/`, so an unknown tour slug does **not** bounce to marketing — matching the spec edge case "same recovery as the landing routes" as that route actually behaves. |
| `/tour` (bare) | **Not** a route | Out of scope. The tour is entered from a landing CTA or a shared per-locale link; 045's bare `/landing` exists because ad links stop there, which does not apply here. |

**Exit address**: `/sign-in`, always, from both Finish and Skip (FR-005).

**Static-export invariant**: adding a seventh language is one edit to `LANDING_LOCALES`. No slug is
restated in this feature.

---

## 2. Published module interfaces

### `web/lib/onboarding/tour.ts` (pure)

```ts
export const SWIPE_THRESHOLD_PX: 44

export function clampScreen(index: number, total: number): number
export function nextScreen(index: number, total: number): number
export function prevScreen(index: number, total: number): number
export function swipeIntent(dx: number, dy: number): 'next' | 'prev' | 'none'
export function formatPosition(template: string, current: number, total: number): string
```

Guarantees:

- **Total.** No input throws. `NaN`, `Infinity`, negatives and fractions all resolve to a valid
  index; `total <= 0` returns `0`.
- **Saturating, not wrapping.** `nextScreen(last)` is `last`, `prevScreen(0)` is `0`. The deck has
  ends, not a carousel — wrapping past the finish would hide the exit.
- **Pure.** No DOM, no storage, no clock, no React import.

### `web/lib/i18n/landing/tour.ts`

```ts
export interface TourScreen { title: string; body: string }
export interface TourCopy {
  screens: readonly TourScreen[]
  next: string; back: string; skip: string; finish: string
  position: string      // positional placeholders {0} current, {1} total
  regionLabel: string
}

export const TOUR_SCREEN_COUNT: 5
export const TOUR_CATALOGS: Record<LandingSlug, TourCopy>
export function tourCatalog(slug: string): TourCopy   // English fallback
```

Guarantee: statically imported, never `import()`-ed — the deck's first painted frame is already in
the right language (FR-008).

### `web/components/tour/TourDeck.tsx`

```ts
export function TourDeck(props: { locale: LandingLocale; copy: TourCopy }): JSX.Element | null
```

Returns `null` until the native platform check has run (FR-011): nothing of the tour may paint
inside the installed app, not even for a frame.

### `web/app/tour/[locale]/page.tsx`

```ts
export function generateStaticParams(): { locale: string }[]
export const dynamicParams: false
export function generateMetadata(props): Promise<Metadata>
export default function TourPage(props): Promise<JSX.Element>
```

---

## 3. Inherited interfaces — consumed, never modified

| Interface | Module | How 047 uses it |
|---|---|---|
| `LANDING_LOCALES`, `landingSlugs()`, `localeForSlug()` | `lib/onboarding/locales.ts` | Read only. The six slugs are never restated. |
| `markFunnelEntry()` | `lib/onboarding/funnel.ts` | Called by the single shared exit — therefore by **both** Finish and Skip (FR-006). 047 is this function's first caller; `readFunnelEntry`/`clearFunnelEntry` belong to 048. |
| `adoptLandingLanguage(slug)` | `lib/onboarding/adoptLanguage.ts` | Called by the same shared exit, honoring 045's "explicit continue only" rule. |
| Reserved regions | `lib/i18n/landing/*.ts` | All copy inserted strictly between the `spec 047` markers. The `LandingCatalog` interface and `index.ts` are untouched, so spec 046 has zero conflict surface. |

**Negative contract** (asserted by a module-graph guard test, mirroring 045's):

`app/tour/[locale]/page.tsx`, `components/tour/TourDeck.tsx`, `lib/onboarding/tour.ts` and
`lib/i18n/landing/tour.ts` import **none** of:

- `@/lib/store` — the household data layer
- `@/lib/supabase/client` — the auth/network client
- `@/lib/i18n/{bn,es,ja,zh,ko}` — the 32–55 KB app catalogs
- `@/components/ui` — which itself imports `@/lib/store` (research §8)

---

## 4. Accessible DOM contract

What the behavior tests assert against — public, accessible structure, not internals
(Principle VI).

| Element | Contract |
|---|---|
| Deck region | `role="region"` with an accessible name from `copy.regionLabel`, and `lang` set to the locale's BCP-47 tag so assistive tech and font selection resolve correctly. |
| Screen title | An `<h1>` — one per rendered screen. Only the current screen is in the DOM. |
| Screen wrapper | `aria-live="polite"`. Advancing moves no focus, so without it a screen-reader user presses Next and hears nothing. |
| Text contrast | The deck uses **no `text-text-3`** anywhere: measured against the tokens it is 2.18:1 in light and 2.85:1 in dark, failing AA in both. Body copy uses full-strength `text-text` (16.26:1) because on a tour screen the body *is* the primary reading text; the position indicator and Skip use `text-text-2`. |
| Next / Back / Skip / Finish | Real `<button>` elements, reachable in DOM order **advance → back → skip** (advance first because it is what most visitors came to do; back and skip share the row beneath it, which also keeps ~50px of chrome off the fold on a small phone). Skip is present on **every** screen; Back is absent on the first; Next is replaced by Finish on the last. |
| Position | Rendered as **text** (`copy.position` with `{0}`/`{1}` filled), not by colored dots alone — meaning is never carried by color (Principle I). Decorative dots accompany it and are `aria-hidden`. |
| Keyboard | `ArrowRight` advances, `ArrowLeft` goes back, anywhere in the tour — but **only unmodified**. `Cmd+←`/`Alt+←` is browser Back; acting on it too would navigate away *and* step the deck, so returning would land on a different screen than the one they left. |
| Touch | `touchstart` + `touchend` on the deck; intent decided by `swipeIntent`. |
| Motion | The screen content carries **no** `transition`/`animate` class — screens swap instantly, so there is no screen motion to suppress. The controls' press feedback is CSS and carries `motion-reduce:transition-none`, and is also covered by `globals.css`'s global `prefers-reduced-motion` reset (research §5). |

---

## 5. Metadata contract

| Field | Value |
|---|---|
| `title` | Per-locale, from the tour catalog. Distinct per language, so a shared link previews in the right one. |
| `robots` | `{ index: false, follow: true }` — the tour is a funnel step, not a search destination (research §7). |
| `sitemap.ts` | **Unchanged.** Only the six landing pages are listed. |
| `alternates` | Not emitted. Deliberate: hreflang exists to let a search engine pick the right language, and a `noindex` page has no search result to pick. |

# Contract: The landing page surface (spec 046)

The interface this feature exposes is not an API — it is a **page**. Its consumers are a visitor
using a keyboard or a screen reader, a search crawler, and spec 047, which will build the
destination one of its two links points at. This document states what each of them can rely on.

Everything here is asserted by a test unless marked **(browser check)**, in which case it is a
quickstart step.

---

## 1. Component contract — `LandingView`

**Module**: `web/components/landing/LandingView.tsx`
**Replaces**: `web/components/landing/LandingPlaceholder.tsx` (deleted)

```ts
export function LandingView(props: {
  locale: LandingLocale   // a LANDING_LOCALES entry, supplied by the route
  copy: LandingCatalog    // LANDING_CATALOGS[locale.slug], statically resolved
}): JSX.Element
```

### Guarantees

| # | Guarantee | Why it matters |
|---|---|---|
| C1 | Renders `copy.landing.headline`, `copy.landing.subhead`, and every entry of `copy.landing.points`, in array order | FR-001; the array is what lets a locale ship a different number of points (US3) |
| C2 | Renders exactly **two** interactive elements: the primary anchor and the sign-in anchor | FR-001 — "one prominent action and one quieter link", not three |
| C3 | The primary anchor's `href` is `/tour/{locale.slug}` | FR-002 |
| C4 | The sign-in anchor's `href` is `/sign-in` | FR-002 |
| C5 | The primary anchor precedes the sign-in anchor in DOM order | FR-009 — keyboard order must match visual weight |
| C6 | Activating **either** anchor calls `adoptLandingLanguage(locale.slug)` before navigation | FR-003 |
| C7 | Rendering alone writes nothing to `localStorage` | FR-004 — this is the difference between a language *preference* and a language *page* |
| C8 | The content subtree carries `lang={locale.locale}`, and `document.documentElement.lang` is set on mount and restored on unmount | inherited from `LandingPlaceholder`; the root layout hardcodes `lang="en"` |
| C9 | Imports neither `@/lib/store`, nor an app catalog (`@/lib/i18n/{bn,es,ja,zh,ko}`), nor `@/lib/supabase/client` | FR-007 — a pre-auth page must not bootstrap the household data layer |
| C10 | Uses design tokens only — no hardcoded color, no shadow on inset content, nothing red | FR-008, Constitution I/II |
| C11 | Both anchors are real `<a href>` elements | FR-009, and the crawlable link from landing → tour is the funnel's SEO purpose |

### Deliberate non-guarantees

- **No `next/link`.** `/tour/{slug}` does not exist until spec 047; `Link` would prefetch a 404 on
  every view (research §2).
- **No loading, error, or empty state.** The copy is statically imported and always present; a
  branch for its absence would be unreachable code.
- **No analytics, no cookie banner, no consent gate.** The app has none (spec Assumptions).
- **Nothing is memoized or lazily loaded.** The whole point is that the first painted frame is
  complete and in the right language.

---

## 2. Route contract — `/landing/{slug}` (inherited, extended)

**Module**: `web/app/landing/[locale]/page.tsx` — unchanged in structure (spec 046 renders
`LandingView` instead of `LandingPlaceholder` and nothing else).

| # | Guarantee | Status |
|---|---|---|
| R1 | One statically exported document per `landingSlugs()` entry | inherited from 045, unchanged |
| R2 | `dynamicParams === false` | inherited, unchanged |
| R3 | Per-locale `title` / `description`, each distinct from English | inherited; **values rewritten** to the new proposition (FR-012) |
| R4 | `alternates.canonical` + six `hreflang` entries + `x-default` → English | inherited, unchanged |
| R5 | `openGraph.locale` is the BCP-47 tag | inherited, unchanged |
| R6 | No OpenGraph *image* is added | deferred — not trivial under `output: 'export'` (research §8) |

---

## 3. Catalog contract — `web/lib/i18n/landing/*.ts`

| # | Guarantee |
|---|---|
| K1 | `LandingCatalog.landing: LandingCopy` is required — a locale cannot ship without copy |
| K2 | `placeholderLine` no longer exists on the interface or in any catalog |
| K3 | All of 046's copy is declared inside the `spec 046` marker region |
| K4 | The `spec 047` marker region is left **empty**, and its markers are intact and correctly ordered in all six files |
| K5 | No non-English catalog carries an English string for any copy key |
| K6 | bn / ja / zh / ko copy is written in that language's script |
| K7 | The six catalogs together stay under 30,000 bytes |
| K8 | `points` is non-empty in every locale |

**K4 is the contract spec 047 depends on.** 046 must not consume, reorder, or tidy away the tour
region; a parallel branch is going to insert into it.

---

## 4. Language hand-off contract (consumed, not defined)

`adoptLandingLanguage(slug)` is spec 045's. This feature only guarantees *when* it is called:

```
view page          → not called          (FR-004)
click primary CTA  → called, then navigate to /tour/{slug}
click sign-in      → called, then navigate to /sign-in
storage throws     → swallowed inside adoptLandingLanguage; navigation still happens
unknown slug       → unreachable here (dynamicParams: false), and a no-op if reached
```

Downstream (`/sign-in`, the app shell) reads the `language` key on mount and needs no change.

---

## 5. Accessibility & responsive contract

| # | Guarantee | Verified by |
|---|---|---|
| A1 | Both actions reachable by keyboard in DOM order | test (C5) + **(browser check)** for the visible ring |
| A2 | Visible focus ring on both | the global `:where(a, button, …):focus-visible` rule in `globals.css`; **(browser check)** |
| A3 | Hit targets ≥ 44px on the primary action | `h-12` (48px); **(browser check)** at each text-size level |
| A4 | One `<h1>`, and the points do not outrank it | test asserts heading levels |
| A5 | Content capped and centered; no horizontal body scroll, 320px → 2560px | **(browser check)** — jsdom has no layout engine |
| A6 | Correct in both light and dark | **(browser check)** — tokens make it structural, but confirm |
| A7 | `prefers-reduced-motion` respected | inherited global rule; no new animation is introduced |

A5–A7 are honestly out of reach for the unit suite. Asserting "no horizontal scroll" in jsdom would
pass regardless of the CSS and is worth less than nothing.

# Data Model: Per-Language Landing Pages (spec 046)

**There is no database change in this feature** — no table, no migration, no RLS policy, no new
column (FR-013). The only persisted value it touches is the pre-existing `language` key in
`localStorage`, written through spec 045's `adoptLandingLanguage()` and never written by this
feature directly.

What follows is therefore a *content* model: the shape of the copy each locale supplies, and the
one piece of client state the page can change.

---

## 1. `LandingCopy` — one locale's marketing positioning

Declared in `web/lib/i18n/landing/index.ts`, populated inside the `spec 046` reserved region of each
of the six catalogs.

```ts
export interface LandingPoint {
  /** Short label for one supporting idea. A phrase, not a sentence. */
  title: string
  /** One or two plain sentences expanding the title. */
  body: string
}

export interface LandingCopy {
  /** The proposition. The largest text on the page and the first thing read. */
  headline: string
  /** One sentence expanding the headline. Sits directly beneath it. */
  subhead: string
  /**
   * Supporting ideas, rendered in order. LENGTH IS PER-LOCALE AND DELIBERATE:
   * the component maps over whatever it is given, so a market that needs two
   * points or four needs no component change (US3 acceptance scenario 2).
   */
  points: LandingPoint[]
  /** Label on the prominent action leading to /tour/{slug}. */
  primaryCta: string
  /** The quiet line preceding the sign-in link, e.g. "Already have an account?". */
  secondaryPrompt: string
  /** Label on the sign-in link. Matches the app catalogs' existing "Sign in" translation. */
  secondaryCta: string
}
```

### Validation rules

| Rule | Enforced by |
|---|---|
| Every field is a non-empty string in all six locales | `test/i18n/landing-catalogs.test.ts` |
| `points` has at least one entry in every locale | `test/i18n/landing-catalogs.test.ts` |
| No non-English catalog repeats the English string for any field | existing "leaves no English string" guard, extended to the new keys |
| bn/ja/zh/ko copy is written in that language's script | existing script-plausibility guard, extended to the new keys |
| All six catalogs together stay under 30,000 bytes | existing byte-budget guard (unchanged limit) |
| Copy lives only inside the `spec 046` region | existing region guard, narrowed from "both regions empty" to "047's region empty" |

### Why `points` is an array

This is the mechanism by which US3 is satisfied and the reason the model is not six flat strings.
FR-011 and US3 acceptance scenario 2 require that a locale be able to carry a *different number* of
supporting ideas without a per-locale branch in the component. An array read by a `map` gives that
for free; numbered keys (`point1Title`, `point2Title`, …) would not, and would silently force every
market into the same rhetorical shape.

All six locales ship **three** points today. That is a content decision, not a structural one.

---

## 2. `LandingCatalog` — the change to the existing interface

`LandingCatalog` (spec 045) gains one required field and loses one:

```diff
 export interface LandingCatalog {
   metaTitle: string
   metaDescription: string
-  /** The single line the placeholder renders. Feature 046 replaces this surface. */
-  placeholderLine: string
   notFoundLine: string
   notFoundCta: string
+  /** This locale's marketing page copy. */
+  landing: LandingCopy
 }
```

`placeholderLine` is removed because the headline supersedes it (research §4): leaving both would
put two competing propositions in every catalog, only one of which any code reads.

`metaTitle` / `metaDescription` stay top-level — the route reads `copy.metaTitle` and spec 047 does
not touch the landing route's metadata, so there is nothing to keep apart there (research §8). Their
*values* are rewritten to match the new proposition (FR-012).

### Per-catalog file shape

```ts
import type { LandingCatalog, LandingCopy } from './index'

const base = { metaTitle, metaDescription, notFoundLine, notFoundCta }

// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = { headline, subhead, points, primaryCta, secondaryPrompt, secondaryCta }
// --- end spec 046 ---

// --- spec 047 tour copy — insert only between these markers ---
// --- end spec 047 ---

const en: LandingCatalog = { ...base, landing }
export default en
```

The marker regions sit between the declarations and the composition in all six files (verified), so
a region holds a *declaration*, not object properties. The final composition line is the one place
046 and 047 both edit — a known, accepted one-line merge surface (research §3).

---

## 3. Client state: the `language` preference

The only state this feature can change, and it changes it through a spec 045 contract rather than
directly.

| Property | Value |
|---|---|
| Key | `language` (pre-existing; read by `app/sign-in/page.tsx` and `lib/store.tsx`) |
| Written by | `adoptLandingLanguage(slug)` — `web/lib/onboarding/adoptLanguage.ts` |
| Value written | the registry's `Language` (e.g. `'Español'`), never the slug |
| Written when | a visitor activates the primary CTA **or** the sign-in link |
| Never written when | the page is merely viewed, scrolled, or unmounted (FR-004) |
| On storage failure | swallowed inside `adoptLandingLanguage`; navigation proceeds |

**The view/act distinction is the feature's sharpest contract.** A visitor who follows a shared
Japanese link keeps their Spanish preference unless they choose to continue. Both halves are pinned:
one test renders and asserts the key is still absent; another clicks and asserts the exact value.

`funnel.ts`'s `markFunnelEntry()` is **not** called by this feature. Per spec 045 FR-019 the marker
is set by 047 (the tour) and read by 048 — a landing page view is not yet a journey.

---

## 4. Entity relationships

```
LANDING_LOCALES (spec 045, six entries)
   │  slug ─────────────────────────────────► route param /landing/{slug}
   │  slug ─────────────────────────────────► LANDING_CATALOGS[slug]
   │  language ─────────────────────────────► localStorage 'language'  (on act only)
   │  locale (BCP-47) ──────────────────────► <div lang> + <html lang> + hreflang
   │
   └── LANDING_CATALOGS[slug].landing : LandingCopy
             ├── headline, subhead ──────────► the proposition
             ├── points[] ───────────────────► supporting ideas (variable length)
             ├── primaryCta ─────────────────► <a href="/tour/{slug}">
             └── secondaryPrompt + secondaryCta ─► <a href="/sign-in">
```

Adding a seventh language remains one edit to `LANDING_LOCALES` plus one new catalog file. This
feature adds no second place where the slug list is restated (SC-006 preserved).

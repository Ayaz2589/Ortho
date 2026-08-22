# Phase 1 Data Model: Learn-More Tour (spec 047)

**There is no database entity in this feature.** No table, no migration, no column. The only
persisted byte is the per-device `ortho.onboardingFunnel` flag, which spec 045 already owns
(`web/lib/onboarding/funnel.ts`) and 047 only *writes* through `markFunnelEntry()`.

What follows is therefore the **in-memory and content model**: the shapes the tour holds in client
state and the copy it renders.

---

## 1. `TourCopy` — the per-locale content entity

Defined in the new `web/lib/i18n/landing/tour.ts`. One instance per locale, declared inside that
locale file's `spec 047` reserved region.

```ts
export interface TourScreen {
  /** One short line naming what this screen is about. */
  title: string
  /** Two sentences at most, second-person, describing a capability that ships today. */
  body: string
}

export interface TourCopy {
  /** Ordered, exactly TOUR_SCREEN_COUNT long. Order is the tour order. */
  screens: readonly TourScreen[]
  /** Advance control, shown on every screen except the last. */
  next: string
  /** Back control, shown on every screen except the first. */
  back: string
  /** Skip control — present on EVERY screen (FR-004). */
  skip: string
  /** The last screen's advance control, which exits to sign-in. */
  finish: string
  /** Position, with positional placeholders: '{0}' current, '{1}' total. */
  position: string
  /** Accessible name for the deck region. */
  regionLabel: string
}
```

### Validation rules

| Rule | Source | Enforced by |
|---|---|---|
| `screens.length === 5` for every locale | FR-002 ("at most five"), fixed at 5 | `tour-catalogs.test.ts` |
| Every string non-empty after trim | FR-008 | `tour-catalogs.test.ts` |
| No non-English catalog reuses an English string | Translation-completeness (mirrors 045's guard) | `tour-catalogs.test.ts` |
| `bn`/`ja`/`zh`/`ko` written in their own script | Catches paste-into-wrong-file | `tour-catalogs.test.ts` |
| `position` contains both `{0}` and `{1}` in every locale | Placeholder-arity parity (funnel-plan cross-cutting requirement) | `tour-catalogs.test.ts` |
| All copy lies **between** the `spec 047` markers | FR-009 | `tour-catalogs.test.ts` (source-text assertion) |
| `TOUR_CATALOGS` keys === `landingSlugs()` | Adding a 7th language stays one registry edit | `tour-catalogs.test.ts` |

### Registry

```ts
export const TOUR_CATALOGS: Record<LandingSlug, TourCopy>
export function tourCatalog(slug: string): TourCopy   // falls back to English
export const TOUR_SCREEN_COUNT = 5
```

Mirrors `LANDING_CATALOGS` / `landingCatalog()` deliberately — same shape, same fallback rule, so
there is one idiom in the directory rather than two.

---

## 2. Deck state — the client entity

Held in `TourDeck.tsx`. Not persisted anywhere, by design (research §2).

| Field | Type | Initial | Notes |
|---|---|---|---|
| `index` | `number` | `0` | Zero-based screen position. Always `0 ≤ index < screens.length` — every mutation goes through `clampScreen`. |
| `touchStart` | `{ x: number; y: number } \| null` | `null` | Set on `touchstart`, consumed and cleared on `touchend`. Never rendered. |
| `checkedPlatform` | `boolean` | `false` | Gates the first paint until the native guard has run (FR-011). |

### State transitions

```text
                 next / ArrowRight / swipe-left
      screen i  ───────────────────────────────▶  screen min(i+1, 4)
                 back / ArrowLeft / swipe-right
      screen i  ◀───────────────────────────────  screen max(i-1, 0)

      any screen ──── skip ────▶ ┐
      screen 4   ──── finish ──▶ ├──▶ leaveForSignIn() ──▶ /sign-in
                                 ┘
```

`leaveForSignIn()` is a single function with a fixed, ordered body (research §9):

1. `adoptLandingLanguage(slug)` — the visitor is explicitly continuing, so their language follows.
2. `markFunnelEntry()` — **both** exits, never one. This is FR-006, the requirement the spec's
   checklist flags as most likely to be inverted.
3. `router.push('/sign-in')` — `push`, not `replace`, so Back returns to the tour.

Steps 1 and 2 are best-effort by construction: both 045 modules swallow storage failures
internally, so step 3 runs even when storage is unavailable (spec edge case: *"the tour still
completes and still navigates; only the marker is skipped"*).

**Invariant**: there is no code path from a control to `/sign-in` that does not pass through
`leaveForSignIn`. Skip cannot forget to mark the funnel because Skip has no path of its own.

---

## 3. Screen content — the five screens

Every screen maps to a shipped feature. Verified in-repo on this branch:

| # | Screen | Shipped feature it describes | Evidence |
|---|---|---|---|
| 1 | Transactions & shared costs | Transactions + household splits | `web/app/(app)/transactions/`, `web/lib/splits.ts` |
| 2 | Planning | Budgets & goals hub (spec 038) | `web/app/(app)/planning/{,budget,goals}/page.tsx`, `web/lib/planning/planSummary.ts` |
| 3 | Financial health | Health score (spec 041) | `web/lib/finance/financialHealth.ts`, `web/app/(app)/settings/financial-profile/` |
| 4 | Routines | Recurring-charge detection (spec 044) | `web/lib/finance/routines.ts`, `web/app/(app)/routines/page.tsx` |
| 5 | Language & household privacy | Six languages + household-scoped RLS | `web/lib/language.ts`, `is_household_member` policies in `supabase/migrations/` |

### English source copy

The five other locales are translations of exactly these.

1. **Everything you spend, in one place**
   *Add what you spend and mark what's shared. Ortho works out each person's share, so nobody has
   to keep a running tally in their head.*
2. **Plan the month before it happens**
   *Set a budget by category and put money aside for what's coming. Ortho follows the pace and
   shows you what's left to plan.*
3. **A steady read on where you stand**
   *Answer a few questions and Ortho gives you one score covering cash flow, savings and what
   you're committed to — with a next step, never a warning light.*
4. **Ortho notices what repeats**
   *Subscriptions, rent, the same shop every week — recurring charges are found for you. Confirm
   the ones that are real and Ortho keeps track of them.*
5. **Yours, and your household's**
   *Ortho speaks six languages, and your numbers are visible only to the people you share a
   household with.*

**Content rules applied** (US3):

- No feature is named that does not exist. Screen 3 deliberately does **not** state a dimension
  count: the engine has six as of spec 044 and had five before it, so a number would be a claim
  that rots.
- **No example money anywhere.** US3 scenario 3 constrains how amounts must render; the calmest
  way to satisfy it is to have no amounts. This also keeps the screens currency-neutral, which
  matters when the same deck ships in six languages.
- Second-person and declarative. No superlatives, no urgency, no "start saving today".

---

## 4. Pure helpers — `web/lib/onboarding/tour.ts`

No state of their own; extracted so the edge cases are pinned by fast node tests rather than only
through the DOM.

| Function | Signature | Contract |
|---|---|---|
| `clampScreen` | `(index: number, total: number) => number` | Returns an index within `[0, total-1]`. Non-finite, negative, fractional and over-range inputs all resolve to a valid index — never throws. `total <= 0` → `0`. |
| `nextScreen` | `(index: number, total: number) => number` | `clampScreen(index + 1, total)`. Saturates at the last screen. |
| `prevScreen` | `(index: number, total: number) => number` | `clampScreen(index - 1, total)`. Saturates at the first. |
| `swipeIntent` | `(dx: number, dy: number) => 'next' \| 'prev' \| 'none'` | `'next'` when `dx <= -44` and `|dx| > |dy|`; `'prev'` when `dx >= 44` and `|dx| > |dy|`; otherwise `'none'`. A diagonal or short drag is `'none'`, so page scrolling is never stolen. |
| `formatPosition` | `(template: string, current: number, total: number) => string` | Substitutes `{0}` → `current` (1-based) and `{1}` → `total`, matching the app's positional-placeholder convention (`lib/i18n/index.ts` `makeT`). |

`SWIPE_THRESHOLD_PX = 44` is exported so the test asserts against the named constant rather than
re-stating the magic number.

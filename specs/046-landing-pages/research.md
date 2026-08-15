# Phase 0 Research: Per-Language Landing Pages (spec 046)

Every finding below was verified against this repository at `feat/046-landing-pages` (based on
spec 045). Where a claim is about spec 045's shipped behavior, the file and line were read, not
recalled.

This feature is unusual: it has almost no new *mechanism*. 045 built the routing, the metadata, the
catalog loading and the language hand-off. What 046 decides is **shape** — how the copy is
structured so it can diverge per market, and what the page is made of. The research is therefore
mostly about the seams 046 must fit into without breaking them.

---

## 1. What 046 must NOT rebuild

Confirmed present and working on this branch. The spec's Overview table lists these; this section
records what each actually is, so the plan can consume rather than re-derive them.

| Contract | Verified at | Shape |
|---|---|---|
| `LANDING_LOCALES` / `landingSlugs()` / `localeForSlug()` | `web/lib/onboarding/locales.ts` | Six `{ slug, language, locale }` entries; `en` first |
| `adoptLandingLanguage(slug)` | `web/lib/onboarding/adoptLanguage.ts` | Writes the existing `language` key; try/catch; no-ops on an unknown slug |
| Reserved regions | all six `web/lib/i18n/landing/*.ts` | Both `spec 046` and `spec 047` marker pairs present in all six (checked) |
| Route + metadata | `web/app/landing/[locale]/page.tsx` | Server component; `generateStaticParams`, `dynamicParams = false`, `alternates` + `openGraph` |
| The file to replace | `web/components/landing/LandingPlaceholder.tsx` | Client component; document-`lang` effect; wordmark; one line |

**Consequence for the plan**: 046's only *new* module is the replacement component. Everything else
is a copy edit, a type edit, or a test edit.

---

## 2. The CTAs are plain `<a href>`, not `next/link` and not `router.push`

**Decision**: both actions are ordinary anchors — `<a href="/tour/{slug}">` and `<a href="/sign-in">`
— each with an `onClick` that calls `adoptLandingLanguage(slug)` before the browser navigates.

**Rationale**, in the order the alternatives were eliminated:

- **`router.push()` on a `<button>`** — rejected outright. This is the one page in the product whose
  job is to be found by a crawler; a button carries no href, so the link from a landing page to its
  tour would be invisible to indexing. FR-009's "real semantic control" is satisfied by a button,
  but the SEO purpose of the whole funnel is not.
- **`next/link`** — rejected for now. It renders a real `<a href>`, so the SEO objection does not
  apply, but it prefetches on viewport entry, and **`/tour/{locale}` does not exist yet** (spec 047
  builds it). Every landing view would fire six 404 prefetches for a route that isn't in the build.
  The repository uses `next/link` in ~10 places, all of them *inside* the signed-in app where the
  target always exists; nothing in the codebase currently sets `prefetch={false}` (checked), so
  adopting `Link` here would mean introducing that exception on its first use.
- **Plain `<a href>`** — chosen. Crawlable, keyboard-reachable by default, gets the global
  focus-visible ring for free (`globals.css:230`, `:where(a, button, …):focus-visible`), and a
  document load between marketing and app is the correct boundary anyway: the landing page
  deliberately shares no state with what follows.

**Adoption ordering is safe.** `adoptLandingLanguage` is a synchronous `localStorage.setItem` inside
a try/catch. A click handler runs to completion before the browser starts the navigation, so
"adopt, then navigate" needs no `preventDefault`, no await, and no artificial delay. FR-003 is
satisfied by ordering that the platform already guarantees. Storage failure is swallowed inside
`adoptLandingLanguage` itself, which is exactly the "storage unavailable → still navigate" edge case.

**`signInHref()` is deliberately not used.** `web/lib/nav.ts` exists because Capacitor's iOS asset
router serves `index.html` for any extensionless path, so *native* hard navigations must target
`/sign-in.html`. A landing page is unreachable on native — the root router, the bare `/landing`
route and `not-found.tsx` each guard `Capacitor.isNativePlatform()` first (spec 045) — so calling it
here would buy nothing and cost something: it is evaluated at render, and the value it returns
during static generation (Node, non-native) would differ from a native hydration, producing exactly
the kind of hydration-time href swap that is worth avoiding on a static marketing document.

**Alternatives considered**: `<a>` + `preventDefault` + `router.push` to keep the client router —
rejected as strictly worse than a plain anchor (same DOM, more code, and it breaks cmd-click into a
new tab).

---

## 3. Copy structure: one nested `landing` object per catalog, with an array of points

**Decision**: `LandingCatalog` gains one new required field, `landing: LandingCopy`, declared inside
each catalog's `spec 046` marker region and composed into the exported object on the last line.

```ts
// --- spec 046 landing copy — insert only between these markers ---
const landing: LandingCopy = { headline, subhead, points: [...], primaryCta, secondaryPrompt, secondaryCta }
// --- end spec 046 ---
```

**Rationale**: three requirements point at the same shape.

- **FR-011 / SC-005** (rewriting one locale touches exactly one catalog region) is satisfied only if
  every piece of a locale's positioning lives in one contiguous block. A flat spread of six new
  top-level keys would work too, but nesting makes "this is 046's copy" reviewable at a glance and
  keeps the `spec 047` region's future sibling (`tour: TourCopy`) symmetric.
- **US3 acceptance scenario 2** — "a locale needs a different number of supporting points than
  another … without a per-locale branch in the component" — forces `points` to be an **array**, not
  `point1`/`point2`/`point3`. The component maps over it, so a locale shipping two points or four
  needs no component change. This is the single most load-bearing structural decision in the
  feature, and it is worth stating plainly: **the array is the mechanism by which US3 is met.**
- The markers sit *between* the object literal and `export default` in every catalog (verified in
  all six files), so a region cannot hold object *properties* — it must hold a declaration. Hence a
  named const composed at the end.

**The composition line is a known, accepted one-line merge surface with 047.** 046 ships
`export default { ...base, landing }`; 047 will change it to `{ ...base, landing, tour }`. That is
one line, in a file 047 must edit anyway (it adds `tour` to the `LandingCatalog` interface in
`index.ts`). Research §9 of spec 045 designed the marker regions to keep the *copy* conflict-free,
which they still do; a single structural line is the residue, and it is cheaper than the
alternative (below).

**Alternatives considered**:
- *Mutating the const after declaration* (`en.landing = {…}` inside the region) — avoids the
  composition line entirely, but requires `landing` to be optional on the interface, which pushes
  non-null assertions into the component and lets a locale ship with no copy at all. Rejected:
  trading a compile-time guarantee for a merge convenience is the wrong trade.
- *Six flat top-level keys* — rejected as above; also makes the byte-budget guard (§5) harder to
  read.

---

## 4. `placeholderLine` is removed, not left behind

**Decision**: delete the `placeholderLine` key from `LandingCatalog` and from all six catalogs, and
delete `LandingPlaceholder.tsx`.

**Rationale**: the key's own doc comment says "The single line the placeholder renders. Feature 046
replaces this surface." Once the real headline exists, `placeholderLine` is a second, competing
proposition string that no code reads — the exact stale-copy hazard the i18n guards exist to catch.
Four existing tests reference it (`landing-route.test.tsx` ×3, `landing-index.test.tsx`,
`root-router.test.tsx`, and the `KEYS` list in `landing-catalogs.test.ts`); those references become
the new headline, which is what those tests were always really asserting — "this locale's own words
rendered, not English."

**Consequence**: 046 legitimately edits four spec-045 test files. Two of them assert things that are
*true only until 046 lands*, and were written that way on purpose:

- `landing-route.test.tsx` — "ships no interactive controls yet — CTAs arrive with 046" asserts
  `container.querySelectorAll('button, a, input')` has length 0. 046 inverts it.
- `landing-catalogs.test.ts` — "leaves both regions empty on delivery" asserts the `spec 046` region
  is empty. 046 narrows it to the `spec 047` region only.

Both are updated, not deleted: the 047 half of each guard must survive.

---

## 5. The catalog byte budget has room, but it is the real constraint to watch

`test/i18n/landing-catalogs.test.ts` asserts all six landing catalogs together stay under
**30,000 bytes** — the guard that keeps the funnel's catalogs from drifting toward the 32–55 KB app
catalogs they exist to avoid.

**Measured on this branch**: the six files total **6,303 bytes**, leaving ~23,700 for 046 (~3,950
per file). A headline, subhead, three `{title, body}` points and three action labels is roughly
400–600 characters of prose per locale. Latin scripts cost ~1 byte/char; Japanese, Chinese and
Korean ~3; Bengali ~3 and it is the wordiest of the six. Worst case ≈ 1,800 bytes for `bn.ts`.

**Decision**: keep the 30,000 limit unchanged and measure after the copy lands. The budget is not
merely sufficient — it is the correct pressure. If the six catalogs approach it, the page has too
many words for a calm marketing page, and the limit will have caught a content problem rather than a
technical one.

---

## 6. Layout: one 560px reading column, hero above the fold, points below

**Decision**: a single centered column capped at `max-w-[560px]`, with the hero (wordmark, headline,
subhead, primary CTA, sign-in link) first and the supporting points after a hairline rule.

**Rationale**: US1 acceptance scenario 1 requires the proposition, the primary action *and* the
sign-in link to be visible "without scrolling on a standard phone viewport" — it does **not** require
the supporting points to be. A 375×667 phone fits wordmark + headline + subhead + a 48px CTA +
the sign-in line in roughly 380px of the 667 available, with the points falling naturally below the
fold. Forcing everything above the fold is what would break the requirement, not honoring it.

560px is the constitution's reading-column cap, stated verbatim under Additional Constraints. It
also makes SC-004 (no horizontal body scroll from 320px to 2560px) provable rather than tested by
eye: a fixed cap plus `px-6` gutters cannot overflow at any width above 320. Empty margins on an
ultrawide are correct per Constitution II — "added space is room to breathe, not room to cram."

**No `h-screen`.** PRs #104 and #105 fixed a double-scrollbar caused by viewport-height boxes
interacting with spec 040's `zoom` on `<html>`. `min-h-screen` on the outer element (what
`sign-in/page.tsx`, `not-found.tsx` and `LandingPlaceholder.tsx` all already use) is safe — it is a
floor, not a fixed height, and the page has no inner scroll container.

**Alternatives considered**: a wider hero (720–1080px) with a multi-column point grid at ≥1024px —
rejected. It reads as a conventional SaaS marketing page rather than as Ortho, it needs breakpoint
logic the single column doesn't, and it puts a second layout in the codebase for the sake of one
page.

---

## 7. Styling reuses two established pre-auth patterns; no shared primitive is touched

**Decision**: the primary CTA is an `<a>` carrying `PrimaryButton`'s visual treatment
(`h-12 w-full rounded-full`, `background: var(--text)`, label in `var(--bg)`); the sign-in link is
the quieter `text-accent` anchor already used by `not-found.tsx`. `components/ui.tsx` is **not**
modified.

**Rationale**: `PrimaryButton` renders a `<button>` and cannot carry an href. Extending it with an
optional `href` was considered and rejected — it is imported across the signed-in app, and widening a
shared primitive to serve one marketing page is a change whose blast radius exceeds its benefit.
More decisively, `components/ui.tsx` is the signed-in app's module: importing it here would pull
whatever it later imports into the landing bundle, and the module-graph guard in
`landing-route.test.tsx` exists precisely because that page's import list is a correctness property.
`app/sign-in/page.tsx` set this precedent already by building its own `t()` rather than reaching for
the store.

Hover/active come from the existing `.ortho-interactive` utility (`globals.css:250`); the focus ring
comes from the global `:where(a, button, …):focus-visible` rule (`globals.css:230`). Both are token-
only, and `prefers-reduced-motion` is already handled globally. **No new CSS is needed for FR-008 or
FR-009** — the design system already covers this page.

---

## 8. Metadata: update the values, keep the mechanism

**Decision**: rewrite `metaTitle` / `metaDescription` in all six catalogs to match the new
proposition (FR-012), and leave `generateMetadata` in `app/landing/[locale]/page.tsx` structurally
untouched.

**Rationale**: the spec says to *extend* the metadata, not restructure it, and the canonical +
hreflang + OpenGraph block already satisfies FR-012's second half. The only staleness after 046 is
that the title and description would describe a page whose words have changed. Those keys stay
top-level (the route reads `copy.metaTitle`), which does mean two copy strings sit outside the
`spec 046` region — a deliberate reading of FR-005, whose purpose (per spec 045 research §9) is
conflict-free *page copy* between 046 and 047. 047 does not touch the landing route's metadata, so
there is no conflict to prevent, and moving them inside the region would force the route to read
`copy.landing.metaTitle` for no gain.

**Social preview images: deferred.** The spec scopes them "only if trivial." They are not: an OG
image is a real asset per locale (or a generated one, which `output: 'export'` cannot do at request
time), and `public/` still holds the Next.js starter SVGs. The existing OG tags stay as they are.

---

## 9. The English proposition, and why it claims nothing it cannot support

**Decision**: ship one strong English proposition, faithfully translated into the other five, built
**only** from features this repository actually has.

The spec's Assumptions section and the feature checklist both mark market positioning as the product
owner's piece and warn against an agent inventing what a Bengali or Korean audience finds
persuasive. That constraint is honored two ways: the words describe shipped behavior and nothing
else, and the structure (§3) makes replacing any locale's positioning a single-region edit.

Every claim traces to a shipped surface:

| Copy element | Backed by |
|---|---|
| "see what it spends" | `app/(app)/transactions`, the dashboard widgets, `lib/dashboard/spendHeatmap.ts` |
| "split what you share" | household splits, `effectiveShares` (spec 007) |
| "plan what's ahead" | `app/(app)/planning` hub, budgets, goals (spec 038) |
| "in your language" | the six-locale funnel itself |

Nothing claims a bank connection (Plaid exists but is connect-only and gated), a price, a user
count, a security property, or a comparison to another product.

**One label deviates from the plan document's wording.** `docs/plan/onboarding-funnel.md` sketches
the primary CTA as "Learn more". The shipped label is **"See how it works"**: it is plainspoken and
says what actually happens next (a tour), which Constitution IV asks for, where "learn more" says
only that something more exists. The requirement it serves (FR-001/FR-002) is about function and
destination, not wording, and the label is one string inside a swappable region — the cheapest thing
in the feature to change if the product owner disagrees.

---

## 10. Testing approach

**Decision**: extend the existing suites rather than start new ones. Every behavior in this feature
is observable through the accessible DOM or through the catalogs, so no new test infrastructure is
needed.

| Requirement | Where it is pinned |
|---|---|
| FR-001, FR-002, FR-010 (roles, hrefs, order) | new `test/onboarding/landing-view.test.tsx` |
| FR-003, FR-004 (adopt on click, never on view) | same file, asserting `localStorage.getItem('language')` |
| FR-005, FR-011, SC-005 (region discipline) | `test/i18n/landing-catalogs.test.ts` (extended) |
| FR-006, SC-001, SC-003 (own language, no English leak) | `landing-route.test.tsx` (existing tests, retargeted at the headline) |
| FR-007 (no store, no app catalog, no Supabase) | `landing-route.test.tsx` module-graph guard (file list updated) |
| FR-012 | `landing-route.test.tsx` metadata tests (already parameterized over the registry) |
| FR-013 | no migration, no `package.json` change — verified by the diff |

`localStorage` is available in the jsdom environment these suites already opt into, so FR-003/FR-004
are directly assertable: render, expect no `language` key; click, expect the locale's `Language`
value. That pair is the sharpest test in the feature — it is the difference between a language
*preference* and a language *page*.

**FR-008 (tokens only)** is enforced by the existing `test/tokens-only-backgrounds.test.ts` sweep
over `components/` and `app/`, which the new component is automatically covered by.

**What is NOT unit-testable and moves to quickstart**: SC-004 (no horizontal scroll at real
viewport widths), dark mode, and the visual weight ordering of primary vs secondary. jsdom has no
layout engine — asserting "no horizontal scroll" there would be theater. These are browser checks.

---

## Resolved unknowns summary

| Question | Resolution |
|---|---|
| How do the CTAs navigate? | Plain `<a href>` + synchronous adopt in `onClick` (§2) |
| Why not `next/link`? | It would prefetch `/tour/*`, which spec 047 has not built (§2) |
| How does copy diverge per market without a component branch? | `points` is an array inside a per-locale `landing` object (§3) |
| Where does the composed object get built? | Last line of each catalog; a known one-line merge surface with 047 (§3) |
| What happens to `placeholderLine`? | Removed; four 045 tests retarget to the headline (§4) |
| Is there room under the 30 KB catalog budget? | Yes — 6,303 bytes used, ~23,700 free (§5) |
| How wide is the page? | One 560px reading column, hero above the fold (§6) |
| Does any shared primitive change? | No — `components/ui.tsx` untouched (§7) |
| Are OG images in scope? | No — not trivial under static export; existing tags stay (§8) |
| Who writes the market positioning? | The product owner; 046 ships a translated English proposition making only supportable claims (§9) |

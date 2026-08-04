# Research: Global Text Size

Phase 0 output. Resolves the mechanism unknowns behind the plan.

## R1 — How to scale a px-based UI globally

**Decision**: Whole-UI proportional scale via CSS `zoom` on `<html>`, driven by a
per-device `textSize` preference. Four levels: `small=1.00`, `medium=1.06` (default),
`large=1.14`, `xlarge=1.22`.

**Rationale**:
- The web app is **not rem-based**. Font sizes are ~60% Tailwind arbitrary `text-[15px]`
  (pixel-locked) and ~40% inline `style={{fontSize: N}}`; `globals.css` `ow-*` classes
  hardcode px. There is no `html{font-size}` anchor and no `--text-scale` variable. A root
  `font-size` change would therefore scale **nothing**. (Verified by codebase recon over
  `app/globals.css`, `tailwind.config.ts`, `components/**`.)
- `zoom` scales the element and all descendants **including pixel-locked text**, and unlike
  `transform: scale()` it reflows (content takes the scaled space and scrolls normally),
  so nothing overlaps.
- This satisfies "increase font size without messing up the design" better than a text-only
  approach: the entire interface stays pixel-proportional at every level, and it also
  enlarges tap targets (a Principle V accessibility win). The requester explicitly chose the
  whole-UI scale over a text-only (rem) approach.

**Alternatives considered**:
- **Root `font-size` + convert every component to `rem`** — the "correct" typographic
  approach, but a pervasive, high-risk refactor across dozens of components and `globals.css`;
  fixed-height boxes (`.ow-board` 300px grid, 54px rows, 34px chips) would not grow with the
  text and risk clipping at large sizes. Rejected: out of proportion to the ask and riskier
  to the design. (Recorded as out-of-scope in the spec.)
- **`transform: scale()`** — does not reflow; leaves overflow/gaps and needs manual
  width/height compensation. Rejected.
- **A smaller "compact" level below baseline** — violates "never shrink type". Rejected.

## R2 — Does root `zoom` break the full-height shell or the fixed tab bar? (the key risk)

**Decision**: No. Apply `zoom` on `document.documentElement` safely; the app shell
(`app/(app)/layout.tsx`: `flex h-dvh overflow-hidden sm:h-screen`), the desktop sidebar
(`h-screen`), and the fixed tab bar/modals remain correct. No shell/height refactor needed.

**Rationale**:
- The risk was the *naive* historical `zoom` (a post-layout visual scale), under which
  `height: 100dvh` would render at `zoom × viewport` and overflow, pushing a `position: fixed`
  bottom bar below the visible viewport.
- **Standardized `zoom`** (CSSWG 2023 resolution; shipped Baseline 2024 — Chrome 128,
  Firefox 126, Safari 18) redefines `zoom` to *"change the relative size of a CSS pixel in
  relation to its layout box."* Viewport units are defined in CSS px, so under `zoom: Z` the
  viewport measured in the (rescaled) CSS px equals `physicalViewport / Z`; `100dvh` renders
  back to exactly the physical viewport. `position: fixed` is likewise relative to the
  (rescaled) viewport, so a bottom-fixed bar stays pinned. Net: `zoom` behaves like genuine
  page zoom, which is precisely the intent of the 2024 standardization.
- **Cross-browser**: standardized `zoom` is interoperable as of 2024, including WebKit
  (Safari 18) — which is what the Capacitor iOS shell (WKWebView) runs. So the iOS surface is
  covered by the same behavior.
- Only viewport-height containers were ever at risk, and there are just a handful
  (`h-dvh`/`h-screen`/`min-h-[100dvh]`/`max-h-[92vh]`, plus `max-height:88vh` in globals) —
  all of which resolve correctly under standardized `zoom`.

**Verification status**: Concluded from the standardized `zoom` definition (MDN CSS `zoom`;
CSSWG css-viewport; OddBird "Zoom, zoom, and zoom", 2024) and Baseline-2024 support data. A
local headless-browser check was not possible in this sandbox (arm64 + very new OS: puppeteer
ships x86-only Chrome, and Playwright has no build for this OS). **quickstart.md therefore
includes a mandatory manual browser check** across the four sizes on mobile + desktop widths
as a belt-and-suspenders confirmation before merge.

## R3 — Mount points & no-flash (mirror appearance)

**Decision**: Two application points, identical to the appearance system:
1. **Pre-paint boot script** in `app/layout.tsx` (`TEXT_SIZE_BOOT`), embedding the scale map
   verbatim and reading `localStorage['textSize']`, run synchronously during HTML parse →
   the correct size is in place on the first frame (FR-008, no flash).
2. **App-shell mount effect** in `app/(app)/layout.tsx` — call `applyTextSize(readTextSize())`
   alongside the existing `applyAppearance(readAppearance())`, re-asserting the scale on SPA
   mount.

**Rationale**: This is the proven, no-flash pattern already in the repo for light/dark
appearance. Embedding the scale map into the boot script (as `APPEARANCE_BOOT` embeds
`THEME_VARS`) keeps a single source of truth while guaranteeing the boot script has no import
dependency.

**Alternatives considered**: a React-context provider that applies on mount only — rejected
because it flashes the default size before hydration (the exact problem the boot script
avoids). CSS-attribute-only (`html[data-text-size="large"]{zoom:…}`) — workable, but inline
`style.zoom` mirrors appearance's belt-and-suspenders and is trivially testable in jsdom.

## R4 — Storage key & default

**Decision**: `localStorage` key `textSize` (bare key, matching the sibling top-level prefs
`appearance`, `language`, `currency`). Default `medium`. Unknown/missing/malformed → `medium`.

**Rationale**: Consistency with the existing bare-key prefs (not the `ortho.*` namespace used
for widget/flags storage). Medium-as-default delivers the "increase globally a tad" bump to
everyone, including users who never open Settings, with Small as the exact way back to today.

## R5 — i18n

**Decision**: Add the Text-size strings to all five catalogs (`bn/es/ja/ko/zh`); English is
the identity/source and needs no catalog entry. New keys: `Text size`, `Small`, `Medium`,
`Large`, `X-Large`, and the helper `Choose how large text appears throughout the app.`
Reuse any label that already exists as a catalog key rather than duplicating (checked in
implementation — a `Record` cannot hold duplicate keys).

**Rationale**: The market-analysis research confirms the target market is heavily LEP; an
English-only accessibility control is self-defeating. The catalog-**reachability** test
requires each key to be used as a string literal in source — the settings page supplies that.
There is **no** cross-catalog key-set parity test, so we must add the keys to *every* catalog
by hand or non-English users get an English fallback (FR-010). Placeholder-parity is satisfied
trivially (none of these strings contain `{n}` placeholders).

## R6 — Testing strategy (TDD)

**Decision**: Two new test files, written test-first:
- `test/settings/text-size.test.ts` — `readTextSize` default + coercion of
  missing/empty/unknown values; `TEXT_SIZE_SCALE` exact values + monotonic ordering + Small=1;
  `applyTextSize` sets `documentElement.style.zoom` and `data-text-size`; `writeTextSize`
  round-trips through `localStorage` and applies. (Mirrors `test/widgets/preferences.test.ts`
  defensive pattern + `test/settings/appearance-status-bar.test.ts` DOM pattern.)
- `test/settings/text-size-page.test.tsx` — renders the picker, asserts the active row
  reflects the stored value (default Medium), clicking a row persists + applies, and all four
  options render. (Mirrors `test/widgets/widgets-settings.test.tsx`.)

Both use `@vitest-environment jsdom` and clear `localStorage` + reset `documentElement` in
`beforeEach`. `npm test` gates merge (Principle VI).

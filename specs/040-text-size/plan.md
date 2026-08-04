# Implementation Plan: Global Text Size

**Branch**: `040-text-size` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/040-text-size/spec.md`

## Summary

Give every reader a comfortable, adjustable text size. Ship a subtle global size bump by
default (Medium) and a **Settings → Text size** picker with four levels (Small / Medium /
Large / X-Large). Implemented as a single per-device preference applied as a root `zoom` on
`<html>` via a `--text-scale` value — a whole-UI proportional scale that keeps the design
pixel-perfect at every size. The preference mirrors the existing light/dark **appearance**
system end-to-end: a `read/write/apply` module, a pre-paint boot script in the root layout
(no flash), and re-application at app-shell mount.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js (App Router) — Tailwind v4. (Heed
`web/AGENTS.md`: this Next version has breaking changes — mirror existing repo patterns,
do not introduce novel Next APIs.)

**Primary Dependencies**: Existing only — `next/font/local` (Lato), `lucide-react` (icons),
the app's own `@/lib/store` (`useApp`/`t`), `@/components/settings/*`, `@/components/layout`,
`@/components/ui`. No new runtime dependencies.

**Storage**: `localStorage` (per-device), a single key `textSize`. No server/Supabase change.

**Testing**: vitest 4.1.8 + Testing Library (jsdom, opt-in via `@vitest-environment jsdom`);
run from `web/` with `npm test` (single file: `npm test -- <path>`).

**Target Platform**: Responsive web (Chromium/Firefox/Safari desktop + mobile) and the
Capacitor iOS shell (WKWebView / Safari). Standardized CSS `zoom` is Baseline 2024
(Chrome 128, Firefox 126, Safari 18), covering all of these.

**Project Type**: Web app (single `web/` project; the canonical implementation per the
constitution — iOS is this same bundle, Capacitor-wrapped).

**Performance Goals**: No measurable impact. Applying `zoom` is a single style write on
`<html>`; boot script is a few synchronous statements during HTML parse.

**Constraints**: No flash on load (FR-008); no layout breakage at any size (FR-002); must
not re-introduce the mobile zoom-on-focus problem (FR-012); calm application respecting
reduced-motion (FR-013); every Text-size string translated in all catalogs (FR-010).

**Scale/Scope**: ~1 new lib/settings module, 1 new settings page, 2 registration edits,
2 mount-point edits (boot script + app-shell effect), 5 i18n catalog edits, and the
matching test files. No data migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. One Design System, Tokens Only** | ✅ Reinforced. The four scale steps are defined **once** in a single TS module (`TEXT_SIZE_SCALE`) and mirrored into the boot script — the same single-source-of-truth pattern `THEME_VARS` uses. No ad-hoc font sizes are introduced anywhere; existing components are untouched. |
| **II. Calm Over Dense (NON-NEGOTIABLE)** | ✅ Directly serves it — "never shrink type": Small = baseline, default nudges **up**. No new colors, gradients, or shadows; the picker reuses `SectionCard`/`ChoiceRow`. The scale change is applied instantly and calmly (no animation). |
| **III. Right Form Factor Per Canvas** | ✅ Whole-UI proportional scale preserves every canvas's layout. Standardized `zoom` rescales the CSS pixel, so at larger sizes the effective CSS viewport narrows and responsive breakpoints reflow to a more compact layout — this is the *expected* page-zoom behavior (like a smaller window), and the responsive contract already spans phone→ultrawide, so no layout breaks. Safe-area insets and the fixed tab bar stay correct on standardized engines (see research.md R2; iOS < 18 needs the manual check). |
| **IV. Plainspoken Voice & Money Formatting** | ✅ Labels are plainspoken ("Text size", "Small"…). Amounts still render as money and are never abbreviated — scaling is uniform, not a reflow that truncates. |
| **V. Accessible & Interaction-Complete** | ✅ This *is* an accessibility feature. Picker rows are real `<button>`s (via `ChoiceRow`), keyboard-reachable with the sand focus ring, ≥60px hit rows. Bigger sizes enlarge tap targets. AA contrast unchanged (color tokens untouched). `prefers-reduced-motion` respected (no motion added). |
| **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** | ✅ Full TDD: failing tests first for `readTextSize` defaults/coercion, `TEXT_SIZE_SCALE` values, `applyTextSize` DOM effect, the settings page interaction, and i18n presence — then implement to green. The size→scale mapping is a pure function locked by deterministic tests. |

**Result: PASS** — no violations; no Complexity Tracking needed. The one item to *verify
in a real browser* (not a constitutional violation, but a diligence step) is that `zoom`
on `<html>` leaves the `h-dvh` shell and fixed tab bar visually correct across the sizes
(research.md R2 concludes it does; quickstart.md includes the manual check).

## Project Structure

### Documentation (this feature)

```text
specs/040-text-size/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 — mechanism decision + zoom verification
├── data-model.md        # Phase 1 — the TextSize preference entity
├── quickstart.md        # Phase 1 — how to validate (tests + manual browser check)
├── contracts/
│   └── text-size-module.md   # Phase 1 — the read/write/apply/scale contract
├── checklists/
│   └── requirements.md  # /speckit-specify output (spec quality)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
web/
├── components/settings/
│   ├── textSize.ts                  # NEW — TextSize type, TEXT_SIZE_SCALE, read/write/apply
│   └── SettingsSecondaryNav.tsx     # EDIT — add { href:'/settings/text-size', label:'Text size' }
├── app/
│   ├── layout.tsx                   # EDIT — add TEXT_SIZE_BOOT pre-paint script (mirrors APPEARANCE_BOOT)
│   └── (app)/
│       ├── layout.tsx               # EDIT — applyTextSize(readTextSize()) at shell mount
│       └── settings/
│           ├── page.tsx             # EDIT — add LinkRow → /settings/text-size
│           └── text-size/
│               └── page.tsx         # NEW — the picker (clones appearance/page.tsx)
├── lib/i18n/
│   └── bn.ts es.ts ja.ts ko.ts zh.ts   # EDIT — add the Text-size strings to each catalog
└── test/settings/
    ├── text-size.test.ts            # NEW — read/write/apply/scale unit tests
    └── text-size-page.test.tsx      # NEW — picker render + interaction + persistence
```

**Structure Decision**: Single `web/` project. The feature slots into the established
`components/settings/*` + `app/(app)/settings/*` + `lib/i18n/*` layout, cloning the
appearance feature's file shapes so it reads like the surrounding code.

## Implementation Approach (mirrors appearance.ts)

1. **`components/settings/textSize.ts`** — the single source of truth:
   - `export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'`
   - `export const DEFAULT_TEXT_SIZE: TextSize = 'medium'`
   - `export const TEXT_SIZES: TextSize[] = ['small','medium','large','xlarge']` (order = ascending)
   - `export const TEXT_SIZE_SCALE: Record<TextSize, number> = { small:1, medium:1.06, large:1.14, xlarge:1.22 }`
   - `applyTextSize(size)` → guards `document`; sets `documentElement.style.zoom = String(scale)`
     and `documentElement.dataset.textSize = size` (attribute for tests/debuggability).
   - `readTextSize()` → guards `localStorage`; returns the stored value if it is one of the
     four, else `DEFAULT_TEXT_SIZE` (covers missing/empty/malformed/unknown → FR-009).
   - `writeTextSize(size)` → writes `localStorage['textSize']` then `applyTextSize(size)`.

2. **`app/layout.tsx`** — add `TEXT_SIZE_BOOT`, a stringified inline `<script>` next to
   `APPEARANCE_BOOT`, embedding `TEXT_SIZE_SCALE` verbatim (single source of truth), reading
   `localStorage['textSize']`, and setting `documentElement.style.zoom` + `data-text-size`
   before first paint. Defaults to Medium when unset/invalid → the global bump reaches
   first-time users with no flash.

3. **`app/(app)/layout.tsx`** — in the existing mount `useEffect` that calls
   `applyAppearance(readAppearance())`, also call `applyTextSize(readTextSize())` so the
   scale is re-asserted on SPA mount/navigation.

4. **`app/(app)/settings/text-size/page.tsx`** — clone `appearance/page.tsx`: `ReadingColumn`
   + back link + `PageHeader title={t('Text size')}` + a `SectionCard` of four `ChoiceRow`s
   (labels `t('Small'|'Medium'|'Large'|'X-Large')`), `active` = current, `onClick` =
   `choose(size)` which `setState` + `writeTextSize`. Include a short helper line
   (`t('Choose how large text appears throughout the app.')`).

5. **Registration** — `settings/page.tsx` `LinkRow href="/settings/text-size" label={t('Text size')}`
   (placed with Appearance in the preferences `SectionCard`); `SettingsSecondaryNav.tsx`
   `SECTIONS` gets `{ href:'/settings/text-size', label:'Text size' }` after Appearance.

6. **i18n** — append the web-only keys to **all five** catalogs (`bn/es/ja/ko/zh`) with
   translated values. The catalog-reachability test requires each key to appear as a string
   literal in source (the settings page provides that). Re-use any option label that already
   exists as a catalog key rather than duplicating (verified during implementation).

## Complexity Tracking

No constitution violations — section intentionally empty.

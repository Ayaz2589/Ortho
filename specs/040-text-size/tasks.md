# Tasks: Global Text Size

**Feature**: `040-text-size` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Approach**: Strict TDD (constitution Principle VI) — every implementation task is preceded
by a failing test. All commands run from `web/`. Test env is vitest + jsdom
(`@vitest-environment jsdom` pragma per file). Single file: `npm test -- <path>`.

**Story→scale legend**: US1 = default bump reaches everyone with no flash · US2 = Settings
picker + persistence · US3 = translated strings.

---

## Phase 1: Setup

- [ ] T001 Confirm baseline is green before changes: from `web/`, run `npm test -- test/settings test/widgets/preferences.test.ts` and `npx tsc --noEmit`; note the current pass state so regressions are attributable. (`web/` — no source change.)

---

## Phase 2: Foundational (BLOCKS US1 and US2) — the preference module (TDD)

- [ ] T002 Write FAILING unit tests in `web/test/settings/text-size.test.ts` (`@vitest-environment jsdom`; `beforeEach` clears `localStorage` and removes `zoom`/`data-text-size` from `document.documentElement`). Cover the contract in `contracts/text-size-module.md`: C1 `readTextSize()`→`'medium'` when unset; C2 valid stored value returned; C3 unknown/`''`/`'{bad'`/`'xxlarge'`→`'medium'`; C4 `TEXT_SIZE_SCALE.small===1`; C5 scale strictly increasing across `TEXT_SIZES`; C6 `applyTextSize(size)` sets `documentElement.style.getPropertyValue('zoom')===String(scale)` and `dataset.textSize===size`; C8 `writeTextSize(size)` sets `localStorage.textSize===size` and applies. Mirror `test/widgets/preferences.test.ts` (defensive) + `test/settings/appearance-status-bar.test.ts` (DOM reset). Import from `@/components/settings/textSize` (module does not exist yet → RED).
- [ ] T003 Implement `web/components/settings/textSize.ts` to make T002 GREEN: `type TextSize`, `TEXT_SIZES` (ascending), `DEFAULT_TEXT_SIZE='medium'`, `TEXT_SIZE_SCALE={small:1,medium:1.06,large:1.14,xlarge:1.22}`, `applyTextSize` (guard `document`; `root.style.setProperty('zoom', String(scale))`; `root.dataset.textSize=size`), `readTextSize` (guard `localStorage`; coerce to default), `writeTextSize` (persist key `textSize` then apply). Mirror the shape of `web/components/settings/appearance.ts`.

**Checkpoint**: `npm test -- test/settings/text-size.test.ts` green; `npx tsc --noEmit` clean.

---

## Phase 3: User Story 1 — comfortable default for everyone, no flash (P1)

**Goal**: A first-time user (no stored pref) gets Medium everywhere, applied before first paint.

**Independent test**: With `localStorage.textSize` unset, load the app → `document.documentElement`
carries `zoom: 1.06` / `data-text-size="medium"` from the first frame; picking a size and
reloading shows it with no flash (manual, T016).

- [ ] T004 [US1] Write a FAILING test in `web/test/settings/text-size.test.ts` (append) asserting the exported boot string stays in sync: `TEXT_SIZE_BOOT` (from `@/app/layout` or a small exported const) is a string that references each scale value (`1.06`,`1.14`,`1.22`) and defaults to `medium`. (Locks the JS-mirror against drift from `TEXT_SIZE_SCALE`.)
- [ ] T005 [US1] Edit `web/app/layout.tsx`: add `TEXT_SIZE_BOOT` — a stringified inline `<script>` mirroring `APPEARANCE_BOOT` — that embeds `TEXT_SIZE_SCALE` (imported from `@/components/settings/textSize`, `JSON.stringify`d), reads `localStorage.getItem('textSize')`, resolves unknown/missing→`medium`, and sets `documentElement.style.zoom` + `data-text-size`, wrapped in `try/catch`. Render it as a second `<script>` in `<body>` next to the appearance boot. Export `TEXT_SIZE_BOOT` so T004 can assert it. → makes T004 GREEN.
- [ ] T006 [US1] Edit `web/app/(app)/layout.tsx`: in the existing mount `useEffect` that calls `applyAppearance(readAppearance())`, also call `applyTextSize(readTextSize())` (import both from `@/components/settings/textSize`).

**Checkpoint**: default path applies Medium at boot + mount; `npx tsc --noEmit` clean.

---

## Phase 4: User Story 2 — choose a size in Settings, it persists (P1)

**Goal**: Settings → Text size lists four options; selecting one rescales the app immediately
and persists across restarts/navigation.

**Independent test**: Render the page; active row = stored size (default Medium); click each
option → `writeTextSize` persists and the active indicator moves; reload keeps the choice.

- [ ] T007 [US2] Write FAILING component tests in `web/test/settings/text-size-page.test.tsx` (`@vitest-environment jsdom`; clear `localStorage` + reset `documentElement` in `beforeEach`; mock/stub `useApp` `t` as identity like existing settings tests). Assert: renders 4 option rows (`Small/Medium/Large/X-Large`); with no stored pref the Medium row is active (`aria`/checkmark per `ChoiceRow`); `userEvent.click` on "Large" → `readTextSize()==='large'` and `documentElement.dataset.textSize==='large'`; the active indicator follows. Mirror `test/widgets/widgets-settings.test.tsx`. (Page does not exist → RED.)
- [ ] T008 [US2] Implement `web/app/(app)/settings/text-size/page.tsx` cloning `web/app/(app)/settings/appearance/page.tsx`: `ReadingColumn` + mobile back-link + `PageHeader title={t('Text size')}` + a helper line `t('Choose how large text appears throughout the app.')` + a `SectionCard` of four `ChoiceRow`s over `TEXT_SIZES` (labels `t('Small')`,`t('Medium')`,`t('Large')`,`t('X-Large')`; pick a calm `lucide-react` icon, e.g. `Type`/`ALargeSmall`), `active` = current, `onClick` = `choose(size)` (`setState` + `writeTextSize`). `useEffect` reads + applies on mount. → makes T007 GREEN.
- [ ] T009 [US2] Register the section: in `web/app/(app)/settings/page.tsx` add `<LinkRow href="/settings/text-size" label={t('Text size')} />` in the preferences `SectionCard` (right after Appearance); in `web/components/settings/SettingsSecondaryNav.tsx` add `{ href: '/settings/text-size', label: 'Text size' }` to `SECTIONS` after the Appearance entry.

**Checkpoint**: `npm test -- test/settings/text-size-page.test.tsx` green; picker reachable from both the mobile list and the desktop secondary nav.

---

## Phase 5: User Story 3 — translated strings (P2)

**Goal**: Every Text-size string renders in the user's language (no English fallback).

**Independent test**: `npm test -- test/i18n` green with the new keys; switching language shows
the translated section (manual, T016).

- [ ] T010 [US3] Add the six new double-quoted keys to `web/lib/i18n/es.ts` in a `// Text size (spec 040)` block: `"Text size"`, `"Small"`, `"Medium"`, `"Large"`, `"X-Large"`, `"Choose how large text appears throughout the app."` with Spanish values.
- [ ] T011 [P] [US3] Same six keys + Bengali values in `web/lib/i18n/bn.ts`.
- [ ] T012 [P] [US3] Same six keys + Japanese values in `web/lib/i18n/ja.ts`.
- [ ] T013 [P] [US3] Same six keys + Korean values in `web/lib/i18n/ko.ts`.
- [ ] T014 [P] [US3] Same six keys + Simplified-Chinese values in `web/lib/i18n/zh.ts`.
- [ ] T015 [US3] Run `npm test -- test/i18n` — catalog-reachability (keys used as literals in the page), placeholder-parity (no `{n}` in these strings), and no-eager-catalog must all pass. Fix any missed key/typo.

---

## Phase 6: Polish & Verification

- [ ] T016 Manual browser check per [quickstart.md](./quickstart.md): `npm run dev`, then for Small/Medium/Large/X-Large on a mobile-width and a desktop-width window confirm — instant rescale, **no page overflow / tab bar stays pinned / sidebar full-height** (the `zoom`×`h-dvh` check), no content clipping, no flash on reload, Small == today, size independent of light/dark, and mobile inputs don't auto-zoom at Small. (jsdom cannot see this — this is the only check for the visual `zoom` behavior.)
- [ ] T017 From `web/`: full `npm test` green and `npx tsc --noEmit` clean (no regressions in desktop-parity/nav/settings suites).
- [ ] T018 Update `docs/web.md` if it enumerates the settings sections / per-device preferences, adding Text size (keep the doc current per repo convention). Refresh the managed SPECKIT block in `CLAUDE.md` for feature 040 (agent-context) at the very end.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002→T003)** blocks everything else.
- **US1 (T004→T005→T006)**, **US2 (T007→T008→T009)** both depend only on the module (T003); they can proceed in parallel by a single dev but are listed US1-first (it is the MVP: the default bump ships value even without the picker).
- **US3 (T010–T015)** depends on the page existing (T008) for reachability to pass.
- **Polish (T016–T018)** last.
- Within each story, the test task precedes its implementation task (RED→GREEN).

## Parallel Opportunities

- T011–T014 (four catalog files) are independent — run in parallel `[P]`.
- US1 and US2 implementation can interleave once T003 is green (different files).

## Implementation Strategy (MVP first)

1. **MVP = Foundational + US1** (T001–T006): everyone gets the comfortable default, applied
   with no flash. Shippable on its own.
2. **+ US2** (T007–T009): the Settings picker and persistence — completes the explicit ask.
3. **+ US3** (T010–T015): translations — required before merge (FR-010) but additive.
4. **Polish** (T016–T018): the mandatory visual check, full green, docs.

## Independent Test Criteria (recap)

- **US1**: no stored pref → `documentElement` has `zoom:1.06`/`data-text-size="medium"` at boot.
- **US2**: selecting each option persists (`localStorage.textSize`) and applies; active follows; survives reload.
- **US3**: `test/i18n` green with new keys; each locale shows the translated section.

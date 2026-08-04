# Contract: `components/settings/textSize.ts`

The single source of truth for the text-size preference. Mirrors
`components/settings/appearance.ts`. All functions are SSR-safe (guard `document` /
`localStorage`) and pure except for the documented DOM / storage side effects.

## Exports

```ts
export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

/** Ascending order; also the render order of the picker. */
export const TEXT_SIZES: readonly TextSize[]           // ['small','medium','large','xlarge']

export const DEFAULT_TEXT_SIZE: TextSize                // 'medium'

/** Whole-UI zoom multiplier per size. small MUST be 1; strictly increasing. */
export const TEXT_SIZE_SCALE: Record<TextSize, number>  // {small:1, medium:1.06, large:1.14, xlarge:1.22}

/** Apply to <html>: sets style.zoom = String(scale) and dataset.textSize = size. No-op if document is undefined. */
export function applyTextSize(size: TextSize): void

/** Read persisted size; returns DEFAULT_TEXT_SIZE if missing/empty/unknown/unavailable. Never throws. */
export function readTextSize(): TextSize

/** Persist to localStorage['textSize'] then applyTextSize(size). */
export function writeTextSize(size: TextSize): void
```

## Behavioural contract (asserted by tests)

| # | Given | When | Then |
|---|---|---|---|
| C1 | no stored value | `readTextSize()` | returns `'medium'` |
| C2 | stored `'large'` | `readTextSize()` | returns `'large'` |
| C3 | stored `'xxlarge'` / `''` / `'{bad'` / unknown | `readTextSize()` | returns `'medium'` |
| C4 | — | `TEXT_SIZE_SCALE.small` | `=== 1` |
| C5 | — | scale values over `TEXT_SIZES` | strictly increasing (monotonic) |
| C6 | any size | `applyTextSize(size)` | `document.documentElement.style.zoom === String(scale)` and `dataset.textSize === size` |
| C7 | `document === undefined` | `applyTextSize(size)` | no throw (no-op) |
| C8 | any size | `writeTextSize(size)` | `localStorage['textSize'] === size` **and** `applyTextSize` effect applied |
| C9 | `localStorage === undefined` | `readTextSize()` / `writeTextSize()` | no throw; read returns default |

## Boot-script contract (`app/layout.tsx`)

An inline `<script>` string (`TEXT_SIZE_BOOT`) that, before first paint:
- embeds `TEXT_SIZE_SCALE` verbatim (single source of truth — kept in sync with the module),
- reads `localStorage['textSize']`,
- resolves an unknown/missing value to `medium`,
- sets `document.documentElement.style.zoom` and `data-text-size`,
- is wrapped in `try/catch` and silent on error (mirrors `APPEARANCE_BOOT`).

## UI contract (`settings/text-size/page.tsx`)

- Renders a back link, `PageHeader` titled `t('Text size')`, a short helper line, and a
  `SectionCard` containing four `ChoiceRow`s in `TEXT_SIZES` order with labels
  `t('Small'|'Medium'|'Large'|'X-Large')`.
- Exactly one row is `active` (the current size); on mount it reflects `readTextSize()`
  (default Medium).
- Clicking a row calls `writeTextSize(size)` and updates the active indicator immediately,
  with no reload.

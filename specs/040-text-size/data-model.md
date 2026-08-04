# Data Model: Global Text Size

The feature has one tiny, client-only entity. No database, no server, no Supabase change.

## Entity: TextSize preference

A single per-device value selecting the active UI scale.

| Attribute | Value |
|---|---|
| **Type** | `TextSize = 'small' \| 'medium' \| 'large' \| 'xlarge'` |
| **Ordering** | ascending: `small < medium < large < xlarge` (`TEXT_SIZES` array) |
| **Default** | `medium` (`DEFAULT_TEXT_SIZE`) |
| **Scale map** | `small → 1.00`, `medium → 1.06`, `large → 1.14`, `xlarge → 1.22` (`TEXT_SIZE_SCALE`) |
| **Storage** | `localStorage`, key `textSize`, value = the literal size string |
| **Scope** | Per device/browser. Not synced to the account. |

### Validation / coercion rules

- On read, the stored value is valid only if it is exactly one of the four size strings.
- Any other state — key absent, empty string, whitespace, JSON garbage, an old/unknown value
  (e.g. a future `xxlarge`) — coerces to `DEFAULT_TEXT_SIZE` (`medium`). Reading never throws.
- `small` MUST map to scale `1.00` exactly (the pre-feature baseline / "way back").
- The scale map MUST be strictly increasing across `TEXT_SIZES` (monotonic; asserted by test).

### Applied effect (derived state)

Applying a size sets, on `document.documentElement`:
- inline style `zoom` = `String(TEXT_SIZE_SCALE[size])` — the whole-UI scale.
- `data-text-size` attribute = the size string — for tests/debuggability (not read back by app logic).

No other DOM/state is touched; the appearance (`data-appearance`, inline theme vars),
language, currency, dashboard-scope, and widget preferences are independent and unaffected
(FR-011).

### Lifecycle

1. **Boot** (`app/layout.tsx` inline script): read `textSize` → apply before first paint.
2. **App-shell mount** (`app/(app)/layout.tsx` effect): `applyTextSize(readTextSize())`.
3. **User change** (`settings/text-size/page.tsx`): `writeTextSize(size)` → persist + apply,
   local component state updated for the active indicator.

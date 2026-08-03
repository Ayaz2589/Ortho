# Phase 1 Data Model: Dashboard Widget System (Foundation)

No database schema changes. All entities are client-side TypeScript types + a single localStorage
key. Money/finance data is **not** modeled here — widgets render placeholder content only.

## Entity: `WidgetSize`

A closed vocabulary of cell footprints.

```ts
type WidgetSize = 'sm' | 'md' | 'lg' | 'wide'
```

Mapping (see research R2): `sm` = 1×1, `md` = 2×1, `lg` = 2×2, `wide` = full-row×1 on the
expanded grid; all collapse to a single full-width column on compact.

## Entity: `WidgetDefinition`

The static description of one widget. Lives only in the registry (single source of truth).

```ts
interface WidgetDefinition {
  /** Stable, unique, kebab-case id. Persisted in preferences; never reused/renamed. */
  id: string
  /** Display name (English key; translated via i18n). Shown on the board and in Settings. */
  title: string
  /** One-line description shown in the Settings toggle list. English key; translated. */
  description: string
  /** Cell footprint used by the board to size + pack the widget. */
  size: WidgetSize
  /** Whether the widget is enabled for a member who has never toggled it. */
  defaultEnabled: boolean
  /** Calm placeholder render body. Receives no props in the foundation (no live data). */
  Body: React.ComponentType
}
```

Invariants (locked by `registry.test.tsx`):
- `id` is unique across the registry and matches `^[a-z0-9-]+$`.
- `title` and `description` are non-empty.
- Every `WidgetSize` value appears at least once (the shipped set exercises the whole vocabulary and
  therefore the packing).
- `Body` is a component (function).

## Entity: `WidgetPrefs`

The per-browser record of enabled/disabled choices.

```ts
type WidgetPrefs = Record<string /* widget id */, boolean>
```

- Persisted as JSON under localStorage key **`ortho.widgets`**.
- A missing entry means "use the definition's `defaultEnabled`" (prefs are sparse — only explicit
  toggles are stored).
- Extra keys not matching any definition id are ignored on read (no error).

### Resolution rule (pure function, tested)

```
isEnabled(def, prefs) = prefs[def.id] ?? def.defaultEnabled
enabledWidgets(registry, prefs) = registry.filter(def => isEnabled(def, prefs))
```

- Order on the board follows registry declaration order (deterministic, testable).
- `readWidgetPrefs()` returns `{}` on any failure (no storage / bad JSON / non-object / array).
- `writeWidgetPrefs(next)` is a best-effort no-op if storage throws (private mode / quota).
- `setEnabled(id, on)` merges `{ [id]: on }` into the stored object and rewrites.

## Entity: `WidgetBoard` (render model, not persisted)

Given `enabledWidgets`, the board:
- renders each inside a `Widget` frame sized by `def.size`;
- uses `grid-auto-flow: dense` so no cell is empty;
- shows `WidgetEmptyState` when `enabledWidgets` is empty.

## State transitions

```
default (no stored prefs)
   → member opens Settings → Widgets
   → toggles widget X off  → prefs = { ...prefs, X: false } persisted
   → Dashboard re-renders  → X absent, board re-packs (no gap)
   → reload                → readWidgetPrefs() restores { X: false }
   → toggles X on          → prefs = { ...prefs, X: true } persisted → X reappears
```

Corrupt/missing prefs at any point → treated as `{}` → all definitions fall back to
`defaultEnabled` (never a crash; FR-007).

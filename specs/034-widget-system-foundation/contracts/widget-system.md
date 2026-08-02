# Contract: Widget System modules

Public surface each consumer and test may rely on. TypeScript signatures are the contract; the
listed invariants are what the test suite locks.

## `web/lib/widgets/registry.tsx`

```ts
export type WidgetSize = 'sm' | 'md' | 'lg' | 'wide'

export interface WidgetDefinition {
  id: string
  title: string
  description: string
  size: WidgetSize
  defaultEnabled: boolean
  Body: React.ComponentType
}

/** The single source of truth. Declaration order == board order. */
export const WIDGETS: readonly WidgetDefinition[]

/** Lookup by id (undefined if unknown). */
export function getWidget(id: string): WidgetDefinition | undefined
```

**Invariants**: ids unique + kebab-case; titles/descriptions non-empty; each `WidgetSize` used at
least once; `WIDGETS` non-empty.

## `web/lib/widgets/preferences.ts`

```ts
export type WidgetPrefs = Record<string, boolean>

export const WIDGETS_STORAGE_KEY = 'ortho.widgets'

/** Defensive read: {} on missing/corrupt/non-object storage. Never throws. */
export function readWidgetPrefs(): WidgetPrefs

/** Best-effort write; no-op if storage unavailable/throws. Never throws. */
export function writeWidgetPrefs(prefs: WidgetPrefs): void

/** stored[id] ?? def.defaultEnabled */
export function isWidgetEnabled(def: WidgetDefinition, prefs: WidgetPrefs): boolean

/** WIDGETS filtered by isWidgetEnabled, in declaration order. */
export function enabledWidgets(prefs: WidgetPrefs): WidgetDefinition[]

/** Merge { [id]: on } and persist; returns the next prefs. */
export function setWidgetEnabled(id: string, on: boolean, prefs: WidgetPrefs): WidgetPrefs
```

**Invariants**: `readWidgetPrefs` returns `{}` for `null` / `"not json"` / `"[1,2]"` / `"5"`;
`isWidgetEnabled` honors stored `false` over a `true` default and vice-versa; unknown stored ids
never appear in `enabledWidgets`; a definition with no stored entry uses its default.

## `web/lib/widgets/useWidgetPrefs.ts`

```ts
export function useWidgetPrefs(): {
  prefs: WidgetPrefs
  enabled: WidgetDefinition[]
  setEnabled: (id: string, on: boolean) => void
}
```

**Behavior**: first render returns defaults (SSR-safe, no storage read during render); a mount
effect adopts `readWidgetPrefs()`; `setEnabled` updates state and calls `writeWidgetPrefs`.

## `web/components/widgets/Widget.tsx`

```ts
export function Widget(props: { definition: WidgetDefinition }): JSX.Element
```

**Contract**: renders the calm card frame (`.ow-card`, no shadow, hairline-in-dark) with the widget
title and `<definition.Body/>`; frame is `height: 100%` with a flex-column body that `flex: 1` so it
fills the grid cell. Applies the `.ow-w-{size}` span class. Never renders `null`.

## `web/components/widgets/WidgetBoard.tsx`

```ts
export function WidgetBoard(): JSX.Element
```

**Contract**: reads `useWidgetPrefs()`, renders one `Widget` per enabled definition inside
`.ow-board`; renders `WidgetEmptyState` when none enabled. One composition for all widths
(responsiveness is CSS via `--cols`); width-capped/centered. `role`/heading semantics make each
widget discoverable; the board itself is a labelled region.

**Invariants** (widget-board.test):
- renders exactly the enabled widgets, in registry order;
- disabling a widget removes it; enabling re-adds it;
- zero enabled → empty state present, no widget cards;
- adding a `WIDGETS` entry (test double) makes it render without touching the board component.

## `web/components/widgets/WidgetEmptyState.tsx`

```ts
export function WidgetEmptyState(): JSX.Element
```

**Contract**: calm, non-alarmist copy + a link to `/settings/widgets`. No red, no shimmer.

## CSS (`web/app/globals.css`, `ow-*` block) — tokens only

```
.ow-board        display:grid; gap:16px; grid-auto-flow:row dense; grid-auto-rows:1fr;
                 grid-template-columns:repeat(var(--ow-board-cols,1),minmax(0,1fr));
                 max-width:1080px; margin-inline:auto;
  @media ≥640px  --ow-board-cols:2
  @media ≥1024px --ow-board-cols:4     /* sm=1, md=2, lg=2, wide=4 spans pack into 4 tracks */
.ow-w-sm         grid-column: span 1;
.ow-w-md         grid-column: span 2;
.ow-w-lg         grid-column: span 2; grid-row: span 2;
.ow-w-wide       grid-column: 1 / -1;
  (on compact, all .ow-w-* collapse to span 1 / full width)
```

**Invariant**: no hardcoded colors; gap matches `.ow-grid` (16px); board caps at 1080px and centers.

## Settings: `web/app/(app)/settings/widgets/page.tsx`

**Contract**: lists every `WIDGETS` entry as a `ChoiceRow` (name + description + on/off), reflecting
`useWidgetPrefs()`; clicking toggles + persists. Reachable from the mobile settings menu
(`settings/page.tsx` LinkRow) and the desktop `SettingsSecondaryNav`. Fully keyboard accessible.

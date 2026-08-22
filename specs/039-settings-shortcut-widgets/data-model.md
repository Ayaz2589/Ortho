# Data Model: Settings-Shortcut Dashboard Widgets

No persisted entities. One optional field is added to the existing `WidgetDefinition`.

## `WidgetDefinition` (extended)

```ts
export interface WidgetDefinition {
  id: string
  title: string
  description: string
  defaultEnabled: boolean
  Body: ComponentType
  /** Optional route. When set, the widget's card is a link to this path and clicking
   *  it navigates instead of opening the details drawer. */
  href?: string
}
```

Backward compatible: existing data widgets omit `href` and keep the drawer behavior.

## The four navigation widgets

| id                | title               | href                 | icon (lucide)      |
| ----------------- | ------------------- | -------------------- | ------------------ |
| `download-data`   | Download your data  | `/settings/data`     | `Download`         |
| `widget-settings` | Widget settings     | `/settings/widgets`  | `LayoutGrid`       |
| `change-currency` | Change currency     | `/settings/currency` | `CircleDollarSign` |
| `change-language` | Change language     | `/settings/language` | `Languages`        |

All ship `defaultEnabled: false`.

## Shared body

`SettingsShortcut({ icon })` renders: an icon in a `var(--chip-bg)` chip that grows to fill the cell,
and a bottom "Open" affordance (`text-accent` + `ChevronRight`). The widget frame's `<h2>` title
carries the label, so the body needs no per-widget text (minimal i18n, no duplication).

## New i18n keys (English source; translated in es/bn/ja/ko/zh)

```
"Download your data"
"Widget settings"
"Change currency"
"Change language"
"A shortcut to download or restore your household data."
"A shortcut to choose which widgets appear on your dashboard."
"A shortcut to change your display currency."
"A shortcut to change the app language."
"Open"
```

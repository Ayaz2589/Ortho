# Quickstart: Settings-Shortcut Dashboard Widgets

## Enable the widgets

All four ship **default-off**. To use them:

1. Open **Settings → Widgets**.
2. Toggle on any of **Download your data**, **Widget settings**, **Change currency**,
   **Change language**.
3. Return to the **Dashboard** — each enabled shortcut appears as a calm tile. Click (or Tab + Enter)
   to jump straight to that Settings page.

## Add another navigation widget later

1. Add a body to `web/components/widgets/bodies/settingsShortcuts.tsx` (reuse `SettingsShortcut` with
   a lucide icon), or reuse an existing one.
2. Add a `WIDGETS` entry in `web/lib/widgets/registry.tsx` with an `href` (the route) and `Body`.
3. Add the title + description strings to `web/lib/i18n/{es,bn,ja,ko,zh}.ts`.
4. Add a test asserting the registry entry's href and that the body renders.

Because the frame handles `href` generically, no board or settings code changes are needed.

## Verify

```bash
cd web
npm test -- widget-frame settings-shortcuts registry board
npx tsc --noEmit
```

# Quickstart: Housing Dashboard Widgets

## Enable the widgets

Both widgets ship **default-off** (like Recent activity). To see them:

1. Open **Settings → Widgets**.
2. Toggle **Housing costs** and/or **Home equity** on.
3. Return to the **Dashboard** — the enabled widget(s) appear on the board.

The choice persists per browser (`ortho.widgets` localStorage), like every other widget.

## What each shows

- **Housing costs** — your total monthly housing cost across all properties (mortgage payments + lease
  rents), how many properties feed that number, and — if you own a multifamily rental — the net
  monthly rental cashflow (occupied rent minus mortgage). Negative net rental is shown with a minus
  glyph, never in red.
- **Home equity** — the total principal you've paid down across all mortgages, with a progress bar and
  "X% paid off" toward the original loan balance. A paid-off mortgage reads 100%.

If you have no properties, Housing costs shows a calm "No properties yet." If you have no mortgage,
Home equity shows "No mortgages yet." Neither ever shows a hollow card.

## Add a similar widget later (recipe)

1. Create `web/components/widgets/bodies/YourBody.tsx` — propless, read `useApp()`, fill `h-full`,
   include a calm empty state.
2. Add an entry to `WIDGETS` in `web/lib/widgets/registry.tsx` (`id`, `title`, `description`,
   `defaultEnabled`, `Body`).
3. Add the new strings to `web/lib/i18n/{es,bn,ja,ko,zh}.ts`.
4. Add `web/test/widgets/your-widget.test.tsx` (mock `@/lib/store`, assert figures + empty state +
   `h-full`).
5. `npm test` — the widget now appears in Settings and (when enabled) on the board automatically.

## Verify

```bash
cd web
npm test -- housing-costs home-equity registry extensibility
npx tsc --noEmit
```

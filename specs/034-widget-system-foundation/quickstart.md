# Quickstart: Dashboard Widget System (Foundation)

## What this is

The Dashboard Overview is a **widget board**: a responsive, densely-packed grid of widgets. Each
widget is declared once in a registry, can be toggled on/off in Settings, and fills its cell with no
dead space. This foundation ships calm **placeholder** widgets — real data is future work.

## Add a widget (the whole workflow)

1. Add one entry to `web/lib/widgets/registry.tsx`:

   ```tsx
   {
     id: 'net-summary',                 // stable, unique, kebab-case — never rename
     title: 'Net summary',              // English key (also add to the 5 i18n catalogs)
     description: 'Income minus spending this month.',
     size: 'lg',                        // 'sm' | 'md' | 'lg' | 'wide'
     defaultEnabled: true,
     Body: NetSummaryPlaceholder,       // a calm placeholder component (from placeholders.tsx)
   }
   ```

2. That's it. The widget now:
   - appears in **Settings → Widgets** with an on/off toggle;
   - renders on the **Dashboard** (if enabled) in a `size`-appropriate cell;
   - packs with the others — no empty cells, no blank bands.

No edits to `WidgetBoard`, the settings page, or any layout code are required (FR-008).

## Turn widgets on/off

- Go to **Settings → Widgets** (mobile menu row, or desktop settings sidebar).
- Toggle any widget. The Dashboard updates and the board re-packs.
- Choices persist per browser under `localStorage['ortho.widgets']` and survive reloads.
- Turn everything off → the Dashboard shows a calm "your dashboard is empty" state linking back to
  Settings. Corrupt/missing prefs fall back to defaults (never a crash).

## Verify locally

```bash
cd web
npm test            # widget preferences / registry / board / settings / frame specs
npx tsc --noEmit    # types
```

Then run the app and check:
- Phone width: widgets stack full-width, no horizontal scroll, each card filled.
- Desktop width: multi-column dense grid, capped at 1080px and centered, no empty cells, no widget
  with a blank band or collapsed to a sliver.
- Tab through Settings → Widgets: every toggle is keyboard reachable with a visible focus ring.

## Design rules (enforced by review + tests)

- Tokens only — no hardcoded colors. Inset widget cards have **no shadow**; separators are hairlines.
- Accents are sage (incoming money) and sand (focus/links). **Loss is never red.**
- Every widget fills its cell; a widget never renders `null` (it renders a filled placeholder box).
- One composition for mobile and desktop — no separate desktop layout file.

# Tasks: Settings-Shortcut Dashboard Widgets

**Input**: Design documents from `specs/039-settings-shortcut-widgets/`

**Tests**: REQUIRED — Principle VI. Every behavior task writes a failing test first.

**Working dir**: all paths under `web/`.

---

## Phase 1: Framework — href navigation on the widget frame

- [x] T001 Extend `web/test/widgets/widget-frame.test.tsx`: a definition with `href` renders the card
  as a real link (`role="link"`) pointing at `href`, and clicking it does NOT call `onOpen`; a
  definition without `href` keeps the drawer-opening button (existing tests stay green).
- [x] T002 Add optional `href?: string` to `WidgetDefinition` in `web/lib/widgets/registry.tsx` and
  implement the branch in `web/components/widgets/Widget.tsx` (href → `<Link>` overlay, no drawer;
  else → existing button) until T001 passes.

---

## Phase 2: The four shortcut widgets

- [x] T003 Write FAILING `web/test/widgets/settings-shortcuts.test.tsx`: each of the four bodies
  renders an "Open" affordance and fills `h-full`; and the registry has the four entries with the
  correct id → href mapping (download-data→/settings/data, widget-settings→/settings/widgets,
  change-currency→/settings/currency, change-language→/settings/language), all `defaultEnabled: false`.
- [x] T004 Implement `web/components/widgets/bodies/settingsShortcuts.tsx` (shared `SettingsShortcut`
  + `DownloadDataBody`, `WidgetSettingsBody`, `ChangeCurrencyBody`, `ChangeLanguageBody`) until the
  body assertions pass. Token-only; icon chip + `text-accent` "Open" affordance.
- [x] T005 Add the four entries to `WIDGETS` in `web/lib/widgets/registry.tsx` (each with `href` +
  `Body`, `defaultEnabled: false`) until the registry assertions pass.

---

## Phase 3: i18n + verify

- [x] T006 [P] Add the 9 new strings to `web/lib/i18n/{es,bn,ja,ko,zh}.ts` (see data-model.md).
- [x] T007 Run `npm test` and `npx tsc --noEmit` in `web/`; fix to green. Verify SC-001..SC-004.

---

## Dependencies

- T001 → T002 (frame test before frame impl).
- T003 → T004 + T005 (test before bodies and registry).
- T006 [P] independent; T007 last.

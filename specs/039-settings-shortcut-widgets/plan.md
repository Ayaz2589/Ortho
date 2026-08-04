# Implementation Plan: Settings-Shortcut Dashboard Widgets

**Branch**: `feat/039-settings-shortcut-widgets` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

## Summary

Add four navigation widgets to the spec-034 board that route to a Settings page on click:

- `download-data` → `/settings/data`
- `widget-settings` → `/settings/widgets`
- `change-currency` → `/settings/currency`
- `change-language` → `/settings/language`

This requires one small, general extension to the framework: an optional `href` on
`WidgetDefinition`. When set, the widget frame (`Widget.tsx`) renders its full-cover overlay as a
Next `<Link>` (real, keyboard-reachable) instead of the drawer-opening `<button>`, and the card no
longer opens the details drawer. Data widgets (no `href`) are unchanged. The four bodies share one
calm presentational component (`SettingsShortcut`: icon chip + "Open" affordance).

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js (App Router), Tailwind v4.

**Primary Dependencies**: widget registry + frame (`lib/widgets/registry.tsx`,
`components/widgets/Widget.tsx`), `next/link`, `lucide-react`, i18n catalogs. No new dependencies.

**Storage**: none. Enabled/disabled uses the existing `ortho.widgets` prefs.

**Testing**: Vitest + Testing Library (`npm test` in `web/`), TDD.

**Constraints**: tokens only; real semantic links with visible focus ring; each body fills its cell.

**Scale/Scope**: 1 optional field on `WidgetDefinition`, 1 frame branch, 1 shared body component + 4
thin bodies, 4 registry entries, ~9 i18n strings × 5 catalogs, 2 test files (+ frame test extension).

## Constitution Check

- **I. Tokens Only** — PASS. Icon chip uses `var(--chip-bg)`; affordance uses `text-accent`; no new
  palette entries.
- **II. Calm Over Dense** — PASS. Sparse icon + label tiles; default-off keeps the first-run board
  unchanged.
- **III. Right Form Factor** — PASS. One board composition; links reflow with the grid.
- **IV. Plainspoken Voice** — PASS. Plain titles ("Change currency") + a single "Open" affordance.
- **V. Accessible & Interaction-Complete** — PASS. The card is a real `<Link>` (`<a>`),
  Tab-focusable, Enter-activatable, with the standard sand focus ring; ≥44px target (full card).
- **VI. Test-Driven & Regression-Safe** — PASS. Frame href behavior + registry wiring + bodies are
  covered failing-test-first; the existing frame drawer behavior is pinned to stay backward
  compatible.

**No violations — Complexity Tracking not required.**

## Project Structure

```text
web/
├── components/widgets/
│   ├── Widget.tsx                       # EDIT — optional href → <Link> overlay (else drawer button)
│   └── bodies/settingsShortcuts.tsx     # NEW — SettingsShortcut + 4 bodies
├── lib/widgets/registry.tsx             # EDIT — href? field + 4 entries
└── lib/i18n/{es,bn,ja,ko,zh}.ts         # EDIT — new strings

tests:
web/test/widgets/widget-frame.test.tsx       # EDIT — href renders a link; no onOpen
web/test/widgets/settings-shortcuts.test.tsx # NEW — bodies render + registry wiring
```

**Structure Decision**: The `href` mechanism is added to the shared frame, not special-cased per
widget (altitude: generalize the frame once; every future navigation widget reuses it). The four
bodies share one presentational component to avoid copy-paste.

## Phase 0 — Research

Decisions:
- **Optional `href` on the definition, handled in the frame.** The whole card becomes the link — a
  full-cover `<a>` overlay (pointer-events auto). This is safe here because shortcut bodies have no
  scrollable content to swallow (unlike data widgets, whose overlay stays `pointer-events-none`).
- **Reuse existing routes.** All four `/settings/...` pages already exist.
- **Default-off**, consistent with `activity` and the housing widgets.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the `href` field and the four entries.
- [quickstart.md](./quickstart.md) — enabling + adding another navigation widget.

## Complexity Tracking

No constitution violations — section intentionally empty.

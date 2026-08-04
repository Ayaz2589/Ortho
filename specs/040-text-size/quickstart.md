# Quickstart / Validation: Global Text Size

How to prove the feature works. All commands run from `web/`.

## Automated tests (gate)

```bash
cd web
# The feature's own tests
npm test -- test/settings/text-size.test.ts
npm test -- test/settings/text-size-page.test.tsx
# i18n guards (must stay green after adding catalog strings)
npm test -- test/i18n
# Full suite + typecheck before PR
npm test
npx tsc --noEmit
```

**Expected**: all green. The two new files cover the module contract (read/write/apply/scale)
and the picker (render, active indicator, click-persists-and-applies). The i18n reachability
and placeholder-parity suites stay green with the new catalog keys.

## Manual browser check (mandatory — the one thing tests can't see)

jsdom does not lay out or render `zoom`, so the visual behavior of the whole-UI scale must be
eyeballed once in a real browser (see research.md R2 — this is the belt-and-suspenders check
for the `zoom` × `h-dvh` × fixed-tab-bar interaction).

```bash
cd web && npm run dev   # then open the app
```

For each size (Small, Medium, Large, X-Large), on a **mobile-width** and a **desktop-width**
window, confirm:

1. **Settings → Text size** changes the whole UI immediately, no reload.
2. **No page scrollbar / no overflow**: the app shell still fills exactly one viewport; the
   bottom **tab bar stays pinned** to the visible bottom (mobile), the sidebar stays full-height
   (desktop). ← the `zoom`+`h-dvh` check.
3. **No clipping**: Dashboard widgets, a long Transactions list, and Settings scroll rather
   than crop; money amounts are never abbreviated.
4. **No flash on reload**: pick X-Large, hard-reload — the app comes up at X-Large with no
   momentary smaller frame.
5. **Small = today**: Small reproduces the pre-feature density.
6. **Independent of theme**: toggling light/dark does not change the size and vice versa.
7. **Mobile inputs**: focus a text field on a touch/mobile viewport at Small — the browser
   does not auto-zoom (16px input floor preserved).

## Translations

Switch **Settings → Language** to each of Spanish, 简体中文, বাংলা, 한국어, 日本語 and open
**Text size** — the title, the four labels, and the helper line render translated (no English
fallback).

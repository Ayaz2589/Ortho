# Quickstart: Learn-More Tour (spec 047)

How to run and verify this feature. Automated coverage first, then the handful of checks that
genuinely need a browser.

## Prerequisites

```bash
cd web
npm install          # if node_modules is absent
```

No environment variable is required. The tour is pre-auth: no Supabase, no `.env.local`, no
database, no migration.

## 1. Run the suite

```bash
cd web
npm test
```

**Expected**: everything green.

| | Test files | Tests |
|---|---|---|
| Baseline on this branch before 047 | 275 | 2569 passing (+3 expected-fail) |
| After 047 | **279** | **2735 passing** (+3 expected-fail) |

Four new test files, +166 tests, and **zero pre-existing tests broken** (SC-007). Three assertions
in two existing spec-045 files were narrowed rather than left failing — see `research.md` §4 for
which, and why each narrowing preserves the guard rather than disarming it.

Feature-scoped runs while working:

```bash
npm test -- test/onboarding/tour-logic.test.ts     # pure helpers (node)
npm test -- test/onboarding/tour-deck.test.tsx     # US1 + US2 behavior (jsdom)
npm test -- test/onboarding/tour-route.test.tsx    # static params, metadata, module graph
npm test -- test/i18n/tour-catalogs.test.ts        # six-locale copy guards
npm test -- test/i18n/landing-catalogs.test.ts     # the 045 guard, still passing after narrowing
```

## 2. Typecheck

```bash
cd web
npx tsc --noEmit
```

## 3. Build — proves the static export really produces six documents

This is the check that would catch a routing mistake the unit tests cannot see. Per the
constitution's workflow note: **do not run a production build while a shared dev server is
running.**

```bash
cd web
npm run build
ls out/tour/*.html                                        # six documents, no more
grep -o 'name="robots" content="[^"]*"' out/tour/es.html  # noindex, follow
grep -c 'tour' out/sitemap.xml                            # 0 — the tour is not listed
```

**Expected**: exactly six tour documents — one per registry slug, not thirty. Screens are client
state, so screen count never multiplies documents (spec Assumptions).

**Measured on this branch** (Next 16.2.9, `output: 'export'`):

```text
out/tour/{en,es,bn,ja,zh,ko}.html          6 documents ✓
out/tour/es.html  <title>                  Todo lo que gastas, en un solo lugar
out/tour/es.html  robots                   noindex, follow ✓
out/tour/es.html  Spanish body copy        1 occurrence  ✓
out/tour/es.html  English body copy        0 occurrences ✓
out/sitemap.xml   /tour entries            0 ✓  (six /landing entries, unchanged)
```

That fourth line is the real proof of SC-004: the Spanish copy is in the **static HTML**, and the
English string is absent from the document entirely. First paint is correct by construction, not by
winning a timing race — which is a stronger guarantee than the visual check in §4 can give.

## 4. Walk it in a browser

```bash
cd web
npm run dev
# http://localhost:3000/tour/en
```

### Acceptance walkthrough (US1)

1. Open `/tour/es`. The first screen is Spanish **immediately** — no English frame at any point
   (SC-004). Hard-reload a few times with the network throttled; still no flash.
2. Advance through all five screens. The last screen's control finishes rather than advancing.
3. Take the finish action → you arrive at `/sign-in`, and the sign-in form is in Spanish (the
   language was adopted on the way out).
4. Reload `/tour/es`, press **Skip** on screen 1 → same destination, `/sign-in`.
5. In DevTools → Application → Local Storage, confirm `ortho.onboardingFunnel` is `'1'` **after
   the skip**, not only after finishing. This is FR-006 and the single most important manual
   check in this feature — the requirement the spec's checklist flags as most likely to be
   inverted.
6. Time yourself reading all five screens in one language: under 60 seconds (SC-001).

### Interaction (US2)

7. **Touch** — in device emulation, swipe left/right across the deck. Then swipe *diagonally*: the
   page should scroll, not page. Then swipe a short distance (< 44 px): nothing should happen.
8. **Keyboard** — `ArrowRight` / `ArrowLeft` move through screens. `Tab` reaches every control in
   DOM order with a visible sand focus ring, and `Enter`/`Space` activate them.
9. **Position** — your place in the sequence is readable as text on every screen, not only as dots.
10. **Back** — go to screen 3, then press the browser Back button. You leave the tour in one press;
    it does not trap you for three (research §2).
11. **Reduced motion** — DevTools → Rendering → *Emulate CSS prefers-reduced-motion: reduce*. Screen
    changes become instant; nothing slides.

### Layout and honesty (US3)

12. At 360 px wide with the longest translation (check `bn` and `ja`), text wraps without clipping
    and the advance control is reachable **without scrolling**.
13. At 1440 px, the reading column stays capped and centered — it must not span the monitor.
14. Read all five screens against the app: every claim maps to something that ships today
    (`data-model.md` §3 lists the file backing each). No amounts appear anywhere, so there is no
    money formatting to get wrong.
15. Toggle dark mode. Tokens only — nothing hardcoded, no red.

### Native exclusion (FR-011)

16. `Capacitor.isNativePlatform()` is mocked in `tour-deck.test.tsx`, which is the real guard.
    There is no live native app to test against (`docs/ios.md`); the Capacitor iOS CI job only
    build-verifies. Manual confirmation is not possible in this environment and is not claimed.

## What was NOT verified in the sandbox this shipped from

Steps 1–15 above need a browser, and this sandbox has none. Two of them are covered more strongly
by the headless evidence in §3 (no-English-flash, and the Skip-sets-the-marker behavior, which
`tour-deck.test.tsx` asserts from the first, a middle and the last screen). Two are genuinely
open and worth a reviewer's eye:

- **Text wrapping at 360 px** with the longest Bengali and Japanese strings, and the advance
  control staying above the fold. The controls pair Back and Skip on one row rather than stacking
  three full-width buttons, specifically to keep ~50 px off the fold — but that is a judgement,
  not a measurement.
- **Swipe feel on a real device** — momentum, rubber-band, and pointer cancellation are browser
  behaviors that jsdom's synthetic touch events cannot reproduce.

## 5. What is intentionally not covered

- **Per-screen drop-off.** No analytics exist, so SC-001's 60-second target is a design goal
  verified by the walkthrough above, not by instrumentation (spec Assumptions).
- **Real-device swipe.** jsdom drives synthetic touch events; momentum, rubber-band and pointer
  cancellation are browser behaviors verified by step 7 in emulation.
- **Screenshot/visual regression.** The suite tests behavior and semantics, not pixels
  (Principle VI).

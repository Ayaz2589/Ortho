# Quickstart: No Horizontal Scrolling on Mobile (spec 058)

## Run the guards

```bash
cd web
npx vitest run test/ui/edge-anchor.test.ts \
  test/appearance/no-horizontal-scroll-guard.test.ts \
  test/widgets/panels/panel-overflow.test.tsx \
  test/dashboard/spend-heatmap-overflow.test.tsx
```

## Prove a guard actually guards

Each guard should fail if its fix is reverted. Spot-check the widest-reaching one:

```bash
# Revert the shell fix, watch the guard catch it, then restore.
sed -i '' 's/relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden/relative flex-1 overflow-y-auto sm:min-w-0/' 'app/(app)/layout.tsx'
npx vitest run test/appearance/no-horizontal-scroll-guard.test.ts   # → 2 failures
git checkout 'app/(app)/layout.tsx'
```

## Manual visual confirm (required — no test in this repo can cover it)

jsdom performs no layout, so the suite pins the *declarations* that cause horizontal overflow,
not the rendered result. Confirm the real thing once, in a browser:

```bash
cd web && npm run dev
```

Then, with DevTools device emulation at **iPhone SE (375px)** — the narrowest realistic target —
and again at **320px**:

1. Dashboard → tap each widget → the detail panel opens full-screen. Swipe left/right inside
   it: nothing moves. Check **Top merchants** (day-of-month strip: confirm the day-1 and
   day-31 dots sit fully inside), **Savings trends** (three-column month cards: confirm they
   wrap rather than overflow), and **Spending pace** (the marker caption near the period end).
2. On the dashboard, scroll the spend heatmap horizontally — the **grid** should move while
   the page stays put.
3. Visit transactions, planning and settings; open the budgets and household drawers. Nothing
   drags sideways anywhere.
4. Repeat at **Settings → Text size → X-Large**. The `zoom` rescales the CSS pixel, so this is
   where a marginal layout tips over.

A quick check for any page, pasted in the console — it reports every element wider than the
viewport:

```js
[...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
```

Expect an empty array. (Elements inside a legitimate horizontal scroller, e.g. the heatmap
grid, are the one acceptable exception — they are clipped by their own container.)

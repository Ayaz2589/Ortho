# Quickstart: Dashboard Scope Foundation (Section 0)

## Run the tests

```bash
cd web
npx vitest run test/widgets/dashboard-scope-context.test.tsx test/widgets/dashboard-scope-bar.test.tsx
npx vitest run test/widgets/          # existing widget suites stay green
npx tsc --noEmit                      # types clean
npm test                              # full suite green
```

## Manual smoke (display-capable session)

1. Open the Dashboard overview. A scope bar appears above the board: a segmented range control
   (Month / 3M / 6M / 1Y — only the ranges the data spans), a month picker (prev/next + dropdown +
   "Latest"), and a period caption on the right.
2. Pick a month → the caption updates to that month; the range control deselects. Click a range → the
   month clears and the caption shows the range label.
3. Switch to **Reports** → the scope bar disappears and the Reports surface renders. Switch back to
   **Overview** → the scope bar returns.
4. The six widgets still render calm placeholders (no data yet) and each fills its cell — the split is
   invisible to the eye.

## For section authors (036–041)

Your widget body is `web/components/widgets/bodies/<Name>Body.tsx`. Keep it propless: read data from
`useApp()` and the active window from `useDashboardScopeContext()`:

```tsx
const { transactions, formatMoney, t } = useApp()
const { interval, referenceDate, isSpecificMonth, periodLabel } = useDashboardScopeContext()
```

Do NOT edit `registry.tsx`. Add any new `t()` keys to all five catalogs. Write your
`web/test/widgets/<name>.test.tsx` first (mock the store and the scope context).

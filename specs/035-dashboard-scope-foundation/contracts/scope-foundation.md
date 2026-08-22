# Contract: Dashboard Scope Foundation (Section 0)

## Contract A — `DashboardScopeContext`

**Provider.** `<DashboardScopeProvider>` calls `useDashboardScope()` exactly once and supplies the
returned `DashboardScope` to all descendants via context. It renders `children` unchanged.

**Consumer.** `useDashboardScopeContext(): DashboardScope`:
- Returns the single shared scope when rendered under a provider.
- MUST throw an `Error` mentioning `DashboardScopeProvider` when rendered outside one.

**Sharing invariant.** N consumers under one provider observe the SAME scope object. A mutation
through any consumer (`setMonth`/`setRange`/`clearMonth`) is observed by all consumers on the next
render. There is exactly one `useDashboardScope()` call per provider instance.

## Contract B — Overview scope bar

On the overview (`mode === 'overview'`) the page renders, above the board and inside the provider:
- `RangePicker` driven by `scope.rangeOptions` / `scope.range` / `scope.setRange` (O-1: present).
- `MonthPicker` driven by `scope.availableMonths` / `scope.selectedMonth` / `scope.setMonth` /
  `scope.clearMonth` (hides itself when `availableMonths` is empty).
- A period caption showing `t(scope.periodLabel)`.

On Reports mode (`mode === 'reports'`) NONE of the above render, and the provider is not mounted.

## Contract C — Body split & registry

- Each widget renders from its own `web/components/widgets/bodies/<Name>Body.tsx`, which renders the
  shared `Placeholder` from `placeholders.tsx`.
- `registry.tsx` imports the six body components and points each `Body` at one; it is not edited by
  later sections.
- `WidgetDefinition.Body` stays `ComponentType` (propless). The registry still yields six widgets and
  the board renders identically to before the split.

## Non-goals

No new i18n keys, no schema/store change, no money math, no board/settings/Reports change.

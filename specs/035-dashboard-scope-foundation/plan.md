# Implementation Plan: Dashboard Scope Foundation (Section 0)

**Spec**: `./spec.md` · **Parent plan**: `docs/plan/dashboard-widget-data.md` (Section 0)
**Base branch**: `feat/dashboard-widget-data` · **Work branch**: `feat/035-dashboard-scope-foundation`

## Summary

Wire the already-built-but-orphaned dashboard scope hook and month/range controls into the overview
behind a single shared context, and split the six placeholder widget bodies into one file each so the
data sections can proceed in parallel. Additive and client-side only; no schema, no money math, no
board/settings changes.

## Architecture decisions (from the parent plan)

- **D1 — scope in a dedicated context, not the store.** `useDashboardScope()` keeps month/range in
  local `useState`; it must be called once and shared. A `DashboardScopeProvider` +
  `useDashboardScopeContext()` keeps the store lean and the concern local to the dashboard.
- **D2 — one body file per widget.** Split `placeholders.tsx` into `bodies/<Name>Body.tsx`; keep the
  shared `Placeholder` scaffold in `placeholders.tsx` for the bodies to import. Repoint the registry
  once; later sections touch only their own body file.
- **D4 — propless `Body`.** `WidgetDefinition.Body` stays `ComponentType`; data flows via hooks.
- **O-1 — include the relative-range control** beside the month picker (not month-only).

## Files

| File | Change |
|---|---|
| `web/lib/widgets/DashboardScopeContext.tsx` | NEW — provider calls `useDashboardScope()` once; `useDashboardScopeContext()` reads it, throws outside a provider. |
| `web/components/widgets/bodies/{NetSummary,SpendingPace,Budgets,Goals,TopMerchants,Activity}Body.tsx` | NEW — one calm-placeholder body each, importing the shared `Placeholder`. |
| `web/components/widgets/placeholders.tsx` | Keep + export the shared `Placeholder` scaffold; drop the six named placeholders. |
| `web/lib/widgets/registry.tsx` | Repoint the six `Body` imports to `bodies/*Body.tsx` (the ONE registry edit; not touched by later sections). |
| `web/app/(app)/dashboard/page.tsx` | Overview branch only: wrap the board in `DashboardScopeProvider`, render the scope bar (RangePicker + MonthPicker + `periodLabel` caption). Reports branch untouched. |
| `web/test/dashboard/dashboard-mode.test.tsx` | Complete the store mock (`transactions`/`locale`) now that the overview reads them. |

## Reused, not rebuilt

`useDashboardScope` (`web/lib/useDashboardRange.ts`), `MonthPicker` + `RangePicker`
(`web/components/dashboard/`), the range/interval helpers (`components/dashboard/range.ts`), and the
i18n keys for all revived controls (already in the five catalogs).

## Testing (TDD)

Tests written first, under `web/test/widgets/`:
- `dashboard-scope-context.test.tsx` — one shared scope across consumers; month change propagates to
  all; hook throws outside a provider.
- `dashboard-scope-bar.test.tsx` — overview renders month picker + range control (O-1) + period
  caption; Reports mode renders none.

Existing widget + i18n suites kept green.

## Out of scope

Real widget data (sections 036–041), the integration polish/skeleton/docs (section 042), any schema or
money-math change.

# Tasks: Dashboard Scope Foundation (Section 0)

All tasks complete. TDD order — failing tests first, then implementation, then the full gate.

- [x] T001 Read the parent plan §2/§3/§4 + Section 0; confirm `useDashboardScope`, `MonthPicker`,
  `RangePicker` are orphaned (zero usages) and all their i18n keys exist in the five catalogs.
- [x] T002 Write FAILING `web/test/widgets/dashboard-scope-context.test.tsx`: one shared scope across
  two consumers; a month change through one consumer propagates to both; `useDashboardScopeContext`
  throws outside a provider.
- [x] T003 Write FAILING `web/test/widgets/dashboard-scope-bar.test.tsx`: overview renders the month
  picker AND the relative-range control (O-1) AND the period caption; Reports mode renders none.
- [x] T004 Implement `web/lib/widgets/DashboardScopeContext.tsx` — `DashboardScopeProvider` calls
  `useDashboardScope()` once; `useDashboardScopeContext()` reads context and throws if absent. T002 green.
- [x] T005 Split the six placeholder bodies into `web/components/widgets/bodies/<Name>Body.tsx`
  (importing the shared `Placeholder`); reduce `placeholders.tsx` to the exported `Placeholder`
  scaffold.
- [x] T006 Repoint `web/lib/widgets/registry.tsx` `Body` imports to the six body files (the one and
  only registry edit). Existing registry/board/extensibility suites green.
- [x] T007 Wire `web/app/(app)/dashboard/page.tsx` overview branch: wrap the board in
  `DashboardScopeProvider`, render the scope bar (RangePicker + MonthPicker + `t(periodLabel)`
  caption). Reports branch untouched. T003 green.
- [x] T008 Complete the store mock in `web/test/dashboard/dashboard-mode.test.tsx`
  (`transactions: []`, `locale`) now that the overview reads them.
- [x] T009 Full gate: `npx tsc --noEmit` clean; `npm test` fully green (227 files, 1980 passed,
  3 pre-existing expected-fails); no new i18n keys added.
- [x] T010 Update `.specify/feature.json` to point at this spec dir.

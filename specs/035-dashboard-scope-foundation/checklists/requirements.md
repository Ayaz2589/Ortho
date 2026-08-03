# Requirements Checklist: Dashboard Scope Foundation (Section 0)

- [x] Single shared scope via a dedicated provider; `useDashboardScope()` called exactly once (FR-001).
- [x] `useDashboardScopeContext()` throws outside a provider (FR-002).
- [x] Overview renders the range control AND the month picker AND the period caption (FR-003, O-1).
- [x] Reports mode renders no scope bar / no provider (FR-004).
- [x] Six placeholder bodies split into `bodies/<Name>Body.tsx`; registry repointed once (FR-005).
- [x] `WidgetDefinition.Body` stays propless `ComponentType` (FR-006).
- [x] Board renders identically after the split — still calm placeholders (FR-007).
- [x] No new i18n keys; all revived-control keys already in the five catalogs (FR-008).
- [x] Tests written first (context + scope-bar suites); existing widget + i18n suites green.
- [x] `npx tsc --noEmit` clean; `npm test` fully green.
- [x] Design tokens only; no red for negatives; controls reuse existing calm styles.
- [x] `.specify/feature.json` points at this spec dir.

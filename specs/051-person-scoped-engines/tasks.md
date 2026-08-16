# Tasks: Person-Scoped Money Engines

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Status**: ✅ complete

## US1 — one switch scopes the app (P1)

- [x] T001 `web/lib/scope/moneyScope.ts` — `MoneyScope`, `HOUSEHOLD_SCOPE`, `personScope`,
      `scopeTransactions`, `resolveScope`.
- [x] T002 **No-op lock first**: household scope returns the same array *reference*.
- [x] T003 Projection: stored share for expense/income; transfers directional at full amount;
      non-owners dropped; inputs never mutated.
- [x] T004 Reconciliation property — scoped amounts sum back to the household total, sizes 1–6.
- [x] T005 `resolveScope` degrades a removed person to household scope.
- [x] T006 `MoneyScopeContext` provider + hook, mirroring the time-axis context.

## US2 — budgets and the plan answer for one person (P1)

- [x] T007 `PlanSummaryInput.scope`; `buildPlanSummary` projects once at the entry point.
- [x] T008 Tests: halved spend against an unchanged limit, halved income, non-owner gets nothing,
      both people's scoped spend reconciles to the household figure, goals stay household-level.
- [x] T009 `PlanScopeBar` on the Planning hub; hidden for one-person households.
- [x] T010 Hub tests: hidden when solo, Everyone + each person, figures re-scope on click.

## US3 — insights respect the scope (P2)

- [x] T011 `generateInsights` takes an optional trailing scope, projecting before its rules run.
- [x] T012 Tests: household output identical to a no-scope call; person scope reports their share.

## Cross-cutting

- [x] T013 i18n ×5 — "Whose money".
- [x] T014 Golden vectors regenerate with **zero diff** — the proof household scope is a no-op.
- [x] T015 `tsc --noEmit` clean; full suite green.

## Deferred (documented in spec Assumptions)

- Per-person budget limits / goal attribution — need a `person_id` column and a validated
  pooling model.
- Reports helpers operate on pre-aggregated rows; scoping happens in the caller that builds them.

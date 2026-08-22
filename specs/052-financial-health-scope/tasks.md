# Tasks: Financial Health Scope Correction

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Status**: ✅ complete

## US1 — my score reflects my money (P1)

- [x] T001 `FinancialHealthInput.scopedTransactions?` — feeds `monthSpendCents` and `hasHistory`.
- [x] T002 Omitted ⇒ falls back to `transactions`, so spec 041/044 behavior is preserved exactly.
- [x] T003 Regression lock: the existing health suite passes untouched.
- [x] T004 The defect test — two-person household, evenly split expenses → cash flow measured
      against the owner's half, scoring strictly better than the household-total version.
- [x] T005 Symmetry — two members with identical profiles score identically regardless of who
      entered the transactions.
- [x] T006 `FinancialHealthBody` resolves `currentPersonId` → projects → passes both arrays;
      falls back to household scope when the person cannot be resolved.
- [x] T007 `useFinancialProfileForm` scopes identically so the baseline snapshot agrees with
      the widget.

## US2 — household dimensions stay household (P2)

- [x] T008 Test: plan engagement unchanged for a member who created none of the budgets.
- [x] T009 Test: routine awareness keeps its household windowed-spend denominator.

## Cross-cutting

- [x] T010 No migration, no new table, no i18n change — the number simply becomes correct.
- [x] T011 `tsc --noEmit` clean; full suite green.

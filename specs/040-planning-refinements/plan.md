# Plan 040 — Planning refinements

Fully TDD. Keep `cd web && npx tsc --noEmit` and `npm test` green; new copy in all 5 catalogs
(bn/es/ja/zh/ko, English is the key); loss/spend never red.

## US3 — "Left to plan" subtracts unbudgeted spend (contract change)

- **`lib/planning/planSummary.ts`**
  - Add `unbudgetedSpendForMonth(budgets, transactions, monthKey): number` — Σ `expense` `amount_cents`
    in the `monthBounds` window whose `category ∉ { b.category : b.monthly_limit_cents > 0 }`.
  - Extend `PlanHealth` with `unbudgetedSpentCents`; `leftToPlanCents = income − budgeted −
    goalContributions − unbudgetedSpent`.
  - Tests first in `test/planning/planSummary.test.ts`; update the `buildPlanSummary` invariant to
    subtract the new term. Update `specs/038-planning-hub/contracts/plan-summary.md` (done).
- **`components/planning/PlanHealthHero.tsx`** — add a `Spent (unbudgeted)` breakdown term. New i18n
  key `"Spent (unbudgeted)"` in all 5 catalogs. Update `test/web/planning-hub.test.tsx` if it asserts
  the breakdown.

## US2 — Goal contribution breakdown

- **`components/goals/GoalCard.tsx`** — below the status/pace lines, render the `contributions` prop as
  a list (date · amount, note when present), newest-first (sort by `date` desc). Empty → a muted
  "No contributions yet" line. New i18n keys `"No contributions yet"` (+ reuse existing money/date
  formatting). Test in `test/goals/GoalCard.test.tsx`.

## US1 — Routes under /planning

- `git mv web/app/(app)/budgets/page.tsx web/app/(app)/planning/budget/page.tsx`
- `git mv web/app/(app)/goals/page.tsx web/app/(app)/planning/goals/page.tsx`
- Back-link in both: `/settings` → `/planning`, label `t('Settings')` → `t('Planning')`.
- `components/planning/BudgetSummaryCard.tsx` href `/budgets` → `/planning/budget`.
- `components/planning/GoalsSummaryCard.tsx` href `/goals` → `/planning/goals`.
- `components/skeletons/RouteSkeleton.tsx` — match `/planning/goals` and `/planning/budget`.
- Old `/budgets` `/goals` routes removed (grep confirms no other references).

## Verify → ship

- `npx tsc --noEmit`; full `npm test` (incl. i18n catalog-reachability + placeholder-parity guards).
- `/code-review high` → address; `/create-pr`.

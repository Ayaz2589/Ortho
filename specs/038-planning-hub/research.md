# Research: Planning Hub

Two research streams informed this feature: a codebase map (what data/helpers exist) and a
competitive scan (how leading finance apps design planning surfaces).

## Codebase findings (what we build on — no new data)

- **Budgets** are expense-only, three types (`fixed`, `flex`, `non_monthly`), with a derived rollover
  ledger. `lib/finance/budgets.ts` `budgetStatusForMonth(budget, transactions, referenceMonth)`
  returns `{ effectiveLimitCents, spentCents, remainingCents, carriedInCents }` — carry derived from
  history, never stored. `computeRolloverLedger` is golden-vector-locked.
- **Goals** have `target_cents`, nullable `target_date`, `kind` (savings/debt_payoff), manual
  contributions. `lib/finance/goals.ts` `goalProgress(target, contributions)` →
  `{ saved_cents, remaining_cents, fraction, reached }`; `goalPacing(target, targetDate, startISO,
  saved, now)` → `{ off_track, past_due, expected_cents, shortfall_cents, suggested_monthly_cents }`.
  Undated goals are never off-track and have 0 suggested monthly.
- **Income** is `transactions` with `kind === 'income'`, summed over a window (as `NetSummaryHero`
  already does).
- **Month scope**: `useDashboardScope`/`DashboardScopeContext` exist but the `MonthPicker` is bounded
  to `availableMonths` derived from transaction data — **past months only**, so it can't plan ahead.
  Pure month helpers exist: `monthBounds` (vectored), `monthLabel`, `monthReferenceDate`, `stepMonth`.
- **Nav** lives in `components/Sidebar.tsx` (TABS) and `components/TabBar.tsx` (TABS), duplicated.
  Active state via `pathname === href || startsWith(href + '/')`.
- **Current planning**: `app/(app)/settings/planning/page.tsx` links to `/budgets` + `/goals`;
  referenced from `settings/page.tsx` and `SettingsSecondaryNav.tsx`.
- **Reusable component vocabulary**: `BudgetsBody`/`GoalsBody` widget bodies already render exactly
  the bar/pace/label patterns we want (sand near-limit, sage under, never red; `role="progressbar"`).
- **Testing**: Vitest; pure logic in Node, components jsdom-opt-in; inject reference dates; mock the
  store. `test/nav.test.tsx` is the pattern for nav assertions.

**Gating gap:** there is **no recurring/scheduled-transaction** concept — so true cash-flow
forecasting and upcoming-bills timelines are not buildable here and are out of scope.

## Competitive synthesis (design direction)

- **One hero number is universal.** YNAB "Ready to Assign", Copilot "Free to Spend", PocketGuard "In
  My Pocket", Monarch "Left to budget". Trustworthy ones **show the arithmetic** beneath. → our
  "Left to plan" hero with income/budgeted/goals breakdown.
- **Budget health is shown by pace, not just totals.** Copilot's key insight: 60% spent on day 3 is
  "attention" even though under the limit. Progress bar + remaining/over amount in text; traffic-light
  by pace. → our `paceState` + top-at-risk list.
- **Goals model is consistent:** target → date → required monthly, with progress + on/off-track +
  projected completion, behind surfaced first, catch-up amount shown. → maps 1:1 to `goalPacing`.
- **Sinking funds** (non-monthly set-asides) are rare and valuable; we uniquely model `non_monthly`
  with signed carry. → dedicated panel showing carried-in "set aside".
- **Hub = summary cards that link out to detail**, month as the planning unit, calm and ad-free
  (Mint's cautionary tale), progressive disclosure (Monarch's density complaint). → summary hub that
  links to the unchanged Budgets/Goals pages.
- **Deferred (needs new infra):** cash-flow forecast, upcoming bills, long-term what-if modeling.

## Decisions resolved (no open clarifications)

| Question | Decision |
|---|---|
| Hero "budgeted" = base or effective limits? | **Base** monthly allowances (surplus shouldn't reduce "left to plan"); effective used only in the per-category summary. |
| "Planned goal contributions"? | Σ `suggested_monthly_cents` over dated, unreached goals. |
| Are `non_monthly` budgets in the budget summary? | **No** — excluded from pace ranking; shown in the sinking-funds panel instead. |
| Month scope: reuse dashboard picker? | **No** — build a small stepper that allows future months (dashboard picker is past-bounded). |
| Reference date semantics per month? | current → `now`; past → month end; future → month start. |
| Old `/settings/planning` link? | Client redirect to `/planning`. |
| Nav placement / icon? | Insert Planning after Transactions; `Compass` icon (forward-looking). |

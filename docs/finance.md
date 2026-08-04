# finance.md — the pure finance engines

> **Read this when** touching any pure money/date logic: `web/lib/finance/*`, `web/lib/splits.ts`,
> `web/lib/balances.ts`, `web/lib/transactionFilters.ts`, `web/lib/reports/*`,
> `web/components/dashboard/range.ts`, or `web/components/housing/lease.ts`.
>
> Companions: [`shared.md`](./shared.md) (vector harness mechanics), [`web.md`](./web.md) (UI
> consumers), [`supabase.md`](./supabase.md) (schema these shapes mirror), root
> [`../PARITY.md`](../PARITY.md) (web-vs-CLI capability contract). Code and `PARITY.md` outrank
> this doc on disagreement.

All engines are pure TypeScript — no DB, React, network, or side effects — which is what lets them
be pinned by golden vectors (`shared/test-vectors/*.json`, 13 files) asserted by 13
`web/test/*.parity.test.ts` suites. Since spec 021 there is one implementation (web/TS); the
vectors are a single-implementation regression lock, not a cross-language parity check.

## 1. Engine map

| Engine | File | Vector |
|---|---|---|
| Money & currency | `web/lib/finance/money.ts`, `currency.ts` | `currency.json`, `currency-names.json`, `currency-symbols.json` |
| Cents brand | `web/lib/finance/cents.ts` | — (type-level) |
| Budget rollover | `web/lib/finance/budgets.ts` | `budget-rollover.json` |
| Splits | `web/lib/splits.ts` | `transaction-splits.json` |
| Member balances | `web/lib/balances.ts` | `member-balance.json` |
| Transaction filters | `web/lib/transactionFilters.ts` | `transaction-filters.json` |
| Dashboard month scope | `web/components/dashboard/range.ts` | `dashboard-month-scope.json` |
| Mortgage | `web/lib/finance/mortgage.ts` | `mortgage.json` |
| Housing net rental | `web/lib/finance/housing.ts` | `housing-net-rental.json` |
| Lease timing | `web/components/housing/lease.ts` | `lease.json` |
| Insights (8 rules) | `web/lib/finance/insights.ts` + `insights-thresholds.ts` | `insights.json` |
| Goals (rule 9) | `web/lib/finance/goals.ts` + `goals-thresholds.ts` | `goals.json` |
| Reports helpers | `web/lib/reports/{savings,categories,months}.ts` | — (unit tests only) |

Supporting model layer (not engines): `web/lib/categories.ts` (taxonomy), `web/lib/transaction.ts`
(transfer helpers), `web/lib/format.ts` (`parseLocalDate`).

Unvectored pure roll-ups added for the widget dashboard (spec 034), pinned by unit/integrity tests
rather than golden vectors: `web/lib/finance/housing-summary.ts` (§10) and
`web/lib/dashboard/spendHeatmap.ts` (§9).

## 2. The bedrock invariant: integer USD cents

**Every stored monetary value is a whole-cent integer in US dollars.** All `*_cents` fields
(`amount_cents`, `shares` values, `monthly_limit_cents`, `original_loan_cents`,
`target_cents`, …) are integer USD cents. Floats appear only for rates, percents,
`equityFraction`, and render-time display amounts.

- FX conversion is **display-only**, applied at render via `toDisplayAmount`/`formatMoney`. A JPY
  user and a USD user share identical stored rows.
- Per-owner `transaction_shares` **must sum to `amount_cents`**. Since spec 027 this is enforced
  atomically by the `upsert_transaction(p_tx, p_shares)` PL/pgSQL RPC
  (`supabase/migrations/20260718120002_upsert_transaction_atomic.sql`) — both the web store and
  the CLI persist exclusively through it; there is no client-side compensating rollback anymore.
- **Multi-currency is a settled decision, not a gap** (spec `027-multi-currency-strategy`, PR #25):
  Ortho stays USD-accounting-with-display-conversion; a native-currency ledger is deferred and
  research-gated. `web/test/multicurrency-instability.test.ts` pins the known drift with
  `test.fails` cases — if someone builds a native ledger, those flip red and force a revisit.

### `web/lib/finance/cents.ts` (spec 025)

Branded type at money boundaries — opt-in, no mass migration:

- `type Cents = number & { readonly __cents: unique symbol }` — assignable **to** `number`, not
  **from** it.
- `isCents(n)` — `Number.isInteger(n)`. `assertCents(n)` / `toCents(n)` — throw `RangeError` on
  non-integer / NaN / ±Infinity.
- `centsFromDollars(dollars)` — `assertCents(roundHalfAwayFromZero(dollars * 100))`;
  `$12.99 → 1299`, `-$0.005 → -1`; NaN/Infinity throw.

Beyond the vectors, `web/test/finance-goldens.test.ts` (independently-derived expected values) and
`web/test/finance-properties.test.ts` (invariants: shares sum to total, `seedSplit` round-trip,
conversion round-trip) assert truth that a laundered vector regeneration cannot fake.

## 3. Data shapes (`web/lib/types.ts`, mirrors Postgres column-for-column)

- **Transaction**: `kind: 'expense' | 'income' | 'transfer'` (**3 kinds**);
  `category: TransactionCategory` (**40 values** = 39 pickable + non-pickable `transfer`);
  `amount_cents`; `paid_by?` (who paid out); `owner_ids: string[]`;
  `shares: Record<string, number>` (must sum to `amount_cents`); `notes`; `tags?: string[]`
  (tag ids, spec 027).
  - `transfer` = member-to-member reimbursement, never spend or income. `paid_by` = sender (the
    ower paying back), `owner_ids[0]` = recipient. Never a pickable category/budget/filter
    (locked product decision, 2026-07-02 audit).
- **Budget** (spec 027 rollover fields): `category`, `monthly_limit_cents` (base),
  `budget_type: 'fixed' | 'flex' | 'non_monthly'`, `rollover_cap_cents: number | null`
  (flex-only; null = uncapped), `created_at?` (carry anchor).
- **Goal** (spec 027): `kind: 'savings' | 'debt_payoff'` (framing only — one math model),
  `target_cents`, `target_date: string | null` (date-only local; null = undated, no pace),
  `linked_account_id` / `linked_category` (context-only, at most one set, neither drives
  progress), `created_at` (doubles as the pace start reference).
- **Property/MortgageInfo/LeaseInfo/Unit** — housing sub-shapes; `Unit.occupied?` is the explicit
  occupancy flag (spec 020), with tenant-name fallback (§10).

## 4. Money & currency (`money.ts` 118 lines, `currency.ts` 42 lines)

**7 currencies**, fixed order matching the historical iOS enum (`CURRENCIES`):
`usd $` · `cad CA$` · `gbp £` · `eur €` · `jpy ¥` (**0 fraction digits**) · `cny CN¥` · `bdt ৳`
(all others 2 digits). `CURRENCY_NAMES`: gbp is **'UK Pound'** (not "British Pound").
`FALLBACK_RATE_FROM_USD` (when live FX unavailable): usd 1, cad 1.35, gbp 0.78, eur 0.92, jpy 150,
cny 7.2, bdt 110.

- `roundHalfAwayFromZero(x, fractionDigits = 0)` — the canonical money rounding (matches iOS
  `NSDecimalRound(.plain)`). **Never plain `Math.round` on signed money** — it rounds half toward
  +∞ and disagrees on negative exact halves. Used by conversion, `toUSDCents`,
  `centsFromDollars`, `sharePercent`.
- `toDisplayAmount(cents, currency='usd', rate=1)` — `round((cents/100) * rate, fractionDigits)`.
  Always divides by 100; JPY gets no special divisor, only 0-digit rounding.
- `toUSDCents(displayAmount, fromCurrency='usd', rate=1)` — inverse; `rate <= 0` returns 0;
  the `fromCurrency` param is **ignored** (kept for signature symmetry).
- `formatMoney(cents, currency='usd', rate=1, leadingPlus=false, locale='en-US')` — cached
  `Intl.NumberFormat` per `(locale|code|fractionDigits)` (spec 023 P2 perf). Negatives use
  **Unicode minus U+2212**, not ASCII hyphen. Loss/cost is never red (design constitution) — sign
  is conveyed by glyph, not color.

Vector: `currency.json` (7 currencies × 7 cents, `toDisplay` + `toUsdCents`); display **strings**
deliberately unvectored. `currency-names.json` / `currency-symbols.json` pin the tables.

## 5. Budget rollover (`web/lib/finance/budgets.ts`, 157 lines — spec 027, PR #31)

Carry is **derived from history on every render — never stored**; no month-close job. Contract:
`specs/027-budget-rollover/contracts/rollover-math.md`.

- `computeRolloverLedger(config: RolloverConfig, monthlySpendCents: number[]): RolloverMonth[]` —
  recurrence, one row per month: `effectiveLimit = base + carriedIn`;
  `remaining = effective − spent` (may be negative). Carry-out by `BudgetType`:
  - `fixed` — no carry ever; effective ≡ base (pre-027 behavior; migration default).
  - `flex` — surplus-only, overspend forgiven: `carriedOut = min(cap ?? ∞, max(0, remaining))`.
    Cap applies to **accumulated** carry, checked at each carry-out.
  - `non_monthly` — signed, uncapped sinking fund: `carriedOut = remaining` (shortfall carries
    negative).
  `RolloverConfig` also takes `openingCarryCents?` (may be negative).
- `budgetStatusForMonth(budget, transactions, referenceMonth): BudgetStatus` — adapter: anchor =
  budget **creation month** (`created_at`), clamped to never exceed the reference month; absent
  `created_at` ⇒ anchor = reference month (zero carry). Sums `kind==='expense' &&
  category===budget.category` spend into **local-calendar** `YYYY-MM` buckets anchor→reference,
  delegates to `computeRolloverLedger`, returns the last row
  (`{effectiveLimitCents, spentCents, remainingCents, carriedInCents}`). Deliberately unvectored
  (pure reduction over the vectored core).

Vector: `budget-rollover.json` — array of **11 cases** (fixed, flex uncapped/capped, opening carry
incl. negative, non_monthly, empty series). Insights **rule 3 is rollover-aware** (§12).

## 6. Splits (`web/lib/splits.ts`, 149 lines)

`SplitMethod = 'even' | 'percent' | 'value'`. `PERCENT_TOLERANCE = 0.5` (percents accepted at
100 ± 0.5).

- `orderedOwnerIds(ids)` — ascending string sort; the canonical order so the leftover cent lands
  deterministically (lexically-first owner). `computeShares` itself is **order-sensitive by
  design — callers must canonicalize first**. Both the app and the CLI do (CLI via
  `toTransaction`; defect A4 verified fixed 2026-07-18, see `PARITY.md`).
- `computeShares(amountCents, owners, split)` — n===1 gets everything; `value` returns entered
  cents verbatim (caller must `validateSplit` first); even/percent floor each target (IEEE-754
  doubles), then hand leftover cents out one-per-owner in list order, wrapping.
  **Negative-leftover reclaim**: percents up to 100.5 can over-allocate; excess is taken back one
  cent per owner in list order, skipping owners at zero. Result always sums to `amountCents`.
- `validateSplit` — `{ok:true} | {ok:false, reason: 'percent_sum'|'value_sum'|'no_owners'}`;
  values must sum **exactly**; percents within tolerance.
- `sharePercent(shareCents, amountCents)` — display %; rounds half **away from zero** (Swift
  `.rounded()` parity on negative halves); 0 when amount is 0.
- `seedSplit(amountCents, owners, storedCents)` — lossless editor round-trip:
  `{method:'even'}` when stored equals an even split, else `{method:'value', values}`. Invariant:
  `computeShares(amount, owners, seed) === storedCents`.
- `evenShares` — convenience.

Vector: `transaction-splits.json` — sections `{cases: 13, validations: 4, seeds: 6, ownerOrdering: 5}`.

## 7. Member balances (`web/lib/balances.ts`, 39 lines) + `transaction.ts`

`balanceBetween(viewer, other, transactions)` → net cents from the viewer's perspective
(positive ⇒ other owes viewer). Integer cents, no rounding:

- Expense with `paid_by`: payer===viewer ⇒ `+ shares[other]`; payer===other ⇒ `− shares[viewer]`;
  else ignored (payer's own share is owed by nobody).
- Transfer via `transferParties(tx)` (`web/lib/transaction.ts`): `from = paid_by`,
  `to = owner_ids[0]`; other→viewer ⇒ `− amount_cents`; viewer→other ⇒ `+ amount_cents`.

Expenses accrue debt, transfers settle it. `isTransfer(tx)` = `kind === 'transfer'`. Vector:
`member-balance.json` (9 cases).

## 8. Transaction filters (`web/lib/transactionFilters.ts`, 107 lines — incl. spec-027 tags, PR #32)

`filterTransactions(txs, criteria, ctx)` — **OR within a dimension, AND across dimensions**;
original order preserved. `FilterCriteria` dimensions:

| Dimension | Rule |
|---|---|
| `query` | trimmed, lowercase-substring over merchant, source, category, **notes**, owner names (`ctx.ownerNames`), **tag names** (`ctx.tagNames`) |
| `categories[]` | tx category ∈ set |
| `kind` | `'all'` or exact `expense`/`income`/`transfer` |
| `sources[]` | tx source ∈ set |
| `owners[]` | tx has ≥1 owner in set |
| `tags[]` | tag **ids**; `tx.tags ?? []` must intersect |
| `dateFrom`/`dateTo` | half-open `[from, to)` |

The `source` string / `sources[]` filter now reflects the user's configured **deposit accounts**
(spec 033) — the hardcoded `INCOME_SOURCES` list is gone; the income "Deposit to" dropdown is
driven by the household-scoped `deposit_accounts` table (model layer in `store.tsx`, see
[`web.md`](./web.md)/[`supabase.md`](./supabase.md)). `transactions.source` still stores the chosen
name, so no finance engine changed.

`FilterContext.tagNames` is **optional** — the Makefile ingest CLI has no tag roster, so tag-name
search is a no-op there (tag-id filtering still works). Helpers: `emptyCriteria()` (carries
`tags: []`), `activeFilterCount` (7 dimensions; the date pair counts once), `availableSources`
(distinct, trimmed, `localeCompare`-alphabetized — UI-only, unvectored sort),
`monthBounds('YYYY-MM')` → **UTC half-open** month window, throws `INVALID_MONTH`.

Vector: `transaction-filters.json` (22 cases incl. tag OR/AND/absent and notes/tag-name search).

## 9. Dashboard month scope (`web/components/dashboard/range.ts`, 173 lines)

- `DashboardRange = thisMonth | last3Months | last6Months | last12Months` → `monthCount`
  1/3/6/12; labels "Month/3M/6M/1Y".
- `rangeInterval(r, now)` — local-calendar `[first-of-start-month, first-of-next-month)`.
  **Not vectored** (pure calendar math).
- Vectored quartet (`dashboard-month-scope.json`): `availableMonths(txs)` — distinct
  `date.slice(0, 7)` keys (**string slice, not a local re-bucket**), newest-first;
  `availableRanges(txs, now)` — a range is offered when months-back to the earliest tx ≥
  `monthCount − 1` (`thisMonth` always); `monthReferenceDate('YYYY-MM')` — the 15th at 12:00
  **UTC** (regex-validated, throws `INVALID_MONTH`); `stepMonth(months, current, 'prev'|'next')`
  — null at the data edge.
- `monthInsightReference('YYYY-MM', now)` — **not** the mid-month heuristic: `now` for the current
  month, else the month's **last day at local noon** (fully elapsed, so `monthProgress` ≈ 1 and
  the under-budget rule — needs ≥ 0.7 — can fire for past months). Local, not UTC, so UTC+12/+13
  viewers don't scope the next month (spec 023 B2). Unvectored.

### Spend heatmap — `web/lib/dashboard/spendHeatmap.ts` (spec 034)

`buildSpendHeatmap(transactions, interval)` — pure/deterministic; enumerates every calendar day in
the `[interval.start, interval.end)` scope window and sums **expense** cents per **local-calendar**
day (`income` and `transfer` excluded — this is a spending heatmap). `level: 0..4` is **relative to
the busiest day** in the window (0 for a no-spend day, else 1–4 by quartile of the max), so the ramp
always uses its full range regardless of absolute spend; the render layer maps levels → token tints
(never red). **Unvectored.**

## 10. Mortgage & housing

### `web/lib/finance/mortgage.ts` (234 lines)

`M = P·r(1+r)^n / ((1+r)^n − 1)`; P/M in cents; `r = annualRatePercent/100/12`; `n = termYears*12`.

- `PAID_OFF_THRESHOLD_CENTS = 500` — balances ≤ $5 display as paid off (FP amortization drift);
  display-layer only, the balance math clamps at 0.
- `monthlyPaymentCents(P, rate, years)` — `Math.round`; zero-rate ⇒ `round(P/n)`.
- `monthsElapsed(closing, asOf, totalMonths)` — day-aware whole months, clamped
  `0..totalMonths`; the closing **day is clamped to the asOf month's length** so a Jan-31 closing
  reaches its monthiversary on Feb 28 (Swift `Calendar.dateComponents([.month])` parity).
- `currentPrincipalBalanceCents(...)` — recurrence with the **rounded** payment:
  `B(k) = P(1+r)^k − M((1+r)^k − 1)/r`, `max(0, round(...))`; zero-rate `max(0, P − M·k)`.
- `currentEquityCents(purchasePriceCents, ...)` — `max(0, purchasePrice − balance)` (purchase
  price, not market value). `equityFraction` — clamped 0..1; 0 when purchase price is 0.
- `maturityDate(closing, years)` — local `setMonth(+years*12)`. `yearsRemaining` — day-aware whole
  years, floor 0.
- `upcomingAmortization(months, ...)` → `{month, principalCents, interestCents}[]` — mirrors the
  frozen Swift: works in **dollars** (floats), no early break; label dates advance by calendar
  month with the day clamped to target-month length (fixed the Jan-31 → Mar-3 overflow; values
  are label-date-independent, so vectors stayed green).

Dates parse via `parseLocalDate`. Vector: `mortgage.json` (8 cases incl. zero-interest and
day-29–31 month-end closings).

### `web/lib/finance/housing.ts` (47 lines)

Single source of truth for net rental on Dashboard **and** property detail.

- `isUnitOccupied(tenantName)` — non-blank trimmed name (spec 019). `occupiedRentCents(units)` —
  occupied only; vacant units contribute 0. `netRentalCents(units, mortgagePaymentCents)` —
  occupied rent − payment; **may be negative**; pass 0 for a paid-off property.
- `rentUnitsFrom(units)` — `occupied ?? isUnitOccupied(tenant_name)`: an explicit `false`
  (deliberately vacant) survives; only `undefined` falls back (spec 020, migration
  `20260707120000_unit_occupied`).

Vector: `housing-net-rental.json` (6 cases; occupancy pre-resolved to a boolean).

### `web/lib/finance/housing-summary.ts` (56 lines — spec 034)

`housingSummary(properties)` — household-wide pure roll-up across every property, returning
`{cost, equity, netRental, multi, count}` in integer cents. Monthly `cost` = each mortgage's
`monthlyPaymentCents` plus any `lease.monthly_rent_cents`; `equity` = principal paid down
(`original_loan_cents − balance`, balance clamped to 0 below `PAID_OFF_THRESHOLD_CENTS`);
`netRental` sums `netRentalCents(rentUnitsFrom(units), pay)` for **multifamily** properties —
**not gated on having a mortgage** (a paid-off multifamily still earns its unit rents, `pay = 0`).
Extracted from the desktop dashboard composition when it moved to the widget framework so the math
outlives any one screen. **Unvectored** — pinned by `web/test/store.integrity.test.tsx`.

### Lease timing — `web/components/housing/lease.ts` (66 lines; NOT under `lib/finance/`)

- `rentDueDay(lease)` — day-of-month from `lease_start` via `parseLocalDate`.
- `daysUntilNextRent(lease, asOf)` — never negative; rolls past the due day; **due day clamped to
  month length** (31 → Jun 30 / Feb 28).
- `daysUntilEnd(lease, asOf)` — signed. `isRenewalSoon(lease, asOf)` — `0 ≤ daysUntilEnd ≤ 60`
  (inline constant 60).
- `nextRentCaption` / `rentDueCaption` — display strings, unvectored.

Vector: `lease.json` (6 cases, injected `asOf`).

## 11. Insights (`web/lib/finance/insights.ts` 399 lines + `insights-thresholds.ts` 63 lines)

`generateInsights(transactions, budgets, properties, now=new Date(), limit=6, tr, locale)` →
`Insight[]` sorted by the exported `compareInsights` (severity asc `{critical:0, warning:1,
info:2, positive:3}`, tie magnitude desc), sliced to `limit`. Currency-agnostic engine; bodies
render USD 2-dp via a cached en-US formatter; `tr` defaults to an interpolating identity so
vectors stay canonical English.

**8 base rules** (all thresholds are named constants in `INSIGHT_THRESHOLDS`):

| # | Rule | Fires when | Severity | id |
|---|---|---|---|---|
| 1 | Top category | largest this-month expense category, >0 | info | `top-category-<cat>-<YYYY-MM>` |
| 2 | MoM category delta | both months ≥ `momMinCents` 2000 and \|Δ\| ≥ `momDeltaFloor` 0.25 | warning up / positive down | `mom-<cat>-<YYYY-MM>` |
| 3 | Budget status — **rollover-aware since 027**: fraction = spent / `effectiveLimitCents` from `budgetStatusForMonth` (byte-identical pre-027 for `fixed`) | ≥ `budgetOverFraction` 1.0 over; ≥ `budgetNearFraction` 0.85 near; ≤ `budgetUnderFraction` 0.5 **and** monthProgress ≥ `budgetUnderProgress` 0.7 under | critical / warning / positive | `budget-{over,near,under}-<cat>-<YYYY-MM>` |
| 4 | Cashflow / savings rate | net < 0 deficit; else net/income ≥ `savingsRateFloor` 0.2 saving | critical / positive | `cashflow-{deficit,savings}-<YYYY-MM>` |
| 5 | Recurring subscriptions | trailing `recurringWindowMonths` 6; ≥ `recurringMinCount` 3 charges per merchant (trimmed-lowercase key); ≥ `recurringHitRatio` 0.8 of gaps in [28, 35] days | info | `recurring-<YYYY-MM>` |
| 6 | Outlier transaction | category median needs ≥ `outlierMedianMinCount` 5 trailing txs; charge ≥ `outlierMultiple` 2.0× median; largest wins | warning if ≥ `outlierWarnCents` 50000, else info | `outlier-<txId>` |
| 7 | 30-day trend | prior-30 ≥ `trendMinPriorCents` 10000, \|Δ\| ≥ `trendDeltaFloor` 0.2 (`trendWindowDays` 30) | warning up / positive down | `trend30-<YYYY-MM>` |
| 8 | Mortgage affordability | first property with mortgage + income > 0; ratio = payment/income | < `mortgageComfortableRatio` 0.28 positive; ≤ `mortgageHighRatio` 0.35 info; else warning | `mortgage-ratio-<YYYY-MM>` |

**Rule 9 lives in `goals.ts`** (§12): goal off-track → `goal-offtrack-<goalId>`, always `warning`
(never critical/red). Consumers merge `goalInsights` output with `generateInsights` via
`compareInsights`, then slice.

Subtleties:

- **Two date-parse regimes inside one file**: month-bucketed rules 1–4 parse date-only strings as
  **local** midnight (west-of-UTC month-boundary fix, documented at `insights.ts:33-42`);
  trailing-window rules 5–7 use raw `new Date(t.date)`.
- Rule 5: average = `Math.trunc(sum/count)` (iOS Int64 division); display casing from the **most
  recent** transaction; sort avg desc, ties by lowercase **code-unit** compare (NOT
  `localeCompare`); `preview_merchants` = top 3 (vectored — the only rule with one).
- **Insight ids are part of the contract** (vectors README) — a changed id is a real divergence.

Vector: `insights.json` (12 scenarios; `{id, severity, category, magnitude_cents,
preview_merchants}` pinned; body strings not).

## 12. Goals (`web/lib/finance/goals.ts` 203 lines + `goals-thresholds.ts` 14 lines — spec 027, PR #29)

Pure/deterministic, `now` injected. Progress is **contribution-driven** (sum of
`goal_contributions`; bank balances never synced — spec 024 is connect-only). Savings and
debt-payoff share one model; `GoalKind` is framing only.

- `goalProgress(targetCents, contributions)` — `saved_cents` exact sum;
  `remaining = max(0, target − saved)`; `fraction = clamp01(saved/target)` (0 when target ≤ 0);
  `reached = target > 0 && saved ≥ target`.
- `goalPacing(targetCents, targetDate, startISO, savedCents, now)` — undated ⇒ all-zeros, never
  off-track. Day math via `dayIndex` (local getters → UTC epoch-day, timezone-stable).
  `expected = round(target × clamp01(elapsed/span))`; span ≤ 0 ⇒ expectedFraction 1.
  `past_due = nowIdx ≥ targetIdx`. `shortfall = max(0, expected − saved)`.
  `suggested_monthly_cents` = 0 if reached; = remaining if past due; else
  `ceil(remaining / monthsLeft)` with `monthsLeft = max(1, ceil(daysLeft / 30))`
  (`daysPerMonth: 30`). **Off-track**: reached ⇒ false; past-due unreached ⇒ true; else
  `shortfall ≥ max(1 cent, round(target × 0.05))` (`offTrackToleranceFraction: 0.05`; 1-cent
  floor kills rounding wobble).
- `goalOffTrackInsight(goal, contributions, now, tr?, locale?)` → `Insight | null` — pace start =
  `goal.created_at`; `category = linked_category ?? null`; magnitude = shortfall; severity always
  `warning`.
- `contributionsByGoal(contributions)`; `goalInsights(goals, byGoalId, now, ...)` — sorted by
  `compareInsights`, **not sliced** (callers merge then slice).

Vector: `goals.json` (7 progress + 7 pacing cases, injected `now`; insight strings unvectored).

## 13. Reports helpers (`web/lib/reports/` — spec 027 reports-mvp, PR #30)

Deliberately **unvectored** (unit tests only; documented policy in `PARITY.md`). Inputs come from
`web/lib/api/aggregates.ts` types (`MonthSummary`, `CategoryTotalRow`).

- `savings.ts`: `savingsRate(incomeCents, expenseCents)` — `(income − expense)/income`; **null
  when income ≤ 0** (rendered "—", never NaN/Infinity/0%). `buildSavingsSeries(windows,
  summaries)` — zips index-wise; a missing summary defaults `{0,0,0}` so no-activity months get a
  neutral row (no silent gaps).
- `categories.ts`: `rankCategories(rows)` — drop `cents <= 0`, sort desc, `share = cents/total`
  in [0,1]; `[]` for empty/all-zero.
- `months.ts`: `monthsInInterval({start, end})` → contiguous non-overlapping **local-calendar**
  `MonthWindow[]` (`{yyyymm, start, end}`), oldest→newest — needed because the
  `household_month_summary` RPC aggregates a whole window.

## 14. Categories & severity (`web/lib/categories.ts`, 224 lines)

- **3 kinds**, **40 categories** total: 39 `PICKABLE_CATEGORIES` + non-pickable `transfer`.
  Expense subcategories (29) organized in 8 groups via `CATEGORY_GROUPS.expense`; income
  subcategories (10) in 3 groups via `CATEGORY_GROUPS.income`. `SPEND_CATEGORIES` = 29 (all
  expense slugs derived from `CATEGORY_GROUPS.expense`). `INCOME_CATEGORIES` = 10 (all income
  slugs). Adding a category requires the Postgres enum migration (`ALTER TYPE transaction_category
  ADD VALUE IF NOT EXISTS`) **and** `PICKABLE_CATEGORIES` (in `web/lib/types.ts`) **and** a
  `CATEGORIES` entry with `parent: CategoryGroupKey` **and** adding it to `CATEGORY_GROUPS`.

  | Group | Children |
  |-------|---------|
  | Food & Drink | coffee, groceries, dining, fast_food, alcohol, takeout |
  | Transport | transit, fuel, parking, rideshare |
  | Home | rent, utilities, home_improvement, insurance |
  | Health & Wellness | health, gym, pharmacy, mental_health |
  | Entertainment | entertainment, streaming, gaming, events |
  | Shopping | clothing, electronics, personal_care, gifts |
  | Subscriptions | subs |
  | Education | education, books |
  | Employment & Business (income) | salary, bonus, freelance, business_income |
  | Investment & Assets (income) | dividends, rental_income |
  | Other Income | gift_received, refund, other_income, income |

- `CATEGORIES` — label / lucide icon / tint / parent per category (tints ported from iOS).
- `SEVERITY_ORDER` / `severityColor` — severity → sort rank / CSS token (`--destructive`,
  `--accent`, `--positive`, `--text-2`). `SEVERITY_ORDER` is defined twice with identical values
  (`categories.ts` for UI, `insights.ts` for sorting) — treat `insights.ts` as canonical for
  ordering.
- `PALETTE` (6 member colors), `paletteFor`, `deriveInitial` ("A & B" → "A+B").

## 15. Cross-cutting conventions

- **Integer USD cents** everywhere (§2); floats only for rates/percents/fractions/display.
- **Round half away from zero** on signed money — never bare `Math.round`.
- **Date regimes (the classic west-of-UTC bug lives here)**:
  1. Date-only strings via `parseLocalDate` (`web/lib/format.ts`) = **local** midnight — housing
     dates, lease dates, goals, insights month rules 1–4. Never `new Date('YYYY-MM-DD')` on these
     (that parses UTC midnight and shifts a day west of UTC).
  2. Raw `new Date(t.date)` — insights trailing-window rules 5–7, filter date comparisons.
  3. **UTC half-open** windows — `monthBounds`; `monthReferenceDate` is 15th noon UTC.
  4. `availableMonths` is a raw string slice, no parsing at all.
  Any new date logic must pick a regime explicitly.
- **`monthReferenceDate` (vectored, 15th noon UTC) vs `monthInsightReference` (unvectored, last
  day local noon)** — different consumers; do not conflate.
- Owner ids are lowercase UUID strings; the leftover cent follows canonical sorted order (§6).
- `Intl` formatters are cached by output-affecting inputs (money/insights/format modules,
  spec 023 P2) — byte-identical output, built once.

## 16. Pinning & the CLI boundary

Workflow after any pure-logic change: edit TS → `cd web && npm run gen:vectors` → review the JSON
diff → `npm test` → reconcile `PARITY.md` if a documented capability changed. CI (`web-ci.yml`)
regenerates vectors and fails on a dirty diff. Because expected values come from the same TS,
regenerating after an *unintended* change launders the bug — treat every vector diff as a behavior
diff; never hand-edit the JSONs. The goldens/properties suites (§2) are the launder-proof tier.
Full harness mechanics: [`shared.md`](./shared.md).

Deliberately unvectored: `cents.ts`, `reports/*`, `rangeInterval`, `monthInsightReference`,
`budgetStatusForMonth`, `goalOffTrackInsight` bodies, all display strings, `formatMoney` output.

The CLI (`web/scripts/import/`, root `Makefile` targets) reuses `computeShares` /
`orderedOwnerIds` / `filterTransactions` / `lib/types` in-process and persists through the same
`upsert_transaction` RPC, but its parsing/dedupe/categorization around them is unvectored — see
`PARITY.md` for live divergences (`--admin` RLS bypass by design; `created_by`-scoped dedupe; no
`tagNames` context). `web/lib/aggregation.ts` (Plaid connect, spec 024) is a bank-connection
capability, not a finance engine — no vector.

## 17. Gotchas checklist

- No `Math.round` on signed money — `roundHalfAwayFromZero`.
- No `new Date('YYYY-MM-DD')` on housing/goal dates — `parseLocalDate`.
- Canonicalize owners with `orderedOwnerIds` before `computeShares` for storage.
- A `transfer` is a reimbursement — use `transferParties`, never treat as spend/income.
- Vacant-unit rent is not income; explicit `occupied: false` must survive `rentUnitsFrom`.
- Rule 3 compares against `effectiveLimitCents`, not raw `monthly_limit_cents`.
- Budget carry anchor is `created_at`; goal pace start is `created_at`.
- Goal insights are always `warning` — never critical/red (design constitution).
- `toUSDCents` ignores `fromCurrency` and returns 0 on `rate <= 0`.
- Lease engine is in `web/components/housing/lease.ts`, not `lib/finance/`.
- Rule-5 tie-break is code-unit compare; `availableSources` uses `localeCompare` — inconsistent
  by design (only the former is vectored).
- Keep `TZ=UTC` pinned in `gen-vectors.ts` and `vitest.config.ts`.
- Don't rubber-stamp a regenerated vector diff — it can launder a bug.

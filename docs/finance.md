# finance.md — Ortho's financial models

> Deep-dive on the pure financial/business logic that powers Ortho: the money
> invariant, every calculation engine, the data shapes they operate on, the
> rounding/timezone conventions that keep them deterministic, and the regression
> harness that pins them. Read this before touching anything under
> `web/lib/finance/*`, `web/lib/splits.ts`, `web/lib/balances.ts`,
> `web/lib/transactionFilters.ts`, `web/components/dashboard/range.ts`, or
> `web/components/housing/lease.ts`.
>
> **Companion docs:** [`shared.md`](./shared.md) (the vector harness mechanics),
> [`web.md`](./web.md) (where these engines are consumed in the UI),
> [`supabase.md`](./supabase.md) (the Postgres schema these shapes mirror), and
> the root [`PARITY.md`](../PARITY.md) (the audited capability contract). Source
> code and `PARITY.md` outrank this doc if they ever disagree.

---

## 1. What "financial models" means here

Ortho's finance logic is **pure TypeScript**: functions that take plain data in
and return numbers/objects out, with no database, no React, no network, and no
side effects. That purity is deliberate — it is what lets every engine be pinned
by **regression vectors** (`shared/test-vectors/*.json`) and asserted in CI
(`web/test/*.parity.test.ts`). Historically these functions were mirrored in
Swift and the vectors kept the two languages honest; since spec 021 there is one
implementation (web/TS) and the vectors are an ordinary single-implementation
regression lock (see [`shared.md`](./shared.md)).

The engines, at a glance:

| Engine | File | Vector file | What it computes |
|---|---|---|---|
| Money & currency | `web/lib/finance/money.ts`, `currency.ts` | `currency.json`, `currency-names.json`, `currency-symbols.json` | cents ⇄ display amount, formatting, FX |
| Splits | `web/lib/splits.ts` | `transaction-splits.json` | per-owner cents division of a transaction |
| Member balances | `web/lib/balances.ts` | `member-balance.json` | net cents owed between two people (settle-up) |
| Transaction filters | `web/lib/transactionFilters.ts` | `transaction-filters.json` | multi-dimension ledger filtering + month windows |
| Dashboard month scope | `web/components/dashboard/range.ts` | `dashboard-month-scope.json` | available months/ranges, month stepping |
| Mortgage | `web/lib/finance/mortgage.ts` | `mortgage.json` | payment, balance, equity, maturity, amortization |
| Housing net rental | `web/lib/finance/housing.ts` | `housing-net-rental.json` | occupied-unit rent − mortgage payment |
| Lease timing | `web/components/housing/lease.ts` | `lease.json` | rent-due day, days-until countdowns |
| Insights | `web/lib/finance/insights.ts` | `insights.json` | 8 dashboard insight rules |

Supporting (not independent engines, but part of the model layer): category /
severity metadata (`web/lib/categories.ts`), transaction/transfer helpers
(`web/lib/transaction.ts`), and date/formatting helpers (`web/lib/format.ts`).

---

## 2. The bedrock invariant: integer USD cents

**Every monetary value in Ortho is a whole-cent integer in US dollars.** This is
not a convention layered on top — it is the single assumption every engine is
built around.

- Stored fields are always cents: `amount_cents`, per-owner `shares` values,
  `monthly_limit_cents`, `original_loan_cents`, `purchase_price_cents`,
  `monthly_rent_cents`, `security_deposit_cents`, `magnitude_cents`.
- Money is **never** stored in a display currency and **never** stored as a
  float. Floats appear only for rates, percentages, `equityFraction`, and the
  final display amount produced at render time.
- Conversion to what the user sees happens **only at render time** via
  `toDisplayAmount` / `formatMoney`. A JPY user and a USD user share the exact
  same stored rows; only the render differs.

Why it matters: exact integer math means splits always sum back to the total,
balances net to the cent, and two clients (web + the Capacitor iOS shell, which
is the same bundle) can never disagree by a rounding cent. The invariant is
enforced by **clients, not SQL** — per-owner `transaction_shares` must sum to
`amount_cents`, and it is the write path's job to keep that true (web compensates
with a rollback on the two-step parent+shares write; the CLI does not — see
§11 and `PARITY.md`).

---

## 3. Data shapes the engines operate on

All defined in `web/lib/types.ts`, mirroring the Postgres schema column-for-column.

### Transaction — the hub

```ts
interface Transaction {
  id, household_id, merchant, source, date, created_by, created_at, updated_at
  category: TransactionCategory       // 11 pickable + 'transfer'
  kind: 'expense' | 'income' | 'transfer'
  amount_cents: number                // integer USD cents
  paid_by?: string | null             // person who paid the money OUT
  owner_ids: string[]                 // people who own/share the row (ordered)
  shares: Record<string, number>      // per-owner cents; MUST sum to amount_cents
}
```

Three `kind`s, and the third is the clever one:

- **`expense`** — money spent. `paid_by` = who fronted it; `shares` = who owes
  what portion.
- **`income`** — money in. No payer semantics.
- **`transfer`** — a **member-to-member reimbursement** (settle-up), *not* spend
  or income. `paid_by` = the sender (the ower paying back); `owner_ids[0]` = the
  recipient (the member being reimbursed); `amount_cents` = the amount moved.
  This single reuse is what makes settle-up balances net out (§6).

`transfer` is also a `category` value, but it is **deliberately not** in
`PICKABLE_CATEGORIES` — Reimbursement can never be chosen as a spend category,
budget, or filter (locked product decision). The `TransactionCategory` union is
derived from the pickable list so a new category can't reach the type without
reaching every picker.

### Property, Mortgage, Lease, Unit

```ts
interface Property { kind: 'primary_home'|'multifamily'|'rental'; mortgage?; lease?; units? }
interface MortgageInfo { purchase_price_cents, original_loan_cents,
                         annual_interest_rate_percent, loan_term_years, closing_date }
interface LeaseInfo   { monthly_rent_cents, lease_start, lease_end, security_deposit_cents? }
interface Unit        { monthly_rent_cents, tenant_name, occupied? }
```

`Property` composes the housing sub-shapes; the mortgage and housing engines read
straight off them. `occupied` is the newer explicit occupancy flag (spec 020);
where absent, occupancy falls back to "has a non-blank tenant name."

### Budget & Insight

```ts
interface Budget  { category: TransactionCategory; monthly_limit_cents: number }
interface Insight { id, title, body, severity, icon, category, magnitude_cents, preview_merchants? }
```

`Budget` feeds insight rule 3; `Insight` is the output shape of the insights
engine (§10).

---

## 4. Money & currency (`finance/money.ts`, `finance/currency.ts`)

The conversion and formatting layer sitting on top of the cents invariant.

### Supported currencies

Seven, in a fixed order (matching the historical iOS enum):

```
usd  $     2 digits      cad  CA$   2      gbp  £    2      eur  €    2
jpy  ¥     0 digits      cny  CN¥   2      bdt  ৳    2
```

`CURRENCY_CONFIG` (in `money.ts`) holds code + symbol + `fractionDigits`.
`currency.ts` adds display names (`CURRENCY_NAMES`) and fallback FX rates
(`FALLBACK_RATE_FROM_USD`, used when live FX is unavailable): CAD 1.35, GBP 0.78,
EUR 0.92, JPY 150, CNY 7.2, BDT 110 (all expressed as "1 USD = N units").

### The rounding rule — half away from zero

```ts
roundHalfAwayFromZero(x, fractionDigits = 0)
  = sign(x) * Math.round(abs(x) * 10^d) / 10^d
```

This is **not** `Math.round`. Plain `Math.round` rounds half toward +∞, which
disagreed with the historical iOS `NSDecimalRound(.plain)` on negative exact-half
ties. The explicit "away from zero" rule keeps every conversion tie identical
regardless of sign, and is locked by `currency.json`. The same rounding choice
recurs in `sharePercent` (splits) for the same reason.

### The three conversion functions

- **`toDisplayAmount(cents, currency, rate)`** → number. Divides cents by 100,
  applies `rate`, rounds to the currency's fraction digits. Because storage is
  *always* USD cents, it always divides by 100 — a zero-fraction currency (JPY)
  renders at the correct magnitude with no special-case divisor.
- **`toUSDCents(displayAmount, fromCurrency, rate)`** → cents. The inverse, for
  user input. Guards `rate <= 0` by returning 0 (no meaningful inverse — matches
  iOS `guard rate > 0`), so a bad rate yields 0 rather than Infinity/negative.
- **`formatMoney(cents, currency, rate, leadingPlus, locale)`** → string. Uses
  `Intl.NumberFormat`. Two design-mandated details:
  - **Negatives use a Unicode minus (U+2212 "−")**, not ASCII hyphen.
  - **Loss/cost is never red** — a constitutional design rule; sign is conveyed
    by the minus glyph and (optionally) a leading `+` on positives, not color.

**Performance note (spec 023):** constructing an `Intl.NumberFormat` is one of
the heaviest routine JS ops and `formatMoney` runs per ledger row (hundreds per
render). Formatters are cached in a `Map` keyed by `(locale, code,
fractionDigits)` — the only inputs that affect output — so output is
byte-identical while the formatter is built once. `insights.ts` and `format.ts`
apply the same caching pattern for their fixed-option formatters.

---

## 5. Splits (`splits.ts`)

How one transaction's `amount_cents` divides among its owners. Three methods:
**`even`**, **`percent`** (weights that total 100 ± tolerance), **`value`**
(exact cents per owner).

### Canonical owner order — the leftover-cent contract

```ts
orderedOwnerIds(ids) = [...ids].sort()   // ascending string sort
```

The single most important invariant in the split engine: leftover cents from
flooring go **one per owner, in canonical (sorted) owner order**. So the same
person always absorbs the rounding remainder regardless of the order owners were
entered or stored in. Both the app and the CLI canonicalize through
`orderedOwnerIds` before computing shares for storage, so the leftover cent lands
identically everywhere. Locked by the `ownerOrdering` cases in
`transaction-splits.json` (which feed deliberately scrambled owner lists).

### `computeShares(amountCents, owners, split)` → `Record<owner, cents>`

- `owners.length === 1` → that owner gets the whole amount.
- **`value`** → returns the entered cents verbatim (caller must `validateSplit`
  first).
- **`even` / `percent`** → floor each owner's target
  (`amountCents / n` for even; `amountCents * pct / 100` for percent), sum the
  bases, then **distribute the leftover one cent per owner in list order**,
  wrapping if needed. The result always sums to `amountCents`.
- **Over-allocation guard:** because entered percents may legally total up to
  `100 + PERCENT_TOLERANCE`, the floored bases can sum to *more* than the amount
  (a negative leftover). The engine reclaims the excess one cent per owner in
  list order, **skipping owners already at zero** so no share goes negative. This
  is a no-op for even splits and percents ≤ 100, so the vectors are unchanged.

### Save-gate and helpers

- **`validateSplit`** — the gate before persisting. `even` always ok; `percent`
  must total 100 ± `PERCENT_TOLERANCE` (0.5); `value` must total the amount
  **exactly**; empty owners → `no_owners`.
- **`evenShares`** — convenience wrapper for the common default.
- **`sharePercent(shareCents, amountCents)`** — derived display percentage,
  rounded **half away from zero** (matches Swift `.rounded()`; plain `Math.round`
  disagreed on negative exact-half percents). 0 when the amount is 0.
- **`seedSplit(amountCents, owners, storedCents)`** — reconstructs the split-
  editor seed from an existing transaction's stored cents so **editing round-trips
  losslessly**. Returns `{method:'even'}` when the stored shares already equal an
  even split (editor keeps its even default); otherwise `{method:'value', values}`
  with the exact stored cents. Invariant:
  `computeShares(amount, owners, seedSplit(...)) === storedCents`.

---

## 6. Member balances / settle-up (`balances.ts`)

`balanceBetween(viewer, other, transactions)` → net cents owed between two
household members, **from the viewer's perspective**:

- **positive** ⇒ `other` owes `viewer`
- **negative** ⇒ `viewer` owes `other`
- **0** ⇒ settled

The rules, applied per transaction, integer cents, no rounding:

- **Expense with a payer:** every owner who is *not* the payer owes the payer that
  owner's share.
  - if `viewer` paid → `other` owes their share → `net += shares[other]`
  - if `other` paid → `viewer` owes their share → `net -= shares[viewer]`
  - the payer's own share is owed by nobody (only the other party's share is read).
- **Transfer (reimbursement):** parties come from `transferParties(tx)` in
  `web/lib/transaction.ts` — `from = paid_by` (sender/ower), `to = owner_ids[0]`
  (recipient). A payment `other → viewer` reduces what `other` owes
  (`net -= amount_cents`); `viewer → other` reduces what `viewer` owes, i.e.
  raises the net (`net += amount_cents`).

So expenses *accrue* debt and transfers *settle* it, all netting into one signed
figure. Locked by `member-balance.json`. `isTransfer` / `transferParties`
(`web/lib/transaction.ts`) centralize the transfer shape so no call site
hand-indexes `paid_by` / `owner_ids[0]` again (spec 023).

---

## 7. Transaction filters (`transactionFilters.ts`)

`filterTransactions(txs, criteria, ctx)` → the subset passing **all** dimensions,
original order preserved. The dimensions (`FilterCriteria`):

| Dimension | Rule |
|---|---|
| `query` | case-insensitive substring over merchant, source, category, **and owner display names** (via `ctx.ownerNames`) |
| `categories[]` | OR within — tx category ∈ the selected set |
| `kind` | `'all'` or exact match on `expense`/`income`/`transfer` |
| `sources[]` | OR within — tx source ∈ the selected set |
| `owners[]` | OR within — tx has at least one owner in the selected set |
| `dateFrom`/`dateTo` | half-open window `[from, to)` — `date >= from && date < to` |

**AND across dimensions, OR within a multi-select** is the core semantic. Empty
`query` matches everything; an empty multi-select array means "no constraint on
this dimension."

Helpers:

- **`activeFilterCount`** — count of non-default dimensions, for the "N filters
  active" badge.
- **`availableSources`** — distinct non-empty sources, alphabetized.
- **`monthBounds("YYYY-MM")`** → `{ dateFrom, dateTo }` as **half-open UTC month
  windows** (`…-01T00:00:00.000Z` to the first of the next month). Timezone-stable
  by construction — this is the model behind month-scoped ledger views. Throws
  `INVALID_MONTH` on a malformed month.

The CLI runs the *same* `filterTransactions` in-process, but its own
parsing/dedup/categorization around it is unvectored and can drift (§11).

---

## 8. Dashboard month scope (`components/dashboard/range.ts`)

Two related concerns: **rolling ranges** (This month / 3M / 6M / 1Y) and
**specific-month selection**.

### Rolling ranges (not vectored — pure calendar math)

- `DashboardRange` = `thisMonth | last3Months | last6Months | last12Months`;
  `monthCount` maps them to 1 / 3 / 6 / 12.
- **`rangeInterval(r, now)`** → `{ start, end }`, a calendar interval ending at
  the **end of the month containing `now`** (exclusive end = first of next month).
  Longer ranges start `monthCount - 1` months earlier.
- **`availableRanges(txs, now)`** — a range is offered only when the data actually
  spans it: months between the earliest transaction and `now` ≥ `monthCount - 1`.
  `thisMonth` is always available; empty data → only `thisMonth`.

### Specific-month selection (vectored — `dashboard-month-scope.json`)

These are parity-pinned so the month list, reference date, and stepping match
exactly:

- **`availableMonths(txs)`** → distinct `'YYYY-MM'`, **newest first**. The key is
  `date.slice(0, 7)` — a **string slice, not a local re-bucket** — so a row whose
  timestamp sits on a month boundary lists under the same month everywhere.
- **`monthReferenceDate("YYYY-MM")`** → the 15th at 12:00 UTC, a date safely
  inside the month, fed to the budget/insight engines so their calendar math lands
  on that month (and its prior month) in every timezone.
- **`monthInsightReference("YYYY-MM", now)`** → the reference the insight engine
  actually uses for a selected month: `now` if it's the current month (real
  elapsed time), otherwise the month's **last day at local noon** (fully elapsed).
  This fixes a real bug (spec 023 B2): the mid-month heuristic reported "~14 days
  left" for a finished month and, pinning `monthProgress` at ~0.48, permanently
  suppressed the "under budget" card (whose rule needs `monthProgress >= 0.7`).
  Built on the **local** calendar deliberately — `insights.ts` derives the month
  from local getters, so a noon-UTC last-day instant would read as next-month for
  viewers at UTC+12 and re-scope the whole month.
- **`stepMonth(months, current, direction)`** → the chronologically adjacent
  month (`prev` = older, `next` = newer) within the newest-first list, or `null`
  at the data edge.

---

## 9. Mortgage & housing

### 9.1 Mortgage (`finance/mortgage.ts`)

Standard fixed-rate amortization. Notation: `P` = principal (original loan
cents), `r` = monthly rate = `annualRatePercent / 100 / 12`, `n` = total payments
= `termYears * 12`.

- **`monthlyPaymentCents(P, rate, years)`** —
  `M = P · r(1+r)ⁿ / ((1+r)ⁿ − 1)`, rounded to whole cents. Zero-interest edge
  case: `round(P / n)`.
- **`monthsElapsed(closingDate, asOf, totalMonths)`** — whole months elapsed,
  clamped to `0..totalMonths`, **day-aware** (a partial final month doesn't
  count), matching Swift `Calendar.dateComponents([.month])`. Handles month-end
  closings: a Jan-31 closing reaches its "monthiversary" at a shorter month's end
  (Feb 28), which counts as a full month — done by clamping the closing day to the
  `asOf` month's length before comparing.
- **`currentPrincipalBalanceCents(...)`** — balance after `k = monthsElapsed`
  payments, via the recurrence **using the rounded monthly payment** (to match
  iOS to the cent): `B(k) = P·(1+r)^k − M·((1+r)^k − 1)/r`, floored at 0. Zero-
  interest: `max(0, P − M·k)`.
- **`currentEquityCents(...)`** — `max(0, purchasePrice − currentBalance)`.
- **`equityFraction(...)`** — equity / purchase price, clamped to 0–1 (0 when
  purchase price is 0).
- **`maturityDate(closingDate, years)`** — closing + `termYears*12` months, local
  calendar.
- **`yearsRemaining(closingDate, years, asOf)`** — whole years to maturity,
  day-aware, floored at 0.
- **`upcomingAmortization(months, ...)`** → `AmortizationEntry[]`
  (`{ month, principalCents, interestCents }`). Projects forward from the current
  balance, working in dollars to mirror Swift exactly (no early break, no
  principal clamp). Label dates advance by whole calendar months from `asOf` with
  the day **clamped to each target month's length** — the naive `setMonth(base+i)`
  overflowed short months (Jan 31 + 1mo → Mar 3, skipping February). The
  principal/interest values depend only on the amortization recurrence, not the
  label date, so this clamp doesn't move the vectors.

All of the above are locked by `mortgage.json` (8 cases including the day-29–31
month-end boundary and zero-interest). Dates parse through `parseLocalDate`
(§12) so they are timezone-stable.

### 9.2 Housing net rental (`finance/housing.ts`)

The **single source of truth** for the net-rental figure shown on *both* the
Dashboard housing summary and the property-detail "Net balance" card, so the two
screens can never disagree.

- **`isUnitOccupied(tenantName)`** — occupied ⇔ non-blank tenant name. Vacancy is
  a deliberate state (spec 019).
- **`occupiedRentCents(units)`** — sum of rents for **occupied units only**. A
  vacant unit contributes 0 — its rent is the asking number, not money collected.
- **`netRentalCents(units, mortgagePaymentCents)`** — `occupiedRent − mortgage
  payment`. **May be negative** (a cash-flow-negative building); never gated on a
  mortgage — pass `0` for a paid-off property.
- **`rentUnitsFrom(units)`** — maps stored units to the `{ rentCents, occupied }`
  shape the math consumes. Occupancy uses the explicit `occupied` column when
  present (`?? ` so an explicit `false` is kept), else falls back to tenant-name
  inference. Every surface funnels through this one mapping.

Locked by `housing-net-rental.json` (pure integer-cent math, carries no dates).

### 9.3 Lease timing (`components/housing/lease.ts`)

Date countdowns for the housing UI, all built on `parseLocalDate` / `startOfDay`
so they are timezone-stable (match iOS `Calendar.current`):

- **`rentDueDay(lease)`** — day-of-month rent is due, derived from `lease_start`.
- **`daysUntilNextRent(lease, asOf)`** — days to the next due date in the current/
  next month, never negative (rolls forward once this month's due day passed). The
  due day is **clamped to each month's length** so a 31 due-day resolves to
  month-end rather than overflowing.
- **`daysUntilEnd(lease, asOf)`** — days to `lease_end` (negative if already
  ended).
- **`isRenewalSoon(lease, asOf)`** — true when the lease ends within 60 days.
- **`nextRentCaption` / `rentDueCaption`** — "Due today / tomorrow / in N days"
  (the second variant takes a store translator `t`).

Locked by `lease.json`.

---

## 10. Insights engine (`finance/insights.ts`)

`generateInsights(transactions, budgets, properties, now, limit=6, tr, locale)`
→ up to `limit` `Insight`s, sorted **critical → positive**, tie-broken by
`magnitude_cents` descending. It is currency-agnostic (amounts are USD cents;
the body strings render USD with 2 decimals). `tr` is a translation hook whose
default is an interpolating identity, so the vector generator and any store-less
caller produce canonical English.

The month scope: `now` defines "this month" `[mStart, mEnd)` and the prior month
`[pStart, pEnd)`; `monthProgress = dayOfMonth / daysInMonth`; `daysLeft` is the
remainder of the month.

The **8 rules**, each emitting a typed insight with a stable id and a severity:

| # | Rule | Fires when | Severity | id scheme |
|---|---|---|---|---|
| 1 | **Top category** | this month's largest spend category (share of total) | info | `top-category-<cat>-<YYYY-MM>` |
| 2 | **Month-over-month delta** | a category with ≥ $20 both months and ≥ 25% change | warning (up) / positive (down) | `mom-<cat>-<YYYY-MM>` |
| 3 | **Budget status** | per budget: ≥100% over / ≥85% near / ≤50% under (under also needs `monthProgress ≥ 0.7`) | critical / warning / positive | `budget-{over,near,under}-<cat>-<YYYY-MM>` |
| 4 | **Cashflow / savings** | income < spend (deficit) or net ≥ 20% of income (savings) | critical / positive | `cashflow-{deficit,savings}-<YYYY-MM>` |
| 5 | **Recurring subscriptions** | a merchant with ≥3 charges in trailing 6 mo, ≥80% of gaps 28–35 days | info | `recurring-<YYYY-MM>` |
| 6 | **Outlier transaction** | a this-month charge ≥ 2× its category median (category needs ≥5 trailing txs) | warning if ≥ $500 else info | `outlier-<tx.id>` |
| 7 | **30-day trend** | last-30 vs prior-30 spend differs ≥ 20% (prior ≥ $100) | warning (up) / positive (down) | `trend30-<YYYY-MM>` |
| 8 | **Mortgage affordability** | first mortgage's P&I as % of income (needs income > 0) | positive <28% / info ≤35% / warning >35% | `mortgage-ratio-<YYYY-MM>` |

Notable details:

- **Recurring (rule 5)** is the most subtle. It groups trailing-6-month expenses
  by lowercased merchant, requires ≥3 charges and ≥80% of inter-charge gaps in the
  28–35 day band, and computes an average that **truncates toward zero**
  (`Math.trunc`) to match iOS `Int64` division. Preview ordering is
  amount-descending with a **case-insensitive, code-unit** name tie-break (not
  `localeCompare` — the vectors need one order in every runtime/language), and the
  displayed casing comes from the merchant's **most recent** transaction. It
  carries a `preview_merchants: string[]` of the top 3 — the only insight with a
  vectored preview array (spec 013).
- **Outlier (rule 6)** uses the category **median** over trailing transactions
  (needs ≥5), and picks the single largest qualifying charge.
- **Ids are part of the contract.** Differing ids are a real divergence, not a
  test-naming detail. Rules 1–4, 7, 8 are month-tagged; the outlier is tx-tagged.
- **Sort/limit:** severity order `{critical:0, warning:1, info:2, positive:3}`,
  then magnitude desc, then `slice(0, limit)`.

Locked by `insights.json` (all 8 rules).

The sort/limit is the exported `compareInsights` (spec 027) — extracted verbatim from the former
inline sort (no behavior change) so the goal off-track insights merge into the same ordering.

---

## 10.5 Savings & debt-payoff goals (`finance/goals.ts`)

Pure engine behind the Goals surface (spec 027). Integer USD cents; the reference "today" is
injected; pinned by `goals.json`. Progress is **contribution-driven** (bank balances aren't
synced — spec 024 is connect-only). Savings and debt-payoff share one model.

- **`goalProgress(targetCents, contributions)`** → `{ saved, target, remaining, fraction, reached }`.
  `saved` is the exact integer sum; `remaining = max(0, target − saved)`; `fraction = clamp(saved/target, 0, 1)`
  (0 for a non-positive target); `reached = target > 0 && saved ≥ target`. Never negative remaining,
  never fraction > 1.
- **`goalPacing(targetCents, targetDate, startISO, saved, now)`** → the steady-pace assessment.
  `expected = round(target × clamp(elapsed/span, 0, 1))` over calendar-day indices built from **local**
  getters (the insights.ts timezone rule); `span` is start (`created_at`) → `target_date`.
  `off_track` = not reached AND (past the date, OR behind `expected` by ≥ `offTrackToleranceFraction`
  of the target). `suggested_monthly = ceil(remaining / monthsLeft)` (= remaining when past due).
  Thresholds live in `goals-thresholds.ts` (the spec-025 `INSIGHT_THRESHOLDS` idiom).
- **`goalOffTrackInsight` / `goalInsights`** produce ordinary `Insight` objects (id
  `goal-offtrack-<id>`, severity **`warning`** → sand `--accent`, never red; magnitude = shortfall)
  so they render in the existing Insights card. Kept a **separate** engine + vector file so
  `insights.json` stays byte-stable; the dashboard consumers merge via `compareInsights`.

Locked by `goals.json` (`progress` + `pacing` cases).

---

## 11. Category & severity metadata (`categories.ts`)

Not an engine, but the taxonomy the engines and UI share:

- **`CATEGORIES`** — per-category `{ label, icon, tint }`. The 11 pickable
  categories (10 spend categories + `income`) plus `transfer`. Tints are RGB
  values ported from iOS.
- **`SPEND_CATEGORIES`** — the spend categories (excludes `income` and
  `transfer`), in enum order.
- **`SEVERITY_ORDER`** / **`severityColor`** — maps insight severity to sort rank
  and to a CSS design token (`--destructive`, `--accent`, `--positive`,
  `--text-2`). Note the money rule again: even `critical` maps to a token, and the
  design system keeps loss/cost from reading as red spend.
- **`PALETTE`** / **`paletteFor`** / **`deriveInitial`** — household-member avatar
  colors and initials (joint names "A & B" → "A+B").

---

## 12. Cross-cutting conventions

These are what make the models deterministic and portable, and are baked into the
vectors:

- **Integer USD cents everywhere** (§2). The only floats are rates, percents,
  `equityFraction`, and display amounts.
- **Round half away from zero** for money conversion and `sharePercent` — never
  plain `Math.round` on signed money.
- **Timezone stability, two regimes:**
  - **Housing date-only values** (mortgage `closing_date`, lease
    `lease_start`/`lease_end`, rental-payment dates) parse as **local** calendar
    dates via `parseLocalDate` (`web/lib/format.ts`). Plain `new Date('YYYY-MM-DD')`
    parses at UTC midnight and shifts a day west of UTC — every stored date column
    must go through `parseLocalDate`.
  - **Filter windows** are **UTC half-open `[from, to)`** via `monthBounds`.
  - **Insight transaction dates:** app-generated rows store noon-UTC ISO timestamps
    (safe for any TZ); imported/legacy rows may carry date-only `"YYYY-MM-DD"`
    strings. `inInterval` (spec 027 / A2) detects date-only strings and parses them
    via `parseLocalDate` (local midnight) so both sides of the boundary comparison
    use the same local-calendar regime as `monthInterval`. Non-UTC tests live in
    `web/test/insights-timezone.tz.test.ts` (run with `vitest.tz.config.ts`).
- **The vector harness pins `TZ=UTC`** (`gen-vectors.ts` and `vitest.config.ts`)
  so generation and assertion agree regardless of the machine's zone. Keep this
  pin.
- **Owner ids** are lowercase UUID strings; the leftover cent follows canonical
  (sorted) owner order.
- **Formatter caching** — `Intl.NumberFormat` / `Intl.DateTimeFormat` are cached
  by their output-affecting inputs (money, insights, format modules) for
  per-row performance without changing output (spec 023 P2).

---

## 13. How the models are pinned (the regression harness)

```
web/lib/* (TS — the source of truth for expected values)
        │  cd web && npm run gen:vectors      (tsx scripts/gen-vectors.ts, TZ=UTC)
        ▼
shared/test-vectors/*.json   ← committed; regenerate only on INTENDED change
        │  web/test/*.parity.test.ts read the JSON and assert web/lib reproduces it
        ▼  cd web && npm test
```

- **`web/scripts/gen-vectors.ts`** imports every engine and writes the eleven JSON
  files. It **asserts nothing** — it writes whatever the TS returns. The safety net
  is reviewing the diff, then `npm test`.
- **Eleven Vitest suites** (`web/test/*.parity.test.ts`) each mirror one JSON and
  assert the engine reproduces `expected`.
- **CI** (`web-ci.yml`, Linux) runs `tsc`, the Vitest suite, and a vector-drift
  check on any `web/**` / `services/**` / `supabase/functions/**` /
  `shared/test-vectors/**` change.

**The one discipline that matters:** because expected values come from the TS
implementation, regenerating after an *unintended* change **launders the bug into
the vectors** and the suite still passes — there is no second implementation to
catch it anymore. Treat every vector diff in review as a real behavior-change
diff. Never hand-edit the JSONs (they are regenerated); fix the TS or the case
list in `gen-vectors.ts` and regenerate. See [`shared.md`](./shared.md) §8 for
the full gotcha list.

Workflow after any pure-logic change: edit the TS → `cd web && npm run
gen:vectors` → review the JSON diff → `npm test` → reconcile `PARITY.md` if a
documented capability changed.

---

## 14. Where the models are consumed & the CLI boundary

- **web / Capacitor iOS shell** consume every engine (Dashboard insights, ledger
  filtering, split editor, settle-up balances, housing/mortgage cards, display-
  currency conversion). Same bundle, so both delivery targets get identical math.
- **The CLI** (`web/scripts/import/`) writes to the same tables and **reuses**
  `computeShares` / `orderedOwnerIds` / `formatMoney` / `lib/types` directly, but
  is **outside the vector harness**. Its own filtering, money parsing, split
  validation, date inference, dedupe, reconciliation, and merchant→category
  heuristics can drift undetected. Known CLI-only behaviors (from `PARITY.md`):
  USD-only; `--admin` service-role mode bypasses RLS; dedupe is `created_by`-scoped
  (a partner re-import can double-write); reconciliation/backfill place the
  leftover cent by `sort_order` rather than runtime `computeShares` order;
  Dec→Jan year inference in date parsing. Prefer `DRY_RUN=1` for any CLI write —
  the backend is live shared data.

`web/lib/aggregation.ts` (Plaid connect, spec 024) is **not** a financial model —
it is a bank-connection capability with no money/date engine, hence no vector row.

---

## 15. Gotchas checklist

- Don't reach for `Math.round` on signed money — use `roundHalfAwayFromZero`.
- Don't `new Date('YYYY-MM-DD')` on a housing date — use `parseLocalDate`.
- Don't compute shares off raw `owner_ids` order for storage — canonicalize with
  `orderedOwnerIds` first, or the leftover cent lands on the wrong person.
- Don't treat a `transfer` as spend/income — it's a reimbursement; `paid_by` is the
  sender and `owner_ids[0]` the recipient (use `transferParties`).
- Don't count vacant-unit rent as income — only `occupied` units count.
- Don't hand-edit vectors, and don't rubber-stamp a regenerated vector diff — it can
  launder a bug.
- Adding a `TransactionCategory` requires the Postgres enum migration **and** the
  `PICKABLE_CATEGORIES` change **and** a `CATEGORIES` entry.
- Keep `TZ=UTC` pinned in the generator and Vitest config.

---

## 16. Known limitations & hardening backlog

The math itself is careful; the risk has shifted from the code to its
*scaffolding*. These are the standing weaknesses, most-impactful first. Spec 025
(`specs/025-finance-hardening/`) tracks the work; its first slice landed **H1**,
**H3(a)**, and the insight-threshold note (marked *Done* below), leaving **H2**,
**H3(b)**, and **H4** as tracked follow-ups.

### H1 — The regression suite is a change-detector, not a correctness oracle — ✅ Done (spec 025)
Since spec 021 froze the Swift mirror, `gen-vectors.ts` writes whatever the TS
returns and the Vitest suites assert the TS reproduces it. There is **no
independently-computed expected value anywhere** — regenerating after an
*unintended* change launders the bug into the vectors and CI stays green. The
safety net is "review the diff," which is thin for money.
*Fix:* add a tier of hand-verified goldens (mortgage payment, split, balance
computed independently) and property-based invariants (`shares` always sum to
`amount_cents`; `computeShares(seedSplit(x)) === x`; `toUSDCents ∘ toDisplayAmount`
round-trips within tolerance). These *assert truth*, so they can't be laundered.
*Done:* `web/test/finance-goldens.test.ts` (independently-derived expected values,
each with its derivation shown) and `web/test/finance-properties.test.ts`
(invariants over seeded inputs). Both are independent of the generated vectors; a
deliberate off-by-one in a covered formula turns them red (verified once and
reverted during development).

### H2 — Obsolete "mirror Swift exactly" constraints are now dead-weight debt
Several functions preserve rounding/representation choices solely to match the
now-frozen native app. The sharpest is `upcomingAmortization` (`mortgage.ts`),
which deliberately drops back to **floating-point dollars** (`/100`, compute in
floats, `*100`) to mirror Swift — a self-inflicted float path in an otherwise
integer-cents codebase, justified by a constraint that no longer exists.
*Fix:* re-evaluate each "mirror Swift" choice on its own merits; where an
integer-cents formulation is clearly better, adopt it **behind a hand-verified
golden** so the vector change is a reviewed, correct behavior change (not a
laundered one). Lower priority than H1 — it's latent, not active, harm.

### H3 — The cents invariant is enforced by discipline, not by types or the DB
Two gaps:
- **(a)** `amount_cents` (and every `*_cents` field) is typed `number` — nothing
  stops a caller passing dollars. There is no branded `Cents` type. — ✅ **Done
  (spec 025).**
- **(b)** The shares-sum-to-total invariant has **no SQL constraint and no atomic
  RPC**: web does client-side compensating rollback, the CLI does not, and a
  share-less row is reachable (see `PARITY.md`). For financial data, "we roll back
  in the client if the second write fails" silently corrupts on the unhappy path.
  — ✅ **Done (spec 027).**
*Fix (two independently shippable pieces):* (a) a branded `Cents` type at the
finance-layer boundary; (b) move the sum invariant into the database (a
`CHECK`/trigger, or an atomic parent+shares RPC).
*Done (a):* `web/lib/finance/cents.ts` — a branded `type Cents = number & {…}` with
validated constructors (`toCents`, `centsFromDollars`) and guards
(`isCents`/`assertCents`). Because `Cents` is a *subtype* of `number`, it is
additive: existing call sites are untouched (no ripple), while a new path that
*requires* `Cents` rejects a plain-`number` dollars value at compile time and a
non-integer at runtime. Wholesale adoption across the layer is deferred.
*Done (b):* `supabase/migrations/20260718120002_upsert_transaction_atomic.sql` —
`upsert_transaction(p_tx jsonb, p_shares jsonb)` PL/pgSQL RPC (`security definer`)
validates `sum(shares.amount_cents) = amount_cents` and commits transaction + shares
atomically. Both `addTransaction`/`updateTransaction` in `web/lib/store.tsx` and the
CLI `persist()` in `web/scripts/import/db/persist.ts` now call this RPC exclusively;
client-side compensating rollback is gone.

### H4 — The date model is a three-regime split-brain
Filter windows are UTC half-open `[from, to)`; housing date-only values are
**local** calendar dates (`parseLocalDate`); insight dates are UTC-midnight
mid-month. Each is individually justified and documented (§12), but the next
date-touching feature has three different "correct" answers depending on which
engine it lands in.
*Fix:* no behavior change warranted — this is a comprehension cost. Keep §12 and
the per-function comments authoritative; treat any new date logic as requiring an
explicit choice of regime. Tracked as a documentation/guard-rail item, not a
refactor.

### Smaller notes
- **Insights thresholds are inline magic numbers** ($20 / 25% / 85% / 28–35 days /
  80% / 2× / $500 / 20% / 28%/35%) scattered across ~350 lines. Extracting them to
  one named `INSIGHT_THRESHOLDS` config improves readability and testability with
  zero behavior change (the values, and thus the vectors, stay identical). — ✅
  **Done (spec 025):** `web/lib/finance/insights-thresholds.ts`; `insights.ts`
  consumes it and `insights.json` regenerated byte-identical.
- **`toUSDCents` silently returns 0 on `rate <= 0`** — defensive, but it converts a
  data problem into a zero amount rather than surfacing it. Keep the guard;
  consider logging/telemetry at the call sites that supply the rate.
- **`generateInsights` is O(passes)** — ~7 full transaction scans with repeated
  `new Date(t.date)` parsing. Irrelevant at household scale; an easy cleanup if the
  file is ever touched for another reason.
- **Ortho is USD accounting with display conversion, not multi-currency.** One
  global `rate`, no per-transaction currency, so historical rows re-convert at the
  current rate. A valid product choice — stated here so it's not mistaken for
  multi-currency support.

## 17. Cross-links

- [`shared.md`](./shared.md) — the vector harness mechanics, determinism rules,
  and the full per-file vector map.
- [`web.md`](./web.md) — where these engines are wired into the store, components,
  and the CLI internals.
- [`supabase.md`](./supabase.md) — the Postgres schema (`transactions` +
  `transaction_shares`, `properties`/`mortgage_info`/`lease_info`/`units`,
  `budgets`, enums) these shapes mirror.
- [`../PARITY.md`](../PARITY.md) — the authoritative capability → TS file → vector
  matrix and the web-vs-CLI divergence record.
- `web/scripts/gen-vectors.ts` — the de-facto per-case schema for every engine.
</content>
</invoke>

# Contract: Financial Health scoring

The exact, deterministic contract implemented by `web/lib/finance/financialHealth.ts` and pinned by
`web/test/financial-health.test.ts`. All constants named here live in
`web/lib/finance/financial-health-thresholds.ts` (tunable without touching logic). All money is
integer USD cents. The function is pure; `now` is injected. Rounding on any produced money figure
uses `roundHalfAwayFromZero`; scores are rounded with `Math.round` at the end and clamped to
`[0, 100]`.

## Types

```ts
type HealthDimension = 'cash_flow' | 'safety_net' | 'commitment_load' | 'savings_momentum' | 'plan_engagement'
type HealthBand = 'strong' | 'steady' | 'building' | 'getting_started'

interface DerivedFinancialProfile {           // computed by deriveProfile(), never stored
  incomeForRatiosCents: number                // low estimate when income_is_variable, else monthly income
  committedCents: number                      // housing_cost * housing_share_fraction + Σ fixed_costs
  netAvailableCents: number                   // incomeForRatiosCents - committedCents (may be negative)
  savingsTargetCents: number                  // round(monthly_income * savings_target_fraction)
  savingsTargetFraction: number
  emergencyFundLevel: EmergencyFundLevel
}

interface FinancialHealthInput {
  profile: DerivedFinancialProfile | null     // null → profile-null neutral mode
  transactions: Transaction[]                 // household transactions (expenses used)
  budgets: Budget[]
  goals: Goal[]
  contributionsByGoal: Record<string, GoalContribution[]>
  weights: Record<HealthDimension, number>    // each 1..5; missing → DEFAULT_WEIGHT (3)
  now: Date
}

interface DimensionScore { key: HealthDimension; score: number; weight: number }
interface HealthAction { dimension: HealthDimension; key: string; args: Array<string | number> }  // key is an English tr() template

interface FinancialHealthResult {
  score: number                               // 0..100 composite
  band: HealthBand
  dimensions: DimensionScore[]                 // fixed order: cash_flow, safety_net, commitment_load, savings_momentum, plan_engagement
  topAction: HealthAction
  hasProfile: boolean
}
```

## Helper: current-month expense total

`monthSpendCents(transactions, now)` = sum of `amount_cents` for `kind === 'expense'` transactions in
the **local-calendar** month of `now` (same bucketing regime as `budgetStatusForMonth`). Used by Cash
flow and Savings momentum. "Has history" = at least one expense transaction exists.

## Dimension scoring (each → 0..100, clamped)

Let `income = profile.incomeForRatiosCents`. If `income <= 0`, every ratio that divides by income
yields the dimension's supportive floor (no NaN/Infinity ever). `lerp(x, x0, x1, y0, y1)` clamps to
`[y0, y1]`.

### 1. Cash flow — weight-eligible; profile + history

- `spend = hasHistory ? monthSpendCents : profile.committedCents` (committed treated as a spend floor).
- `ratio = income > 0 ? (income - spend) / income : 0`.
- `score = lerp(ratio, 0, CASHFLOW_FULL_RATIO, CASHFLOW_FLOOR, 100)` where
  `CASHFLOW_FULL_RATIO = 0.25`, `CASHFLOW_FLOOR = 25`.
  - `ratio >= 0.25` → 100; `ratio <= 0` → 25; linear between.
- Profile-null → `NEUTRAL = 50`.

### 2. Safety net — weight-eligible; profile + goals

- Base from `emergency_fund_level`: `EMERGENCY_BASE = { none: 15, under_1m: 35, '1_3m': 60, '3_6m': 85, '6m_plus': 100 }`.
- Goal boost: if any goal is on-pace (its `goalPacing(...).off_track === false` **and** it has any
  contribution), add `SAFETY_GOAL_BONUS = 15`, clamped to 100.
- `score = min(100, base + goalBonus)`.
- Profile-null → 50.

### 3. Commitment load — weight-eligible; profile only

- `committedFraction = income > 0 ? profile.committedCents / income : 1`.
- `score = lerp(committedFraction, COMMIT_LOW, COMMIT_HIGH, 100, COMMIT_FLOOR)` (note: **inverted** —
  lower committed = higher score) with `COMMIT_LOW = 0.50`, `COMMIT_HIGH = 0.90`, `COMMIT_FLOOR = 20`.
  - `committedFraction <= 0.50` → 100; `>= 0.90` → 20; linear between.
- Profile-null → 50.

### 4. Savings momentum — weight-eligible; profile intention + history

- Intention base from `savings_target_fraction f`: `f <= 0` → 30; `f = 0.05` → 50; `f = 0.10` → 70;
  `f >= 0.15` → 90; piecewise-linear between those knots (`SAVINGS_INTENT_KNOTS`).
- If `hasHistory` and `income > 0`: `actualRate = (income - monthSpendCents) / income`;
  `actualScore = lerp(actualRate, 0, f_effective, 30, 100)` where `f_effective = max(f, 0.01)`
  (so a zero-target saver who actually saves still scores); `score = max(intentBase, actualScore)`.
  Else `score = intentBase`.
- Profile-null → 50.

### 5. Plan engagement — weight-eligible; history/budgets/goals (no profile needed)

- Start `PLAN_BASE = 50` (absence never below neutral).
- `+PLAN_HAS_BUDGET (15)` if ≥1 budget with `monthly_limit_cents > 0`.
- `+PLAN_BUDGETS_ONTRACK (15)` if ≥1 budget and none are over
  (`budgetStatusForMonth(b, txns, now).remainingCents >= 0` for all budgeted categories).
- `+PLAN_HAS_GOAL (10)` if ≥1 goal.
- `+PLAN_GOALS_ONTRACK (10)` if ≥1 goal and none are off-track (`goalPacing(...).off_track === false`).
- `score = min(100, sum)`. (This dimension never uses the profile, so it scores even in profile-null
  mode.)

## Composite

```
weightOf(d) = clamp(weights[d] ?? 3, 1, 5)
score = round( Σ_d dimensionScore(d) * weightOf(d) / Σ_d weightOf(d) )
```

All-default weights (all 3) ⇒ simple average. `score` clamped to `[0,100]`.

## Bands

| score | band |
|---|---|
| 80–100 | `strong` |
| 60–79 | `steady` |
| 40–59 | `building` |
| 0–39 | `getting_started` |

`bandForScore(score)` is monotonic. Bands MUST render in the sand `--accent` ramp — **never red**,
never a clinical label.

## Top action

Pick the dimension with the **lowest weighted contribution** (`score * weight`), tie-broken by the
fixed dimension order. Emit its templated next step (English key + args, resolved via `tr()`):

| dimension | action template (English key) |
|---|---|
| `cash_flow` | `"Your spending is close to your income — trimming one recurring cost frees up room."` |
| `safety_net` | `"Start a small emergency fund — even {0}/week builds a cushion."` (arg: a small money figure) |
| `commitment_load` | `"A lot of your income is committed — see if one fixed cost can be reduced or shared."` |
| `savings_momentum` | `"Set aside a little each month — a {0}% goal is a solid start."` (arg: a modest percent) |
| `plan_engagement` | `"Set a budget for one category — it makes the rest of this easier to see."` |

Copy is encouraging, never scolding. Final strings live in the i18n catalogs; the contract fixes the
keys + arg positions.

## Profile-null mode

When `profile === null`: `cash_flow`, `safety_net`, `commitment_load`, `savings_momentum` = `NEUTRAL`
(50); `plan_engagement` scores from real data as usual; `hasProfile = false`. The widget shows a
"Set up your financial profile for a meaningful score" CTA rather than leaning on the number.

## Invariants (property tests)

1. `score ∈ [0,100]` and every `dimensions[].score ∈ [0,100]` for all inputs (incl. income 0/negative,
   empty transactions, missing weights).
2. `bandForScore` is monotonic non-decreasing in score; boundaries at 40/60/80.
3. Variable income uses the **low** estimate: raising `income_low_estimate_cents` (all else equal, when
   variable) never decreases a ratio-driven dimension.
4. Increasing a dimension's weight never decreases that dimension's share of the composite.
5. No output money figure is produced with bare `Math.round` on signed values (use
   `roundHalfAwayFromZero`); no NaN/Infinity for any input.
6. Never-red is a render concern, asserted in the widget test (no destructive token on score/band).

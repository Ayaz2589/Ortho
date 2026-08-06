# Purchase Advisor — Feature Planning Document

**Written:** 2026-07-30  
**Status:** Planning — design decisions pending before spec/tasks  
**Author:** Ayaz Uddin  

---

## 1. Overview

Purchase Advisor is a workflow that helps users decide whether to make a purchase *before* they make it. It lives front-and-center on the home screen. The user enters an expense item (name, amount, category) and the system runs a financial fitness algorithm against their spending history, current budget status, and a personal financial profile gathered during onboarding. The result is a verdict screen with charts and contextual insight bullets.

If the user decides to buy the item, one tap logs it as a normal transaction. If they pass, the evaluation can be saved or dismissed.

### Why this works (the data advantage)

Ortho already has:
- Category-level budgets with rollover (`web/lib/finance/budgets.ts`)
- Insights engine with 8 rules operating on real transaction history (`web/lib/finance/insights.ts`)
- Category taxonomy (41 values across 12 groups, `web/lib/categories.ts`)
- Savings rate insight (Rule 4 in insights engine)

What we're adding on top:
- **User financial profile** — questionnaire answered at onboarding: income, fixed costs, household setup, savings targets, category importance sliders
- **Purchase Advisor algorithm** — blends budget signal + savings signal + affordability signal + category importance + spending trend into a single 0–100 score → verdict
- **Verdict screen** — 4 charts + a score badge + 2–3 insight bullets

### New user reality

**The primary user of this feature has zero transaction history.** The onboarding questionnaire runs immediately after account creation, before any transactions exist. The algorithm is therefore designed profile-first: 60% of the score weight (signals 2, 3, 4) comes from questionnaire answers alone. The remaining 40% (signals 1, 5) uses transaction history when available and falls back to neutral (50) when it isn't.

This means the advisor gives useful verdicts from day one — the profile is the data, not a supplement to historical data. History makes the score more precise over time, but is never a prerequisite.

---

## 2. The Two New Systems

### System A: Financial Profile Onboarding

A questionnaire + slider flow triggered when a user creates their account for the first time. Answers are stored in `user_financial_profile` and `user_category_preferences` tables. The profile is what makes the algorithm personal rather than generic.

Without a profile, the advisor can still run using only budget and transaction history — but the verdicts will be less nuanced (no income context, no importance weighting). The profile unlocks the full score.

### System B: Purchase Advisor Workflow

A home screen entry point that accepts an expense item, runs the algorithm, and returns a verdict. The advisor is *not* a transaction — it's a what-if analysis. The user decides whether to convert it into a real transaction.

---

## 3. Financial Profile Onboarding

### When it triggers

Immediately after account creation, before reaching the home screen. One-time flow. Users can revisit and update it later from **Settings → Financial Profile**.

### Flow structure (5 screens)

Each screen has a title, a brief 1-sentence context line, and a "Continue" button. Skip is available on every screen except Screen 1. Progress indicator (1/5 ... 5/5) shown at the top.

---

**Screen 1 — Income** *(required, no skip)*

> "We use this to understand how much room you have each month."

- **Monthly take-home income** — numeric input (or slider, $500–$25,000 in $100 steps)  
- **Does your income vary month to month?** — toggle (yes/no)  
  - If yes: show a second input for the lower estimate ("On a slow month, roughly…")

---

**Screen 2 — Housing**

> "Housing is usually the biggest fixed cost. Help us understand yours."

- **Living situation** — segmented control:
  - Rent (→ asks rent amount)
  - Own (→ asks mortgage/payment or "no payment")
  - Live with family / no housing cost
- **Monthly housing cost** — input shown if Rent or Own selected
- **Do you split this cost?** — toggle (yes/no)
  - If yes: "How many people split it?" (2/3/4/5+) + "Your share?" (defaults to equal split, editable %)

---

**Screen 3 — Other fixed monthly costs**

> "Loan payments, car payments, recurring subscriptions you can't cancel — your baseline commitments."

- **Any recurring fixed costs beyond housing?** — toggle
  - If yes: repeatable row list (label + amount)
    - Examples pre-suggested: Car payment, Student loan, Child support, Other
  - Each row is optional; user can add as many as they want
- Subtotal shown live at the bottom: "Your fixed costs: $X / month"

---

**Screen 4 — Savings & Safety Net**

> "This helps us know how cautiously to score purchases."

- **Emergency fund** — single-select chip:
  - None yet
  - Less than 1 month
  - 1–3 months
  - 3–6 months
  - 6 months or more
- **Monthly savings goal** — slider, 0–30% of income (in 5% steps), default 10%
  - Show live dollar equivalent beneath the slider: "≈ $X / month at your income"

---

**Screen 5 — Category Importance**

> "How much do these areas of spending matter to you? This shapes how we score purchases."

A single scrollable list of the top-level expense category groups (not individual subcategories — too many). For each group:

| Group | Label |
|---|---|
| food_drink | Food & Drink |
| transport | Transportation |
| home | Home |
| health_wellness | Health & Wellness |
| entertainment | Entertainment |
| shopping | Shopping |
| subscriptions | Subscriptions |
| education | Education |

Each row: group icon + label + 5-star importance selector (or 1–5 segmented control). Default: 3 (Neutral). 

This screen has a "Skip — use neutral defaults" link at the bottom.

---

**Completion**

> "You're all set. Your profile helps Ortho give smarter purchase advice. You can update it anytime in Settings."

CTA: "Go to Home"

---

### What we derive from the profile

| Derived value | Formula |
|---|---|
| `net_available_income_cents` | `monthly_income_cents − housing_cost_cents × housing_share_fraction − sum(fixed_costs_cents)` |
| `savings_target_cents` | `monthly_income_cents × savings_target_fraction` |
| `discretionary_income_cents` | `net_available_income_cents − savings_target_cents` |
| `category_importance(group)` | stored directly (1–5), defaults to 3 |

These derived values are computed at query time — not stored. The raw answers are stored.

---

## 4. Spending Habit Tracking

We already have the full transaction history. No new tracking table is needed. The algorithm derives spend habits directly from transactions at evaluation time, using the same patterns already in `insights.ts`:

| Signal | Derivation |
|---|---|
| Category spend this month | `expensesIn(txs, monthStart, now)` filtered to category |
| 3-month category average | sum over prior 3 full months ÷ 3 |
| Spend frequency | count of transactions in category over last 90 days |
| Spend trend | 30-day window vs prior 30-day window (mirrors insights Rule 7) |

One new concept: **"typical purchase amount"** for a category — the median single-transaction amount in that category over the last 90 days. Used for outlier detection ("this is 3× your typical grocery run").

---

## 5. Purchase Advisor Workflow

### Entry point

On the home screen: a persistent card labeled **"Should I buy this?"** with a `+` icon. Positioned below the dashboard summary widgets, above the recent transactions list. Tapping it opens the purchase input sheet (modal or full-screen, TBD).

Alternatively (open question): a floating action button variant, or a dedicated tab.

### Step 1 — Purchase Input

Same fields as the New Transaction form for expenses, but framed differently:

| Field | Notes |
|---|---|
| Item name | Free text. Autocomplete from past transaction `merchant` values in that category (same datalist pattern as spec 032) |
| Amount | Numeric. Required. |
| Category | Category picker. Required. Income and transfer categories excluded. |
| Date | Defaults to today. Optional — used to place it in the right budget month. |
| Note | Optional. |

"Check this purchase →" CTA at the bottom runs the algorithm and navigates to the verdict screen.

### Step 2 — Verdict Screen

**Header zone:**
- Item name + amount (large)
- Category chip (icon + label)
- Verdict badge — one of 4 states:

| Score | Badge label | Color |
|---|---|---|
| 80–100 | Looks good | Green |
| 60–79 | Proceed with care | Yellow/amber |
| 40–59 | Think twice | Orange |
| 0–39 | Hold off | Red |

**Charts (4 total):**

1. **Category budget bar** — horizontal progress bar showing category spend this month, the monthly budget (if set), and this purchase overlaid in a distinct color. If no budget set: shows vs 3-month average instead. Label: "X budget used (Y remaining)"

2. **Category spend history** — sparkline or bar chart: one bar per month for available history (up to 6 months). Current month bar split: logged spend vs this purchase. **New user state:** if fewer than 2 months of data exist, replace with a plain text callout: "You'll see your spending trend here as you log more transactions." Do not show an empty chart.

3. **Monthly income waterfall** — stacked horizontal bar:
   `[Income] → [Housing + Fixed] → [Other spending this month] → [This purchase] → [Remaining]`
   Shows at a glance how this purchase sits in the total monthly picture.

4. **Savings rate impact** — a single-line indicator:
   - "With this purchase, you'd save X% this month" (vs your Y% target)
   - Shown as a gauge or two-value comparison (current rate vs projected rate)

**Insight bullets (2–3 sentences):**

Generated from the same signal data as the score. Examples:
- "You've spent $340 on groceries this month — $60 under your $400 budget. This $55 purchase keeps you in the green."
- "Your food spending has increased 40% over the last 30 days. Adding this puts you $95 over your usual range."
- "This would drop your savings rate from 18% to 12% this month, below your 15% target."

**Action buttons:**
- **"Log purchase"** — creates the transaction (same path as TxForm save), navigates to transactions list with the new row visible
- **"Save for later"** — stores the evaluation as `status: 'pending'` (optional feature, see §8)
- **"Pass on it"** — dismisses without logging

---

## 6. The Algorithm

Pure TypeScript function. Vector-lockable (same pattern as `insights.ts`, `budgets.ts`). No DB calls — all inputs passed in.

```typescript
function scorePurchase(input: PurchaseAdvisorInput): PurchaseAdvisorResult
```

### Inputs

```typescript
interface PurchaseAdvisorInput {
  purchaseAmountCents: number
  purchaseCategory: TransactionCategory
  profile: UserFinancialProfile | null        // null → reduced-accuracy mode
  transactions: Transaction[]                 // last 6 months
  budgets: Budget[]                           // current budgets
  now: Date
}
```

### Five signals (each 0–100, higher = more comfortable to purchase)

**Signal 1: Budget signal (weight 30%)**

If a budget exists for the purchase category:
- remaining = `monthly_limit - spent_so_far`
- signal = `clamp(remaining / purchase_amount, 0, 1) × 100`
  - i.e., if remaining >= purchase amount: 100; if remaining = 0: 0; proportional between

If no budget exists:
- Compare to 3-month average spend in category
- signal = `clamp((avg_monthly_spend - spent_so_far) / avg_monthly_spend, 0, 1) × 100`
  - If first month with no history: 50 (neutral baseline)

**Signal 2: Savings signal (weight 25%)**

Requires profile. If no profile: 50 (neutral).

- `projected_savings = net_available_income - total_spent_this_month - purchase_amount`
- `projected_savings_rate = projected_savings / monthly_income`
- If `projected_savings_rate >= savings_target_fraction`: 100
- If `projected_savings_rate <= 0`: 0
- Linear interpolation between 0 and target

**Signal 3: Affordability signal (weight 25%)**

Purchase as a fraction of `discretionary_income_cents` (or `net_available_income` if no profile):

| Purchase / discretionary | Signal |
|---|---|
| < 5% | 100 |
| 5–10% | 80 |
| 10–20% | 60 |
| 20–40% | 30 |
| > 40% | 10 |

**Signal 4: Category importance signal (weight 10%)**

Requires profile. If no profile or category not rated: 50 (neutral).

- User's importance score for the category group (1–5) mapped to 0–100: `(importance - 1) × 25`

Rationale: a low importance score doesn't make a purchase objectively worse — it tempers how much we boost it. A high importance score slightly boosts borderline purchases because the user values that area of spending.

**Signal 5: Spend trend signal (weight 10%)**

Uses 30-day vs prior 30-day window (mirrors insights Rule 7):
- Trend is stable (|Δ| < 20%): 60
- Trend decreasing (Δ < -20%): 80
- Trend increasing 20–50%: 40
- Trend increasing > 50%: 20
- No prior history: 50

### Composite score

```
score = round(
  signal_budget       × 0.30 +
  signal_savings      × 0.25 +
  signal_affordability × 0.25 +
  signal_importance   × 0.10 +
  signal_trend        × 0.10
)
```

### Thresholds file

Weights and cutoffs live in `web/lib/finance/purchase-advisor-thresholds.ts` (same pattern as `insights-thresholds.ts`) so they can be tuned without touching algorithm logic.

### New user mode (no transaction history)

This is the **expected initial state** — not an edge case. A brand-new user who just completed the onboarding questionnaire has:

| Signal | Source | New user behavior |
|---|---|---|
| 1 — Budget | Transaction history + budgets | No budgets set, no history → neutral (50) |
| 2 — Savings | Profile income + this month's spend | Month spend = $0, full capacity → works from day 1 |
| 3 — Affordability | Profile discretionary income | No history needed → works from day 1 |
| 4 — Category importance | Profile preferences | No history needed → works from day 1 |
| 5 — Spend trend | Transaction history | No prior window → neutral (50) |

**New user composite:** `50 × 0.30 + savings × 0.25 + affordability × 0.25 + importance × 0.10 + 50 × 0.10` = profile-driven with neutral anchors. The advisor is fully operational from the first use.

As the user logs transactions, signals 1 and 5 become live (budgets set → signal 1 sharpens; 60 days of history → signal 5 sharpens). No code change needed — the fallbacks simply stop triggering.

### Reduced-accuracy mode (no profile)

When `profile` is null (user skipped onboarding), signals 2, 3, and 4 fall back to 50 (neutral). Only signals 1 (budget) and 5 (trend) use real data. For a brand-new user with no profile *and* no history this produces a score of 50 — effectively no verdict. The verdict screen shows a banner: "Complete your financial profile for a meaningful assessment." This is intentionally a worse experience to encourage profile completion.

---

## 7. Data Model

### New tables

**`user_financial_profile`** (one row per user)

```sql
CREATE TABLE user_financial_profile (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_income_cents      integer NOT NULL,
  income_is_variable        boolean NOT NULL DEFAULT false,
  income_low_estimate_cents integer,                          -- if income_is_variable
  housing_type              text NOT NULL CHECK (housing_type IN ('rent','own','family','none')),
  housing_cost_cents        integer,
  housing_share_fraction    numeric(5,4) NOT NULL DEFAULT 1.0,
  savings_target_fraction   numeric(5,4) NOT NULL DEFAULT 0.10,
  emergency_fund_level      text NOT NULL DEFAULT 'none'
                              CHECK (emergency_fund_level IN ('none','under_1m','1_3m','3_6m','6m_plus')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
```

**`user_fixed_costs`** (zero-to-many rows per user)

```sql
CREATE TABLE user_fixed_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**`user_category_preferences`** (one row per user per category group)

```sql
CREATE TABLE user_category_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_group  text NOT NULL,  -- CategoryGroupKey
  importance  smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_group)
);
```

**`purchase_evaluations`** (optional — for save-for-later and history)

```sql
CREATE TABLE purchase_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name       text NOT NULL,
  amount_cents    integer NOT NULL,
  category        text NOT NULL,
  score           smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  verdict         text NOT NULL CHECK (verdict IN ('go','caution','think_twice','hold_off')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','purchased','passed')),
  notes           text,
  transaction_id  uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

All tables get RLS: `user_id = auth.uid()`.

### Store changes

`web/lib/store.tsx` additions (mirror pattern of `cards`, `depositAccounts`):
- `userFinancialProfile: UserFinancialProfile | null`
- `userCategoryPreferences: UserCategoryPreference[]`
- `userFixedCosts: UserFixedCost[]`
- `saveFinancialProfile(profile)` — upsert
- `saveUserFixedCosts(costs)` — replace-all (delete + insert in transaction)
- `saveCategoryPreferences(prefs)` — upsert per-group

These are loaded in the `loadAll` fan-out, fail-open if table missing (PGRST205 → null/empty, same as `tagsRes`).

---

## 8. Home Screen Placement

The Purchase Advisor entry point needs to be prominent without crowding the dashboard. Three options — **decision needed**:

**Option A: Persistent dashboard card**  
A card below the summary widgets reading "Should I buy something? Run a check →". Always visible. Low friction. Risk: feels like an ad banner if ignored.

**Option B: Floating action button (FAB)**  
A circular FAB in the bottom-right corner (distinct from the existing "+" transaction button). Or replace the existing FAB with a split-button: left half = "Add transaction", right half = "Check a purchase". Risk: two FABs clutters mobile.

**Option C: Dedicated "Check" tab in bottom nav**  
A 4th tab in the nav (alongside Home / Transactions / Settings). Gives it full screen real estate without cluttering home. Risk: nav already has 3 tabs; adding a 4th makes it wider.

**Recommendation:** Option A — a dashboard card is the most discoverable without restructuring nav. The card can have a dismiss/collapse affordance for users who don't use it.

---

## 9. Save For Later / Watchlist (optional scope)

The "Save for later" action on the verdict screen stores the evaluation in `purchase_evaluations` with `status: 'pending'`. A "Considering" section in the home dashboard card (or its own list) shows pending items. Tapping one re-runs the verdict screen.

This is a meaningful UX addition — it turns the advisor into a wishlist with financial context. However it adds complexity to the home screen and the store. **Treat as v2 scope unless there is clear demand.**

---

## 10. i18n

All new UI strings need entries in all 6 locale files (`web/lib/i18n/en.ts`, `es.ts`, `ja.ts`, `ko.ts`, `bn.ts`, `zh.ts`).

Estimated new string keys (not exhaustive):
- Onboarding: ~30 keys (screen titles, field labels, option labels, CTA labels)
- Verdict screen: ~20 keys (verdict labels, insight templates with placeholders, chart axis labels, action button labels)
- Settings → Financial Profile: ~10 keys

Insight template strings use `{0}`, `{1}` placeholders (same pattern as existing insights engine `tr()` function).

---

## 11. Implementation Phases

| Phase | Scope | Depends on |
|---|---|---|
| P1: Foundation | DB tables, TypeScript types, store hooks | Nothing |
| P2: Algorithm | `purchase-advisor.ts` + thresholds, unit tests, golden vectors | P1 types |
| P3: Onboarding flow | Questionnaire screens, settings update page | P1 store |
| P4: Verdict screen | Charts, score badge, insight bullets | P2 algorithm, P3 store data |
| P5: Home screen entry | Dashboard card + input sheet | P4 verdict screen |
| P6: i18n | All 6 locale files | P3 + P4 |
| P7: Polish | Save-for-later, profile edit, empty states, reduced-accuracy banner | P4 + P5 |

P1 → P2 and P1 → P3 can run in parallel (different files, same types).

---

## 12. Open Questions

These decisions block spec/tasks generation and need user input:

1. **Home screen placement**: Option A (dashboard card), B (FAB), or C (nav tab)? See §8.

2. **Skip policy on onboarding**: Can a user skip the entire onboarding flow and run the advisor with no profile? The reduced-accuracy mode (§6) supports this — is it acceptable UX?

3. **Household mode**: If 2 people share the household and both use Ortho, does the purchase check use per-user income or household income? The questionnaire as designed is per-user. Should there be a "household income" path?

4. **Profile updates after onboarding**: Settings → Financial Profile lets users update answers. Should changes immediately re-score any saved evaluations (`purchase_evaluations`)? Or are verdicts point-in-time snapshots (simpler)?

5. ~~**Charting library**~~ — **Resolved:** **Recharts** (`recharts@^3.8.1`) is already in use for `SpendByCategoryCard` (pie/donut) and `DailySpendTrendCard` (line) in the dashboard. Use it for verdict screen charts. Dynamically import via `next/dynamic` to keep initial bundle small, same as dashboard.

6. **"Save for later" in v1 or v2**: Is the watchlist/pending evaluation feature in scope for this spec, or deferred? (See §9.)

7. **Category importance granularity**: Questionnaire uses category *groups* (8 groups). Algorithm maps `purchaseCategory` → group. Does this feel specific enough? Alternative: show all 28 expense *subcategories* — more precise, but much longer questionnaire screen.

8. **Verdict copy ownership**: Who writes the insight bullet templates? They need to feel natural in 6 languages. Placeholder strings go in the spec; final copy should be reviewed before launch.

9. ~~**No-history fallback for new users**~~ — **Resolved:** The advisor runs from day 1. Signals 2, 3, 4 are profile-driven and require no history. Signals 1 and 5 neutral-fallback when history is absent. Do not gate the feature behind a transaction count. See §6 "New user mode".

10. **Transaction flow after "Log purchase"**: Should "Log purchase" go to the full TxForm (pre-filled) so the user can edit splits, tags, notes — or should it bypass the form and directly save the transaction with the advisor's data? The former is safer but adds a step.

---

## 13. What Already Exists (Do Not Rebuild)

| What | Where | Reuse strategy |
|---|---|---|
| Category taxonomy (41 values) | `web/lib/categories.ts` | `purchaseCategory` uses same `TransactionCategory` type |
| Budget status engine | `web/lib/finance/budgets.ts` | Signal 1 calls `budgetStatusForMonth()` |
| Insights derivation patterns | `web/lib/finance/insights.ts` | Signal 5 mirrors Rule 7 (30-day trend); insight bullet format mirrors existing Insight type |
| Merchant name datalist | `TxForm.tsx` (spec 032) | Re-use same datalist pattern on item name input |
| Modal/sheet pattern | `AddDepositAccountModal.tsx`, `AddCardModal.tsx` | Purchase input sheet uses same pattern |
| `loadAll` fail-open pattern | `web/lib/store.tsx` (~line 700+) | New tables loaded with same PGRST205 guard |
| `InsightTranslate` (`tr()`) | `web/lib/finance/insights.ts` | Insight bullet templates use same tr() hook |

---

## 14. Database Layer

### Migration file

Single file: `supabase/migrations/20260731120000_purchase_advisor_profile.sql`

Contains all four tables in order. Naming follows the repo's `YYYYMMDDHHMMSS_description.sql` convention; timestamp must exceed the latest migration (`20260730120000`).

### RLS strategy — per-user, not per-household

`cards`, `deposit_accounts`, and `budgets` are **household-scoped** (RLS via `is_household_member(household_id)`). Financial profile tables are **user-scoped** — one profile per Ortho account, not per household. RLS policy: `user_id = auth.uid()`.

```sql
-- Example for user_financial_profile (same pattern repeated for all three tables)
alter table public.user_financial_profile enable row level security;

create policy "profile_select" on public.user_financial_profile
  for select using (user_id = auth.uid());

create policy "profile_insert" on public.user_financial_profile
  for insert with check (user_id = auth.uid());

create policy "profile_update" on public.user_financial_profile
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profile_delete" on public.user_financial_profile
  for delete using (user_id = auth.uid());
```

`purchase_evaluations` (save-for-later, v2) follows the same per-user RLS pattern.

### Row types — `web/lib/supabase/rows.ts`

Added alongside `CardRow`, `DepositAccountRow` (mirror their column-for-column approach):

```typescript
export interface UserFinancialProfileRow {
  id: string
  user_id: string
  monthly_income_cents: number
  income_is_variable: boolean
  income_low_estimate_cents: number | null
  housing_type: 'rent' | 'own' | 'family' | 'none'
  housing_cost_cents: number | null
  housing_share_fraction: number       // numeric(5,4) → number
  savings_target_fraction: number      // numeric(5,4) → number
  emergency_fund_level: 'none' | 'under_1m' | '1_3m' | '3_6m' | '6m_plus'
  created_at: string
  updated_at: string
}

export interface UserFixedCostRow {
  id: string
  user_id: string
  label: string
  amount_cents: number
  created_at: string
}

export interface UserCategoryPreferenceRow {
  id: string
  user_id: string
  category_group: string   // CategoryGroupKey — typed at domain layer
  importance: number       // smallint → number; validated 1–5 in domain type
  created_at: string
}
```

### Domain types — `web/lib/types.ts`

Added alongside `Card`, `DepositAccount`, `Budget`:

```typescript
export interface UserFinancialProfile {
  id: string
  user_id: string
  monthly_income_cents: number
  income_is_variable: boolean
  income_low_estimate_cents: number | null
  housing_type: 'rent' | 'own' | 'family' | 'none'
  housing_cost_cents: number | null
  housing_share_fraction: number
  savings_target_fraction: number
  emergency_fund_level: 'none' | 'under_1m' | '1_3m' | '3_6m' | '6m_plus'
  created_at: string
  updated_at: string
}

export interface UserFixedCost {
  id: string
  user_id: string
  label: string
  amount_cents: number
  created_at: string
}

export interface UserCategoryPreference {
  id: string
  user_id: string
  category_group: CategoryGroupKey   // from categories.ts
  importance: 1 | 2 | 3 | 4 | 5
  created_at: string
}
```

`CategoryGroupKey` is already exported from `web/lib/categories.ts` — no new type needed.

### Column projection

The `loadAll` reads for these tables use `select('*')` (acceptable — these are small, bounded tables: 1 profile row, ≤10 fixed cost rows, ≤8 preference rows per user). No column projection needed. Contrast with high-volume `transactions` which projects only needed columns.

### Fail-open group membership

All three new tables join the fail-open group (alongside `goals`, `tags`, `deposit_accounts`). They won't exist on Vercel during the deploy-before-migrate window. The `user_financial_profile` read uses `.maybeSingle()` (returns `null | row`, not an array) so its fail-open assignment is `res.data = null`.

---

## 15. Store / Backend Layer

### New state declarations

After `depositAccounts` state (~line 304 in `web/lib/store.tsx`):

```typescript
const [userFinancialProfile, setUserFinancialProfile] = useState<UserFinancialProfile | null>(null)
const [userFixedCosts, setUserFixedCosts] = useState<UserFixedCost[]>([])
const [userCategoryPreferences, setUserCategoryPreferences] = useState<UserCategoryPreference[]>([])
```

### loadAll additions

Three new reads added to the `Promise.all` array. They are **user-scoped** — use `ownerId` (the `loadAll` parameter that maps to the authenticated user's ID), not `householdId`:

```typescript
// Inside the Promise.all([...]) array:
supabase
  .from('user_financial_profile')
  .select('*')
  .eq('user_id', ownerId)
  .maybeSingle(),                          // returns row | null, not []

supabase
  .from('user_fixed_costs')
  .select('*')
  .eq('user_id', ownerId)
  .order('created_at', { ascending: true }),

supabase
  .from('user_category_preferences')
  .select('*')
  .eq('user_id', ownerId),
```

All three join the fail-open loop. The profile uses `res.data = null` (not `[]`) as its missing-table default:

```typescript
for (const res of [...existing..., userProfileRes, userFixedCostsRes, userCategoryPrefsRes]) {
  if (res.error && missingTable(res.error as { code?: string })) {
    res.data = res === userProfileRes ? null : []
    res.error = null
  }
  orThrow(res)
}

setUserFinancialProfile(userProfileRes.data as UserFinancialProfileRow | null)
setUserFixedCosts((userFixedCostsRes.data ?? []) as UserFixedCostRow[])
setUserCategoryPreferences((userCategoryPrefsRes.data ?? []) as UserCategoryPreferenceRow[])
```

### New actions

**`saveFinancialProfile`** — async upsert, no optimistic update (deliberate form submission, user expects a spinner):

```typescript
const saveFinancialProfile = async (data: Omit<UserFinancialProfile, 'id' | 'created_at' | 'updated_at'>) => {
  const { data: saved, error: e } = await supabase
    .from('user_financial_profile')
    .upsert(
      { ...data, user_id: currentUserId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (e) { setError(e.message); return }
  setUserFinancialProfile(saved as UserFinancialProfileRow)
}
```

Pattern mirror: `addOrUpdateBudget` (lines ~1253–1285 in store.tsx) — same upsert + `.select().single()` + setError flow.

**`saveUserFixedCosts`** — replace-all (delete existing rows, insert new batch). Sequential awaits — NOT fire-and-forget because the two operations must be atomic:

```typescript
const saveUserFixedCosts = async (costs: Array<{ label: string; amount_cents: number }>) => {
  const { error: delErr } = await supabase
    .from('user_fixed_costs')
    .delete()
    .eq('user_id', currentUserId)
  if (delErr) { setError(delErr.message); return }

  if (costs.length === 0) { setUserFixedCosts([]); return }

  const rows = costs.map(c => ({ id: uuid(), user_id: currentUserId, ...c, created_at: new Date().toISOString() }))
  const { error: insErr } = await supabase.from('user_fixed_costs').insert(rows)
  if (insErr) { setError(insErr.message); return }
  setUserFixedCosts(rows as UserFixedCostRow[])
}
```

**`saveCategoryPreferences`** — batch upsert on `(user_id, category_group)` unique constraint:

```typescript
const saveCategoryPreferences = async (prefs: Array<{ category_group: CategoryGroupKey; importance: number }>) => {
  const rows = prefs.map(p => ({ id: uuid(), user_id: currentUserId, ...p, created_at: new Date().toISOString() }))
  const { error: e } = await supabase
    .from('user_category_preferences')
    .upsert(rows, { onConflict: 'user_id,category_group' })
  if (e) { setError(e.message); return }
  setUserCategoryPreferences(rows as UserCategoryPreferenceRow[])
}
```

### AppStateValue interface additions

```typescript
// State (added to AppData, alongside cards, depositAccounts)
userFinancialProfile: UserFinancialProfile | null
userFixedCosts: UserFixedCost[]
userCategoryPreferences: UserCategoryPreference[]

// Actions (added to AppData mutations)
saveFinancialProfile: (data: ProfileInput) => Promise<void>
saveUserFixedCosts: (costs: FixedCostInput[]) => Promise<void>
saveCategoryPreferences: (prefs: CategoryPrefInput[]) => Promise<void>
```

### Algorithm is NOT in the store

`scorePurchase()` is a **pure function** in `web/lib/finance/purchase-advisor.ts`. It is called from the verdict UI component, not from the store. Pattern mirrors `generateInsights()` in `insights.ts` — pure, no side effects, no DB access. The store supplies the data; the component runs the algorithm via `useMemo`.

```typescript
// web/components/purchase-advisor/VerdictStep.tsx
const { userFinancialProfile, userFixedCosts, userCategoryPreferences, transactions, budgets } = useApp()

const derivedProfile = useMemo(
  () => deriveProfile(userFinancialProfile, userFixedCosts, userCategoryPreferences),
  [userFinancialProfile, userFixedCosts, userCategoryPreferences]
)

const result = useMemo(
  () => scorePurchase({ purchaseAmountCents, purchaseCategory, profile: derivedProfile, transactions, budgets, now }),
  [purchaseAmountCents, purchaseCategory, derivedProfile, transactions, budgets]
)
```

This keeps the algorithm vector-lockable and independently testable with no React dependency.

---

## 16. Frontend Layer

### Route structure

The onboarding flow runs before the user has meaningful app data, but it does require authentication. Two approaches:

**Option A (recommended for v1): In-app prompt**
No new route group. When `userFinancialProfile === null`, the Purchase Advisor modal shows a setup screen first. From there, the user taps through to `/settings/financial-profile` (a new settings subpage with the full questionnaire). This reuses the existing `(app)` shell and avoids building a standalone onboarding layout.

**Option B (richer): Dedicated onboarding routes**
A new `(onboarding)` route group with its own layout (no nav bar, progress indicator at top). Redirected to automatically post-signup. More work but a better first-run experience.

Recommendation: **Option A for v1**, Option B as a polish pass once the feature is validated.

### New pages

All under `web/app/(app)/` — client components (`'use client'`), `useApp()` for data, `ReadingColumn` + `PageHeader` layout:

**`web/app/(app)/settings/financial-profile/page.tsx`**

The questionnaire as an update form (not a stepper — single scrollable page when accessed from settings). Structure mirrors `deposit-accounts/page.tsx` but renders form sections instead of a list. Sections match the 5 onboarding screens: Income, Housing, Fixed Costs, Savings, Category Importance.

CTA: "Save profile" → calls `saveFinancialProfile` + `saveUserFixedCosts` + `saveCategoryPreferences` in sequence, shows a spinner during save, navigates back to `/settings` on success.

**`web/app/(app)/settings/page.tsx` addition**

New `LinkRow` entry below "Deposit Accounts":
```tsx
<LinkRow href="/settings/financial-profile" label={t('Financial Profile')} />
```

### New components

All under `web/components/purchase-advisor/`:

**`PurchaseAdvisorCard.tsx`** — home screen entry card

Rendered on the dashboard page between `MonthSummaryCard` and `InsightsCardStack`. Manages `[open, setOpen]` state for the modal. Profile-null state shows a "Set up your profile" CTA instead of "Check a purchase":

```tsx
export function PurchaseAdvisorCard() {
  const { userFinancialProfile, t } = useApp()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card className="p-4">
        <button onClick={() => setOpen(true)} className="w-full text-left ...">
          {userFinancialProfile ? t('Should I buy this?') : t('Set up your financial profile')}
        </button>
      </Card>
      <PurchaseCheckModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

**`PurchaseCheckModal.tsx`** — two-step modal (input → verdict)

Extends the existing `Modal` primitive from `web/components/ui.tsx`. Controls an internal `step: 'input' | 'verdict'` state and holds the draft purchase data between steps:

```tsx
export function PurchaseCheckModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'input' | 'verdict'>('input')
  const [draft, setDraft] = useState<PurchaseDraft | null>(null)

  useEffect(() => { if (open) { setStep('input'); setDraft(null) } }, [open])

  return (
    <Modal open={open} onClose={onClose} title={step === 'input' ? t('Check a purchase') : t('Purchase check')}>
      {step === 'input'
        ? <PurchaseInputStep onCheck={(d) => { setDraft(d); setStep('verdict') }} />
        : <VerdictStep draft={draft!} onLog={onClose} onPass={onClose} onBack={() => setStep('input')} />
      }
    </Modal>
  )
}
```

**`PurchaseInputStep.tsx`** — form fields (item name, amount, category)

Pattern mirrors `AddDepositAccountModal.tsx` — `FormGroup` + `FieldRow` + `TextInput`. Category picker reuses the same category picker component as TxForm. Item name field uses the same `<datalist>` autocomplete pattern from spec 032 (`txSuggest.ts`), scoped to the selected category.

**`VerdictStep.tsx`** — score + charts + bullets + actions

Calls `scorePurchase()` via `useMemo`. Renders:
1. `VerdictBadge` — large score + verdict label
2. `CategoryBudgetBar` — chart 1 (see below)
3. `SpendHistoryChart` — chart 2 (Recharts `BarChart`, dynamically imported)
4. `MonthlyWaterfall` — chart 3 (Recharts stacked `BarChart`, dynamically imported)
5. `SavingsRateIndicator` — chart 4 (text-based, no chart library needed)
6. `InsightBullets` — 2–3 generated sentences
7. Action buttons: "Log purchase" / "Pass on it"

**`VerdictBadge.tsx`**

```tsx
const VERDICTS = {
  go:           { label: 'Looks good',         color: 'text-green-600',  bg: 'bg-green-50' },
  caution:      { label: 'Proceed with care',  color: 'text-yellow-600', bg: 'bg-yellow-50' },
  think_twice:  { label: 'Think twice',        color: 'text-orange-600', bg: 'bg-orange-50' },
  hold_off:     { label: 'Hold off',           color: 'text-red-600',    bg: 'bg-red-50' },
}
```

Score (0–100 integer) shown prominently; verdict label below.

**`CategoryBudgetBar.tsx`** — chart 1

Pure CSS — no Recharts needed. A horizontal progress bar (like `BudgetProgressCard` already uses on the dashboard):
- Gray fill: `spent_so_far / budget_limit` 
- Accent fill overlay: `purchase_amount / budget_limit` (shows how the purchase extends the bar)
- When no budget set: same bar but against 3-month average (`avg_monthly_spend`)
- Label: "You've spent $X of your $Y budget. This purchase uses $Z more."

**`SpendHistoryChart.tsx`** — chart 2

```tsx
import dynamic from 'next/dynamic'
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
// ... ResponsiveContainer, Bar, XAxis, YAxis, Tooltip imported same way
```

One `Bar` per month (up to 6). Current month split into two bars: `spent` (filled) and `this_purchase` (accent/dashed border). X-axis: month abbreviations. Empty state (< 2 months): plain text callout "You'll see your spending trend here as you log more transactions."

**`MonthlyWaterfall.tsx`** — chart 3

Horizontal stacked `BarChart` (single row). Segments:
1. Housing + fixed costs (muted)
2. Other spending this month (neutral)
3. This purchase (accent)
4. Remaining discretionary income (light green)

Requires `userFinancialProfile` for total income. When profile is null: omit this chart entirely (show nothing — the reduced-accuracy banner already explains why some data is missing).

**`SavingsRateIndicator.tsx`** — chart 4

No chart library. Two numbers side by side:

```
Current rate    →    After this purchase
   18%          →       12%  (below your 15% target)
```

Color codes the right number: green if above target, amber if within 5pp, red if below.

**`InsightBullets.tsx`**

Renders 2–3 strings generated by `scorePurchase()`. Uses the same `tr()` pattern as `insights.ts` — template strings with `{0}`, `{1}` positional placeholders, passed through `t()` in the component. Example output:

- `t('You\'ve spent {0} on {1} this month — {2} under your {3} budget.', '$340', 'Groceries', '$60', '$400')`

### Dashboard page wiring

`web/app/(app)/dashboard/page.tsx` mobile stack gets `PurchaseAdvisorCard` inserted:

```tsx
// Mobile layout (current order → new order):
<PageHeader title={t('Dashboard')} />
<ModeSwitch />
<MonthSummaryCard />
<PurchaseAdvisorCard />          {/* NEW */}
<InsightsCardStack />
<BudgetProgressCard />
// ... rest unchanged
```

Desktop (`DashboardDesktop`) gets a matching widget placement — exact position TBD pending the desktop grid layout review (open question §8).

### i18n

All new `t()` calls follow the identity pattern — the English string is the key. No separate key file. New strings added to `web/lib/i18n/bn.ts`, `es.ts`, `ja.ts`, `ko.ts`, `zh.ts`. English falls back automatically (no `en.ts` catalog exists — identity function).

Estimated new keys: ~35 strings covering onboarding screen copy, verdict labels, chart labels, insight templates, action button labels, and settings entry labels. Template strings use `{0}`, `{1}` positional placeholders matching the existing `tr()` shape.

# Financial Health — Feature Planning Document

**Written:** 2026-08-06
**Status:** Planning — decisions locked; feeds `specs/041-financial-health/` (spec-kit)
**Author:** Ayaz Uddin

---

## 1. Overview

Financial Health is a **baseline financial-fitness metric** for a household. When a user first
creates their account they complete a short onboarding questionnaire; from those answers — blended
with their transaction history, budgets, and goals — Ortho computes a single **0–100 health score**
across five dimensions and surfaces it as a **dashboard widget**. Users re-take the questionnaire
from Settings whenever their situation changes, and the widget shows how their score has moved since
their first baseline.

This is deliberately **feature one of two**. It is the foundation the **Purchase Advisor**
(`docs/plan/purchase-advisor.md`) will later build on: the advisor consumes this feature's derived
profile + health metric as the anchor for its per-purchase verdicts. Financial Health ships first
because (a) it is the data foundation the advisor cannot run without, (b) it is independently
valuable and shippable on its own, and (c) it de-risks the hard part — the questionnaire UX and the
credibility of the metric — before we invest in verdict screens and charts.

### Why this works (the data advantage)

Ortho already has the engines this metric composes:

- Budget status with rollover (`web/lib/finance/budgets.ts` → `budgetStatusForMonth`)
- Goal pacing (`web/lib/finance/goals.ts` → `goalPacing` / `goalProgress`)
- Savings rate (`web/lib/reports/savings.ts` → `savingsRate`)
- The planning engine already composes budgets + goals (`web/lib/planning/planSummary.ts`)
- Category taxonomy (`web/lib/categories.ts`, `CategoryGroupKey`)

What we add on top:

- **A financial profile** captured in onboarding (income, housing, fixed commitments incl.
  remittances, safety net, savings intention) + **per-dimension 1–5 importance weights**.
- **A pure health engine** (`web/lib/finance/financialHealth.ts` + a thresholds file) that scores
  five dimensions 0–100 and blends them into a personalized composite.
- **A first-run onboarding flow**, a **Settings edit page**, and a **dashboard widget** (with a
  baseline-vs-now progress story).

---

## 2. Research-driven design constraints (non-negotiable)

Two research docs define our user (`docs/research/finance-habits-budgeting-apps.md`,
`docs/research/market-analysis/nyc-market-language-analysis.md`). Ortho's primary market is
**lower-income, immigrant, no-bank-first** NYC households. Four findings are load-bearing
constraints, not footnotes:

1. **Never shame.** Guilt from "red dashboards" is a top-5 reason people abandon budgeting apps
   ("2–3 months of red → disengage"). For our user, ~52% of immigrant NYC households are
   rent-burdened, bottom-quintile savings rates are ~0 or negative, and 84% of budgeters exceed a
   budget. **A metric calibrated to a middle-class 50/30/20 ideal would rate almost every target
   user "unhealthy" → churn.** The metric measures **stability and direction of travel**, not
   distance from an aspirational ideal. Bands use calm, forward-looking labels; the score renders in
   the sand `--accent` ramp — **never red** (honors the existing "loss/cost is never red"
   constitution).

2. **Works with zero history and no bank.** Manual entry is load-bearing for the ~1-in-5
   unbanked/underbanked target household; the primary user has no transaction history on day one.
   The metric is therefore **profile-first** — fully meaningful from the questionnaire alone.
   History / budgets / goals **sharpen** dimensions but are never a prerequisite; each falls back to
   a supportive neutral when its data is absent.

3. **Be actionable.** "Dashboards show data without telling users what to do" is another top
   abandonment driver. Every score ships with the **single highest-impact next step**, phrased
   encouragingly.

4. **Recognize immigrant money shapes.** Remittances / family support (16% of foreign-born
   noncitizen households send them, with **no home in Ortho's budget model today**), variable income
   (~29% of households), and shared / multigenerational housing are first-class questionnaire
   inputs. (The spec-030 demo household already models a monthly remittance grounded in this exact
   research — we make it a real profile concept.)

---

## 3. The Financial Health metric

A composite **0–100** score built from **five dimensions**, each scored 0–100, each carrying a
**user-set 1–5 importance weight** that personalizes the blend.

| Dimension | Measures | Profile input (day 1) | Sharpened by (when present) |
|---|---|---|---|
| **Cash flow** | Does income cover *actual* spending? | `net_available / income` proxy | recent months' real spend vs income |
| **Safety net** | Resilience to a shock | emergency-fund level chip | emergency/savings goal pacing |
| **Commitment load** | Breathing room after *fixed* costs | `(housing·share + fixed) / income` | recurring-charge reality |
| **Savings momentum** | Any positive saving — *never punished for zero* | stated savings intention | real savings rate + goal contributions |
| **Plan engagement** | Is the user planning at all? | neutral start | budgets set + adherence, goals on-track |

### 3.1 Composite (personalized weights)

```
health = round( Σ(dimensionScore_i × weight_i) / Σ(weight_i) )     // weight_i ∈ {1..5}, default 3
```

The 1–5 sliders set **how much each area counts toward *your* score**. A user grinding to build an
emergency fund can weight Safety net a 5; someone just trying to cover rent can weight Cash flow a
5. All-3 (the default) = equal weighting. This is the locked "slider determines the weight of that
question" mechanic — applied **per dimension**, not per raw question.

### 3.2 Dimension scoring (exact thresholds → `financial-health-thresholds.ts`)

All scores clamp to `[0, 100]`. Supportive floors are deliberate (research constraint #1). `income`
means monthly take-home; a **variable-income** household uses the **low estimate** for every ratio
(cautious by design).

**Cash flow** — `ratio = (income − spend) / income`, where `spend` is the recent-month expense total
from transactions when ≥1 month of history exists, else the profile proxy
`housing·share + Σ fixed` (i.e. committed-only, treated as a floor on spend):
- `ratio ≥ 0.25` → 100
- `ratio ≤ 0` → 25 (floor — "underwater, and here's the first step")
- linear between.

**Safety net** — base from the emergency-fund chip, then add goal pacing:
- `none` → 15 · `under_1m` → 35 · `1_3m` → 60 · `3_6m` → 85 · `6m_plus` → 100.
- If a savings goal exists, add up to +15 for on-pace progress (`goalPacing` not off-track), clamped.

**Commitment load** — `committed = (housing·share + Σ fixed) / income`:
- `committed ≤ 0.50` → 100
- `committed ≥ 0.90` → 20
- linear between. (Housing burden alone can be 50% for the target user; the weight slider lets a
  household de-emphasize a structural cost it cannot change.)

**Savings momentum** — blend intention with actual:
- intention base from `savings_target_fraction`: `0%` → 30 (not punished), `5%` → 50, `10%` → 70,
  `≥15%` → 90.
- when ≥1 month of history: `actualRate = (income − spend)/income`; `actualRate ≥ target` → 100,
  `≤ 0` → 30, linear; final = the higher of intention-base and actual (reward real momentum).

**Plan engagement** — starts at **50** (absence never below neutral — non-planners churn):
- `+15` if ≥1 budget set; `+15` if budgets are mostly on-track (`budgetStatusForMonth` not-over);
  `+10` if ≥1 goal; `+10` if goals on-track. Cap 100.

### 3.3 Bands (calm, never clinical)

| Score | Band label | Tone |
|---|---|---|
| 80–100 | **Strong** | affirming |
| 60–79 | **Steady** | affirming |
| 40–59 | **Building** | encouraging |
| 0–39 | **Getting started** | supportive — "here's your first step" |

No "poor / at-risk / critical." Rendered in the sand `--accent` ramp, like the planning "Left to
plan" hero — not a red/green traffic light.

### 3.4 Live score + baseline snapshots

- **Raw questionnaire answers are stored; the score is computed live** (pure function, `useMemo`) so
  it always reflects current reality (new transactions, new budgets, new goal contributions all move
  it without a re-take).
- A **baseline snapshot** (`{score, band, created_at}`) is written on onboarding completion and on
  each Settings save. The widget shows **"you've moved from Building → Steady since March"** — the
  progress framing the research says motivates this user far more than an absolute number.

---

## 4. Onboarding questionnaire

Short, calm, skippable-to-defaults (onboarding friction = churn). Five sections, each mapping to a
dimension and carrying its 1–5 importance slider. A progress indicator (1/5…5/5); "Skip — use
neutral defaults" on every screen except Income.

| # | Section | Captures | Notes |
|---|---|---|---|
| 1 | **Income** (required) | monthly take-home; variable? → low estimate | calibrate input for lower incomes |
| 2 | **Housing** | rent/own/family/none; cost; shared? → share % | multigenerational reality |
| 3 | **Monthly commitments** | repeatable rows (label + amount + kind) | **remittance / family support** a suggested first-class kind (+ loan, phone, transit, childcare, subscriptions) |
| 4 | **Safety net** | emergency-fund chip (`None yet` first) | non-judgmental scale |
| 5 | **What matters to you** | the 1–5 importance sliders per dimension | replaces the old category-only importance screen |

**Completion** writes the profile + fixed costs + weights and the first baseline snapshot, then
lands the user on the dashboard with the widget populated.

---

## 5. The algorithm (pure engine)

`web/lib/finance/financialHealth.ts` — a **pure, deterministic** function mirroring `insights.ts` /
`goals.ts` (no React, no DB, `now` injected). Thresholds isolated in
`web/lib/finance/financial-health-thresholds.ts` so calibration is a data edit, not a logic change.

```typescript
interface FinancialHealthInput {
  profile: DerivedFinancialProfile | null   // null → profile-null neutral mode
  transactions: Transaction[]               // recent months (expenses drive Cash flow / Savings)
  budgets: Budget[]
  goals: Goal[]
  contributionsByGoal: Record<string, GoalContribution[]>
  weights: Record<HealthDimension, number>  // 1..5, default 3
  now: Date
}

interface FinancialHealthResult {
  score: number                             // 0..100 composite
  band: HealthBand                          // 'strong' | 'steady' | 'building' | 'getting_started'
  dimensions: Array<{ key: HealthDimension; score: number; weight: number }>
  topAction: HealthAction                   // the single highest-impact next step (templated, tr())
}
```

`DerivedFinancialProfile` (computed at query time from the stored raw answers, **not** persisted):
`net_available_cents`, `committed_cents`, `savings_target_cents`, `income_for_ratios_cents` (low
estimate when variable), `emergency_fund_level`. Derivation mirrors the purchase-advisor plan's
"what we derive" table.

**Profile-null mode:** if the user skipped onboarding entirely (`profile === null`), the three
profile-driven dimensions fall back to a neutral 50 and the widget shows a "Set up your profile for
a meaningful score" CTA. Deliberately a thinner experience to encourage completion.

**Action selection:** pick the lowest-scoring dimension (by weighted contribution) and emit its
templated next-step string (e.g. Safety net → "Start an emergency fund goal — even $10/week
builds a cushion"). Encouraging, never scolding.

---

## 6. Data model

Four new tables. Profile data is **user-scoped** (one profile per Ortho account — RLS
`user_id = auth.uid()`), unlike household-scoped `cards`/`budgets`. Migration file
`supabase/migrations/<TS>_financial_health_profile.sql`, timestamp **> the latest
(`20260730120000`)**, all four tables in one file, each with the full 4-policy RLS block.

- **`user_financial_profile`** (one row/user, `UNIQUE(user_id)`): `monthly_income_cents`,
  `income_is_variable`, `income_low_estimate_cents?`, `housing_type ∈ {rent,own,family,none}`,
  `housing_cost_cents?`, `housing_share_fraction` (numeric(5,4) default 1.0),
  `savings_target_fraction` (numeric(5,4) default 0.10),
  `emergency_fund_level ∈ {none,under_1m,1_3m,3_6m,6m_plus}`, `created_at`, `updated_at`.
- **`user_fixed_costs`** (0-many/user): `label`, `amount_cents (>0)`,
  `kind text default 'other'` (suggested: `remittance`, `loan`, `phone`, `transit`, `childcare`,
  `subscription`, `other`), `created_at`.
- **`user_dimension_weights`** (one row/user/dimension, `UNIQUE(user_id, dimension)`):
  `dimension text`, `weight smallint default 3 CHECK (weight BETWEEN 1 AND 5)`, `created_at`.
- **`financial_health_snapshots`** (append-only, many/user): `score smallint (0..100)`,
  `band text`, `created_at`.

**Row + domain types** (`web/lib/supabase/rows.ts` ↔ `web/lib/types.ts`, kept in lockstep): a
`*Row` per table mirroring columns, then a domain type per the store recon patterns.

---

## 7. Store / backend layer (`web/lib/store.tsx`)

Mirrors the deposit-accounts / goals patterns exactly (store recon in hand).

- **State:** `userFinancialProfile: FinancialProfile | null`, `userFixedCosts: FixedCost[]`,
  `userDimensionWeights: DimensionWeight[]`, `healthSnapshots: HealthSnapshot[]`.
- **`loadAll`:** four new reads added to the `Promise.all`, scoped by **`ownerId`** (user, not
  household). All four **join the fail-open group** (missing table → empty / null) — mandatory or
  they take bootstrap down in the deploy-before-migrate window. The profile read uses `.maybeSingle()`
  (row | null); its fail-open default is `null`, the others `[]`.
- **Actions** (async, no optimistic spinner-free — deliberate form submissions):
  `saveFinancialProfile(input)` (upsert on `user_id`), `saveFixedCosts(costs)` (replace-all:
  delete-then-insert), `saveDimensionWeights(weights)` (batch upsert on `user_id,dimension`),
  `writeHealthSnapshot(score, band)` (insert). A single `saveFinancialHealth(...)` orchestrator
  calls all four in sequence for the questionnaire submit.
- **The engine is NOT in the store.** `scoreFinancialHealth()` is a pure function called from the
  widget/detail component via `useMemo`, exactly like `generateInsights` / `planSummary`. The store
  supplies raw data; the component derives the profile and runs the engine.

---

## 8. Frontend

### 8.1 First-run onboarding

A dedicated, minimal flow (locked decision — this is the flagship first-run). Because the app is a
**static export with no dynamic routes and no `useSearchParams`**, and the shell already gates on
auth in `(app)/layout.tsx`, the flow is a **client-gated step sequence** rendered when
`userFinancialProfile === null` and the user has not dismissed it — implemented as its own route
under `(app)` (e.g. `app/(app)/welcome/financial-profile/`) with a slim header + progress dots
(no board chrome), reached automatically after bootstrap for a profile-less user. Each screen is a
propless client component reading/writing via `useApp()`. "Skip — use neutral defaults" writes
defaults and a baseline snapshot so the widget still works.

### 8.2 Settings edit

`app/(app)/settings/financial-profile/page.tsx` — the same questionnaire as a **single scrollable
form** (not a stepper), mirroring `settings/deposit-accounts/page.tsx` structure. Sections = the 5
onboarding screens. "Save" runs `saveFinancialHealth(...)`, writes a fresh baseline snapshot, and
returns to `/settings`. A new `LinkRow` on `settings/page.tsx` ("Financial Profile").

### 8.3 Dashboard widget

A registered widget in the spec-034 system: registry entry in `web/lib/widgets/registry.tsx`, a
**propless** body `web/components/widgets/bodies/FinancialHealthBody.tsx` reading `useApp()` (and,
where relevant, `useDashboardScopeContext()`). It shows: band label + score (sand ramp, never red),
the baseline-vs-now delta if a snapshot history exists, and the single `topAction`. Profile-null
state shows the "Set up your financial profile" CTA linking to the onboarding/settings flow. Toggle
on/off in Settings › Widgets like every other widget. The card is a click target → the shared
`Drawer` shows the per-dimension breakdown. (The Purchase Advisor later registers as a *second*
widget reading this same engine's derived profile.)

---

## 9. i18n

All new UI strings are `t()` calls where **the English string is the key** (there is **no `en.ts`**;
5 catalogs `bn/es/ja/zh/ko`, dynamically imported). New keys added to all five catalogs; English
falls back automatically. Action/insight templates use positional `{0}` placeholders via the same
`tr()` shape as `insights.ts`. Estimated ~35 keys: onboarding screen copy, dimension + band labels,
action templates, settings labels, widget copy.

---

## 10. Testing strategy (TDD)

Fully test-driven. Tiers:

- **Engine unit tests** (`web/test/financial-health.test.ts`, node): independently-derived expected
  values (the launder-proof tier, like `finance-goldens.test.ts`) covering each dimension's
  thresholds, supportive floors, profile-null neutral mode, no-history fallbacks, band boundaries,
  the personalized-weight composite (incl. all-3 default), and `topAction` selection.
- **Properties test:** score always in `[0,100]`; band monotonic with score; weight symmetry;
  variable-income uses the low estimate. Pinned by unit tests, **not** a golden vector (following the
  spec-034 precedent for `housing-summary`/`spendHeatmap` — new pure roll-ups pinned by unit/
  integrity tests, avoiding `gen:vectors` wiring). `financial-health-thresholds.ts` holds the
  constants the tests reference.
- **Store test:** fail-open on missing tables (PGRST205/42P01), `saveFinancialHealth` sequence,
  snapshot write.
- **Component tests** (jsdom): onboarding step flow (skip writes defaults), settings form save, the
  widget's profile-null vs scored states + baseline delta.
- **Guard/registry test:** the widget registers and toggles; i18n catalog parity for the new keys.

`npx tsc --noEmit` must stay clean (run **unpiped** — never through `head`/`grep`). Full
`npm test` green.

---

## 11. What already exists (do not rebuild)

| What | Where | Reuse |
|---|---|---|
| Budget status + rollover | `web/lib/finance/budgets.ts` | Plan-engagement + Commitment-load |
| Goal pacing / progress | `web/lib/finance/goals.ts` | Safety-net + Savings-momentum |
| Savings rate | `web/lib/reports/savings.ts` | Cash-flow + Savings-momentum |
| Budgets+goals composition | `web/lib/planning/planSummary.ts` | reference pattern for the health engine |
| Category groups | `web/lib/categories.ts` (`CategoryGroupKey`) | commitment categorization |
| Widget registry + propless bodies | `web/lib/widgets/registry.tsx`, `components/widgets/bodies/` | the dashboard widget |
| Dashboard scope | `lib/widgets/DashboardScopeContext.tsx` | shared month/range |
| `loadAll` fail-open (PGRST205) | `web/lib/store.tsx` | the 4 new tables |
| `tr()` templated i18n | `web/lib/finance/insights.ts` | action templates |
| Modal/form primitives | `web/components/ui.tsx`, `AddDepositAccountModal.tsx` | questionnaire fields |
| Loading skeleton | `components/skeletons/RouteSkeleton.tsx` | onboarding/settings route shape |

---

## 12. Implementation phases (TDD throughout)

| Phase | Scope | Depends on |
|---|---|---|
| P1 Foundation | migration (4 tables + RLS), `*Row` types, domain types, store state + fail-open reads + save actions | — |
| P2 Engine | `financialHealth.ts` + thresholds + derive-profile helper; full unit/property tests (written first) | P1 types |
| P3 Onboarding | dedicated first-run flow (5 screens, skip-to-defaults, baseline snapshot) | P1 store |
| P4 Settings | `settings/financial-profile` form + settings LinkRow | P1 store |
| P5 Widget | registry entry + `FinancialHealthBody` (scored / profile-null / baseline delta) | P2 engine, P1 store |
| P6 i18n | 5 catalogs, ~35 keys | P3–P5 |
| P7 Polish | topAction copy, empty states, drawer breakdown, docs update | P5 |

P1→P2 and P1→P3/P4 can run in parallel (shared types, different files).

---

## 13. Locked decisions

1. **Split** — Financial Health ships first; Purchase Advisor is a follow-up that consumes this.
2. **Weight mechanic** — 1–5 sliders set **per-dimension weights** in the composite (personalized).
3. **Five dimensions** — Cash flow · Safety net · Commitment load · Savings momentum · Plan
   engagement.
4. **Onboarding** — dedicated minimal first-run flow + Settings re-take.
5. **Baseline snapshots in v1** — enables the "you improved" progress story.
6. **Remittances** — first-class `kind` on fixed costs (immigrant-money-shape awareness).
7. **Surface** — a dashboard widget (no new nav destination).
8. **Never red / never shaming** — sand ramp, supportive floors, actionable next step.
9. **Profile-first** — meaningful from the questionnaire alone; history/budgets/goals sharpen.
10. **Engine pinned by unit tests**, not a golden vector.

---

## 14. Deferred (explicitly out of scope for this spec)

- **Purchase Advisor** (`docs/plan/purchase-advisor.md`) — the per-purchase verdict workflow; builds
  on this feature's derived profile + engine.
- **Household-income mode** — profile is per-user for v1; a shared-household income path is a later
  question.
- **Health trend chart** — v1 shows a first-vs-latest delta; a full snapshot time-series chart can
  come later.
- **Category-importance granularity** — the old plan's per-group importance folds into the Purchase
  Advisor, not this metric.

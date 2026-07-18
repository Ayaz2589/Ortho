# How Real Households Actually Behave With Money — Research for Ortho's Seed-Data Generator

**Purpose.** Ortho's seed-data generator must populate demo/test databases with data that looks
like *real* household finances, not an idealized "happy path." This report gathers survey,
government, academic, and (clearly-labelled) vendor data on how US households actually spend,
budget, over-spend, split money, and abandon budgeting apps — biased throughout toward **concrete
numbers a deterministic generator can consume** (ranges, distributions, frequencies) and toward the
**realistic messiness** the founder asked for.

**Scope & date.** Compiled July 2026. US-centric unless flagged. "Encodable" boxes give suggested
generator parameters; they are engineering recommendations synthesized from the cited data, not
themselves survey findings.

**Source-type tags used throughout:** `GOV` (government/central-bank), `ACAD` (academic/peer-review),
`SURVEY` (independent or association survey), `VENDOR` (vendor/marketing — directional only),
`JOURN` (journalism reporting others' data). **Confidence:** H / M / L.

> **The single most important modeling insight:** financial stress is **heavy-tailed**, not
> uniform. A minority of households drive most overdrafts, most revolving debt, and most repeated
> shocks; most category-months are fine but a meaningful slice blow through budget. Encode a
> **skewed distribution with a fat unhappy-path tail**, not a population that is uniformly stressed
> and not one that is uniformly fine.

---

## 1. Executive summary (decision-relevant findings)

1. **Housing + transportation ≈ half of all spending.** BLS CE 2023/2024: housing ~33%,
   transportation ~17%, food ~13% (groceries ~8%, dining ~5%), personal insurance/pensions ~12%,
   healthcare ~8%, entertainment ~5%, apparel ~2.6%. `GOV/H`
2. **Category shares are strongly income-dependent.** Low-income households over-weight necessities
   (housing 41% vs 29% for high-income; groceries, utilities, gasoline, healthcare all regressive);
   high-income over-weight savings/pensions, dining, entertainment, education. Make income tier a
   first-class driver. `GOV/H`
3. **US savings rate is low and should look low.** ~4–5% of disposable income (2024–2025), and
   **negative for the bottom quintiles**. The 50/30/20 "20% savings" ideal is *not* what real data
   shows. `GOV/H`
4. **Over-budget is the norm, not the exception.** ~74% keep a budget; **84% of budgeters have
   exceeded it**; ~16% overspend "often." Worst categories: **groceries (47%) and dining out (34%)**.
   No published overshoot *magnitude* exists — synthesize it. `SURVEY/H`
5. **Income is volatile for a large minority.** ~29% of adults have month-to-month income that
   varies; the **median household sees ~36% month-to-month income change**; ~41% experience a
   >30% swing at least once a year. `GOV/H` + `VENDOR-DATA/M`
6. **Budgets get abandoned fast.** Only **~29% actually review** their budget in a given month and
   **73% don't regularly follow one**; budgeting-app 30-day retention is roughly **4–12%**. Model
   engagement that decays sharply after 2–4 weeks. `SURVEY/H` + `VENDOR/M`
7. **~1 in 4 transactions is mis/uncategorized out of the box**, concentrated on utilities, fees,
   transfers, and rare merchants; big recurring merchants are near-perfect. Leave a persistent
   uncategorized tail. `ACAD/M` + `VENDOR-blog/L`
8. **Subscription creep is real and under-perceived.** People self-report **~$86/mo** but actually
   spend **~$219/mo**; **42% forgot** an active subscription. Household sub counts span ~4–12
   depending on definition. `VENDOR/M` (single 2022 survey — see caveat)
9. **Financial fragility is baked in.** **37% couldn't cover a $400 shock** entirely with cash; 13%
   couldn't at all; **59% can't cover a $1,000 emergency** from savings; 27% have **zero** emergency
   savings. ~26% of households overdraft yearly; ~half of card-holders carry a balance. `GOV/H`,
   `SURVEY/H`
10. **Couples increasingly keep money separate**, and younger = more separate (keep some money
    separate: Gen Z 88% → Boomers 52%). Split methods cluster around 50/50 and proportional-to-income;
    "one pays then settles up" has **no clean survey number** — model it as a behavior, not a category.
    `GOV/H`, `SURVEY/H`
11. **Transaction volume anchor:** ~48 payments/person/month (~31 by card); **~10–15 recurring
    charges/month** (minority of *count*, larger share of *value*); ~40–65 distinct merchants per
    person per year. Double roughly for a two-person household. `GOV/H`, `VENDOR/M`
12. **Seasonality and shocks are predictable overlays:** Nov–Dec holiday (+~$900/person), Jul–Aug
    back-to-school (+~$875/family), plus random car-repair (~$500–1,000) and medical (~$500 typical,
    $2,000+ tail) shocks. `SURVEY/H`

---

## 2. Category spending distributions

**Anchor dataset:** BLS Consumer Expenditure Survey (CE), 2023 (released Sep 2024), Table 1101 by
income quintile, plus 2024 news-release point figures. `GOV/H`. Per-household dollar figures were
recomputed from the primary aggregate tables and validated against BLS's published all-household
total (computed $77,272 vs official $77,280).

**Reference frame (2023):** mean income before tax **$101,805**; mean annual spending **$77,280**
(2024: **$78,535**). Quintile before-tax income bounds: Q1 <$28,262 · Q2 $28,262–54,553 ·
Q3 $54,553–90,239 · Q4 $90,239–148,682 · Q5 >$148,682.

### 2.1 Share of total spending (stable allocation baseline — recommended for the generator)

Share-of-*spending* is far more stable than share-of-*income* (the lowest quintile spends >200% of
reported income due to dissaving/transfers), so **use these for category allocation** and apply the
income-tier drift.

| Category | Q1 (low) | All households | Q5 (high) | Direction across tiers |
|---|---:|---:|---:|---|
| Housing (incl. utilities, furnishings) | 41% | **33%** | 29% | ↓ regressive |
| Transportation | 14.5% | **17%** | 17% | ~flat / ↑ mid |
| — Gasoline/fuel | (high) | ~2.6% of spend | (low) | ↓ regressive |
| Food total | 15.7% | **13%** | 11% | ↓ |
| — Groceries (food at home) | 11.0% | **7.8%** | 6.1% | ↓ regressive |
| — Dining out (food away) | 4.7% | **5.0%** | 5.2% | ~flat |
| Utilities | 8.7% | **6.0%** | 4.3% | ↓ regressive |
| Healthcare | 10.4% | **8.0%** | 6.4% | ↓ regressive |
| Personal insurance & pensions (savings-like) | 2.1% | **12.4%** | 17.7% | ↑ **rises with income** |
| Entertainment | 4.3% | **4.7%** | 5.3% | ↑ mild |
| Apparel | 2.8% | **2.6%** | 2.6% | ~flat |
| Personal care | 1.3% | **1.2%** | 1.1% | ~flat |
| Education | 2.1% | **2.1%** | 3.2% | ↑ at top |

### 2.2 Share of pre-tax income (burden view — use for realism of stress, not allocation)

| Category | Q1 low* | Q3 middle | Q5 high | All |
|---|---:|---:|---:|---:|
| **Total outlays / income** | 217%* | 92% | 57% | 76% |
| Housing (total) | 90%* | 32% | 17% | 25% |
| Utilities | 19%* | 6.4% | 2.4% | 4.5% |
| Groceries | 24%* | 8.1% | 3.5% | 5.9% |
| Dining out | 10%* | 4.5% | 2.9% | 3.9% |
| Transportation | 32%* | 17% | 9.6% | 13% |
| Healthcare (incl. premiums) | 23%* | 8.1% | 3.6% | 6.0% |
| Entertainment | 9.3%* | 3.8% | 3.0% | 3.6% |
| Retirement/pension + SS (forced savings) | 4.6% | 8.4% | 10.1% | 9.4% |

\* Q1 ratios are inflated by dissaving (spending exceeds reported income) — treat as **directional
only**; for low-income allocation use §2.1 share-of-spending, not these.

### 2.3 Typical MONTHLY dollar ranges — middle-income household

Q3 (middle quintile, ~$71k pre-tax, total outlays **$5,450/mo**). Range column spans Q2→Q4 ("broad
middle class").

| Category | Q3 middle ($/mo) | Middle-class range ($/mo) |
|---|---:|---:|
| **Total outlays** | 5,450 | 4,080 – 7,310 |
| Housing (total) | 1,890 | 1,555 – 2,330 |
| — Shelter (rent or mortgage+) | 1,150 | 935 – 1,370 |
| — Utilities | 375 | 330 – 440 |
| Groceries | 475 | 390 – 575 |
| Dining out | 270 | 200 – 385 |
| Transportation (all) | 995 | 650 – 1,330 |
| — Gasoline/fuel | 225 | 180 – 280 |
| — Vehicle insurance | 150 | 115 – 185 |
| — Vehicle purchase (amortized) | 400 | 200 – 555 |
| Healthcare (incl. premiums) | 480 | 405 – 585 |
| Entertainment | 225 | 185 – 320 |
| Apparel | 135 | 105 – 205 |
| Personal care | 73 | 53 – 93 |
| Retirement/pension + SS | 495 | 220 – 990 |
| Cash gifts/charity | 153 | 120 – 200 |

**Use real conditional housing payments, not the CE population average** (CE dilutes rent across
owners who pay $0, and its "mortgage" line excludes principal). Census ACS 2024 `GOV/H`:

- **Median gross rent: $1,487/mo** — renters' median = **31% of income**; **49.4% of renters are
  cost-burdened** (>30% of income on housing).
- **Median owner-with-mortgage cost: $2,035/mo** — median = **21.4% of income**; 23.9% of owners
  cost-burdened.

### 2.4 Savings rate, debt service, and the 50/30/20 gap

- **Personal savings rate (BEA/FRED, % of disposable income):** 2024 ≈ **4.6%**, 2025 ≈ **4.4%**,
  dipping to ~2.6% in early 2026. Practical 2020s band **3–6%**. Historical extremes: record high
  **31.8%** (Apr 2020), record low **1.4%** (2005). **Bottom quintiles ≈ zero or negative.** `GOV/H`
- **Household debt-service ratio (Fed DSR):** total **~11.0–11.3%** of disposable income, split
  ~5.8% mortgage + ~5.3% consumer. Pre-2008 peak ~15%. `GOV/H`
- **Underwriting guidelines (normative):** 28/36 rule (housing ≤28% gross, all debt ≤36%); QM
  historically capped 43% DTI, practice now approves 45–50% with compensating factors. `JOURN/M`
- **50/30/20 reality gap:** the "20% to savings" ideal contradicts the ~4–6% actual net saving rate
  and ~half of renters spending >30% on housing alone. Encode the *ideal* as the budget the user
  *sets*, and actual behavior that **misses it** most months — that mismatch is the product's whole
  point. Specific per-tier 50/30/20 splits circulating online (e.g. "needs ≈ 80% of take-home") are
  **`VENDOR/L` — do not encode as authoritative.**

---

## 3. The "unhappy path" scenario taxonomy

Each row is a named, encodable scenario. Prevalence = how common; parameters = suggested generator
distributions synthesized from the cited data. Sources & confidence in §7.

| # | Scenario | Prevalence | Concrete generator parameters |
|---|---|---|---|
| U1 | **Over-budget category month** | 84% of budgeters exceed *sometime*; 16% *often* | Each category-month has an overspend hazard; make ~15–20% of household-months "chronic overspend." Overshoot magnitude is **unpublished → synthesize +5% to +30% over cap**, fatter right tail on dining/discretionary. Category weights: groceries 1.4×, dining 1.0×, entertainment 0.7× relative overshoot propensity. |
| U2 | **Variable / irregular income** | ~29% of households income varies month-to-month; ~20% do some gig work | Flag ~29% of households "variable income." For them: monthly income multiplier ~N(1.0, swing) with swing centered **9–15%**; **1 in 4 months** a swing ≥ **±20–30%**; the median volatile household sees ~36% month-to-month change. Gig/seasonal: add periodic zero/low-income months. |
| U3 | **Budget abandonment / drift** | Only ~29% review monthly; 73% don't regularly follow | Model logging/engagement decay: front-load activity, then after **2–4 weeks** drop logging frequency sharply; ~70% of "budgeters" stop actively reviewing within a month; a ~27% cohort stays engaged. Leaves stale categories and half-finished budgets. |
| U3b | **App churn trace** | Budgeting-app D30 retention ~4–12% | For synthetic usage traces: ~70–80% of installs go inactive within 30 days; engaged minority persists. Banking-style (direct-deposit-linked) retains ~10–12% D30; pure budgeting ~4–6%. |
| U4 | **Uncategorized / miscategorized txns** | ~20–30% wrong out-of-box | ~20–30% of transactions land in wrong/null category before correction. Error by merchant type: rare/one-off & ambiguous online 40–60% wrong; utilities/fees/transfers ~40–60% wrong; big recurring merchants 1–5% wrong. Keep a **persistent 5–10% "uncategorized" tail** that never gets cleaned (models abandonment). |
| U5 | **Subscription creep** | ~4–12 subs/household; 42% forgot one | Give each household **8–15 recurring subs** (streaming/news/cloud/app/gym), flag **~40% "forgotten/unused."** Make the tracked total run **~2.5× a naive user estimate** (self-report ~$86/mo vs actual ~$219/mo). Small $5–20 charges dominate; add occasional silent price-creep on existing subs. |
| U6 | **Overdraft / NSF** | ~26% of households ≥1/yr; heavy-tailed | ~25–27% of households have ≥1 overdraft/year (income-skewed: 34% for <$65k vs 10% for >$175k). Fee ~**$27–35**. A small subset (~7–9% of accounts) overdrafts **10+ times/yr** (~$380/yr) and drives ~75% of all fees — encode this fat tail explicitly. |
| U7 | **Carried credit-card debt / min payment** | ~46–50% carry a balance | ~half of card-holding households carry a **revolving balance ~$6,700** (range $3k–15k). Of revolvers, **~10–20% pay only the minimum**. Add occasional 30-day-late events (~3.5% of balances) and late fees. |
| U8 | **$400 / $1,000 shock fragility** | 37% can't cover $400 w/ cash; 59% can't cover $1,000 | ~37% of households cannot absorb a $400 shock from cash and ~13% cannot at all → when a shock lands, those households show borrowing / overdraft / negative-balance / revolving-debt behavior. ~45% lack a 3-month emergency buffer; 27% have zero emergency savings. |
| U9 | **Impulse / spike spending** | ~$282/mo avg (volatile) | Sprinkle frequent small impulse buys: **~9–10/month at ~$28–30 each** (~$250–320/mo aggregate; the annual figure swings $150–318 across years — model as a **distribution, not a constant**). Categories: apparel, food/grocery, household goods; ~half triggered by social media. |
| U10 | **Seasonal spikes** | Holiday ~$902/person; B2S $875–$1,365/family | Overlay seasonal multipliers: **Nov–Dec** holiday (+~$641 gifts + ~$261 seasonal ≈ +$900/person, concentrated but starting Oct); **Jul–Aug** back-to-school (+~$875 K-12 / +~$1,365 college per family). Smaller bumps for other holidays. |
| U11 | **Expense shocks (medical, car)** | Car: 1-in-3 can't afford; Medical: 39%/yr surprise bill | Random hazards: **car repair** ~$500–1,000 (a third of households would go into debt for it), roughly annual hazard; **medical** unexpected bill ~40%/yr hit rate, ~50% under $500, **13% ≥ $2,000** (fat tail). Route the shock to overdraft/credit for fragile households (see U8). |
| U12 | **Paycheck-cycle spending** | 34–77% "paycheck to paycheck" (definition-sensitive) | Shape daily discretionary spend as a **decaying curve within each pay period**: spike at payday (~+30%), taper to a pre-payday trough with rising probability of overdraft/skipped-spend in the final days. Apply to biweekly/semi-monthly cycles. Flag ~40–65% of households with little end-of-cycle buffer. |

**Encoding note on U1 (overshoot magnitude):** Multiple sources confirm *that* households overspend
and *which* categories, but **no survey publishes by how much**. This is a genuine data gap — the
generator must invent the magnitude distribution. The +5%–+30% suggestion is a defensible synthetic
default, not a cited figure; state it as an assumption.

---

## 4. Household / couple expense-splitting reality

Ortho is a household-of-two app, so this is central. **Big caveat:** couples-money surveys diverge
wildly (20+ points) because samples differ (married-only vs all committed couples), questions differ
(account *ownership* vs how expenses are *split*), and age composition dominates the spread. Encode
**age/generation as a first-class driver.**

### 4.1 Account structure (merged vs hybrid vs separate)

| Model | US Census SIPP 2023 (married only) `GOV/H` | Bankrate 2024 (all committed couples) `SURVEY/H` |
|---|---:|---:|
| Fully merged (joint only) | **40%** | 38% |
| Hybrid (joint + separate) | 17% | 34% |
| Fully separate (no joint) | 23% | 27% |
| "Keep at least some separate" | — | **62%** |

Trend: fully-merged is **declining** (married couples 53% in 1996 → 40% in 2023); hybrid and fully-
separate are rising. Unmarried couples: only ~16% have any joint account.

**Suggested default distribution for a two-person household:** merged **38–40%** / hybrid
**17–34%** / separate **23–27%**, shifted by generation (below).

### 4.2 Generational gradient (keep at least some money separate) `SURVEY/H`

| Gen Z | Millennials | Gen X | Boomers |
|---:|---:|---:|---:|
| **88%** | 70% | 59% | 52% |

Nearly linear; make "probability a couple keeps some money separate" scale with youth.

### 4.3 Split method: even 50/50 vs proportional-to-income

- **50/50 even split:** ~39% of married millennials/Gen Z; but **~50% do *not* split rent/mortgage
  equally.** `SURVEY/M`
- **Proportional-to-income:** rising, especially younger and where incomes differ. Gen Z: 40% favor
  proportional vs 31% who call 50/50 fair. `SURVEY/M`
- **Opinion ≠ practice** (UK YouGov, n=1,254, `SURVEY/H` for UK): 48% *think* proportional is
  fairest but only 38% *do* it; 46% actually split 50/50; where incomes are similar, 69% go 50/50;
  even when one earns "a lot more," 25% still split 50/50.
- **"One pays, then gets reimbursed / settles up":** **no clean survey prevalence** — it isn't a
  standard survey category. Model it as a **behavior layered on hybrid/separate couples** (one member
  fronts shared costs, periodic settle-up), not as a distinct account structure. `L`

### 4.4 Splitwise / settle-up behavior

Splitwise is the reference for shared-expense tracking, but **hard cadence/balance data is not
published.** Only scale metrics exist: **20M+ users, 170+ countries, $100B+ shared expenses**
(`VENDOR/M`). No public distribution of settle-up frequency or how long balances linger. Its
debt-simplification nets pairwise balances so a group settles in one transfer; balances persist and
accumulate until a manual "settle up."

> **Encodable assumption (state as assumption, not data, `L`):** shared expenses accrue
> continuously; balances persist **days-to-weeks**; settle-up is **episodic** — e.g. monthly around
> payday or when the running balance crosses a threshold (say $100–300). Leave some couples with a
> **lingering non-zero balance** most of the time (realistic messiness).

---

## 5. Transaction cadence & volume guidance

| Metric | Value | Source | Conf. |
|---|---|---|---|
| Total payments / person / month | **~48** (17 credit, 14 debit, 7 cash, 6 ACH, 1 check, 2 other) | Fed Diary of Consumer Payment Choice 2024 `GOV` | H |
| Card payments / person / month | **~31** (cards = ⅔–¾ of count) | Fed Diary `GOV` | H |
| Debit txns / month (active cardholders) | **~34.6** (30.7 POS + transfers + ATM) | PULSE 2024 Debit Issuer Study `VENDOR` | M-H |
| Distinct *retailers* / year / household | **~39** (retail only — excludes restaurants, services, bills) | Circana 2025 `VENDOR` | M-H |
| Distinct *merchants* / person | ~64 over 6 months (broader than retailers) | ACAD visitation-patterns dataset | M |
| Recurring charges / month | **~10–15** (subs + rent/utilities/insurance/loans) | inferred | L |
| Recurring share of transaction *count* | **~20–30%** | inferred | L |
| Recurring share of transaction *value* | larger than count share (rent/insurance are big) | inferred | L |

**Encodable guidance for a two-person household:**
- **~60–100 transactions/month total** (roughly 2× the per-person ~48, minus shared-merchant
  overlap). Split between the two members plus a shared bucket.
- **~10–15 recurring charges/month** (rent/mortgage, utilities ×2–4, insurance, phone, internet,
  8–15 subscriptions, loan/card payments) — few in count, large in dollar value.
- **~40–80 distinct merchants per member per year**; heavy repetition on a small core (grocery
  store, gas station, coffee, Amazon, streaming) and a long tail of one-off merchants.
- Merchant repetition: a handful of merchants recur many times/month (grocery, transit, coffee);
  most merchants appear once or twice. Model a **power-law merchant-frequency distribution.**

---

## 6. Why people abandon budgeting apps (friction taxonomy)

Informs empty-states, onboarding, and realistic "half-set-up" seed accounts. Ranked by how
universal the complaint is; retention numbers are the weakest tier (vendor/blog, internally
contradictory — lean on the survey-based behavioral drift stats instead).

1. **Broken bank sync / aggregator breakage** — the single most universal aggregator complaint.
   ~34% of Plaid connections need re-auth within 90 days; when sync breaks, a large share stop using
   the app rather than reconnect. `VENDOR/M`
2. **Manual-entry fatigue** — manual apps churn far faster than auto-sync; free tiers that require
   manual entry (e.g. EveryDollar free) feel "tedious within a week." `VENDOR/L`
3. **Cost / no free tier** — YNAB **$109/yr**, 34-day trial, **no permanent free plan**; Monarch &
   Copilot also no free tier. Rocket Money's bill-negotiation success fee (35–60% of first-year
   savings) draws complaints. `JOURN/M`
4. **Complexity / learning curve** — YNAB takes 2–4 weeks to learn (esp. credit-card handling); a
   top reason users quit before seeing value. `JOURN/M`
5. **Guilt / shame from red dashboards** — over-budget red states create a guilt cycle; "2–3 months
   of red → disengage." (Directly relevant to Ortho's calm, non-judgmental design thesis.) `VENDOR/L`
6. **Low actionable guidance** — dashboards show data without telling users what to do next. `VENDOR/L`
7. **Cancellation friction / dark patterns** — Rocket Money BBB: 261 complaints, only ~21.5%
   resolved satisfactorily; 2FA lockouts, surprise fees. `JOURN/M`
8. **Reliance on free services (shutdown risk)** — see Mint below. `JOURN/H`

**The Mint case study (`JOURN/H`).** Intuit shut down Mint on **March 23, 2024**, after 17 years and
~**25M lifetime users** (~3.6M active as of 2021). Reason: a *free* aggregation app is structurally
unprofitable — Plaid/Finicity data fees exceed ad/referral revenue — so Intuit consolidated onto
Credit Karma (acquired 2020 for $8.1B) to cross-sell. Migration was **hard, not a linking**: only the
login moved; **transaction history, custom categories, budgets, goals, bill reminders were not
migrated**, and all Mint data was deleted after the cutoff. Lessons for Ortho: (a) budgeting data is
sticky and users grieve its loss — good export/portability matters; (b) an ad/referral model creates
misaligned incentives; (c) Credit Karma lacked budgeting parity (no custom categories, no expense
splitting, stale balances, couldn't combine household accounts) — exactly the household-of-two,
calm-money niche Ortho targets.

**Per-app one-liners (for seed realism / competitive framing):** Mint = dead (free-service peril);
YNAB = cost + learning curve, claims new users save $600 in 2 months / $6,000 in year 1;
Monarch = no free tier + sync delays; Copilot = iOS-only, no free plan; Rocket Money =
cancellation/hidden-fee/2FA complaints; EveryDollar = manual-entry tedium on free tier;
PocketGuard = automation-first but no manual entry; Simplifi = Quicken-backed, ~$3.99/mo, minor
sync bugs.

**Retention numbers (weak — vendor/blog, order-of-magnitude disagreement):** banking apps
D1/D7/D30 ≈ 30%/18%/12%; non-banking fintech D30 ≈ 4–6%; general apps ~6% D30 (≈94% churn). Values
range 2%→73% across sources purely on definition (banking vs budgeting; install-cohort vs
engaged-app). **Do not encode a single retention number without picking the matching archetype.**

---

## 7. International vs US

**Which figures are US-centric:** essentially all of §2 (BLS/Census), §3, §4.1–4.3 (Census/Bankrate),
§5 (Fed), and §6 are **US**. Non-US points are flagged below.

- **Household net saving rate by country** (`GOV/H`, OECD/Eurostat): US ~4–5%, UK ~2–4.7%, Italy
  ~3.2% cluster *low*; **France ~12.8%, Germany ~10.3%, Netherlands ~10.2%, Sweden ~14.7%**,
  **Switzerland ~19%** cluster *high*; EU average ~8.1%; Greece negative. A US household default of
  ~4–5% savings is realistic; scale **2–4× higher** for a northern/continental-European profile.
- **Payment mix by country** (affects transaction seed data): **US is card-dominated** (cash only
  ~14% of payment count; Fed 2024, `GOV/H`). **Euro area is still cash-plurality at point-of-sale**
  (cash ~52% of POS count; ECB SPACE 2024, `GOV/H`), with **Germany a cash-heavy outlier** (P2P cash
  ~74%). Sweden is near-cashless (<10% cash, widely cited) but not in the ECB dataset. If Ortho seeds
  a non-US household, shift the cash/card ratio accordingly.
- **UK split-method** (YouGov, `SURVEY/H` for UK): see §4.3 — proportional preferred (48%) but 50/50
  more practiced (46%).
- **Multi-currency / non-USD household behavior:** **genuine data gap.** No survey-grade prevalence
  found; only anecdotal expat guidance (e.g. "3–5 accounts across 2–3 currencies", `VENDOR/L`).
  Treat multi-currency as a design assumption to be validated, not a sourced distribution.

---

## 8. Confidence & sourcing notes and contradictions

### 8.1 What to trust as hard anchors (`GOV`/`ACAD`, High confidence)
- BLS CE category shares & dollar figures (§2); Census ACS housing costs; BEA/FRED savings rate;
  Fed DSR debt-service ratios; Fed Diary payment counts (§5); Fed SHED fragility ($400/37%/13%,
  3-month fund 55%); CFPB overdraft incidence & concentration; Census SIPP couple account structure;
  OECD/ECB international savings & payment mix. **Hard-code these confidently.**

### 8.2 Trust the shape, not the exact dollar (single-vendor or volatile)
- **Subscription dollar figures ($86 self-report / $219 actual / $133 gap / 42% forgot):** all trace
  to **one C+R Research survey (2022, n=1,000)** recycled across many "2024/2026" articles. Use the
  *shape* (systematic under-perception ~2.5×, forgetting), not the specific dollars as multi-sourced.
- **Impulse-spend ($/mo):** single-vendor (Slickdeals), swings $151–$318 year to year — model as a
  distribution.
- **Income-volatility magnitude (36% median swing, 41% >30%):** essentially all **JPMorgan Chase
  Institute** (one proprietary bank dataset). Prevalence (~29%, `GOV` Fed SHED) and magnitude
  (JPMC, `VENDOR-DATA`) come from *different* sources — cross-source, don't conflate.
- **Rocket Money "$700/yr saved," 2.5M cancellations:** `VENDOR` marketing — directional only.
- **YNAB "$600 in 2 months / $6,000/yr saved":** `VENDOR` marketing (self-selected engaged users).

### 8.3 Weakest tier — verify before encoding (`VENDOR-blog`/`L`)
- **App-retention D30 numbers** (2% vs 4.2% vs 38% vs 73%): internally contradictory; definition-
  driven. Lean on behavioral drift (Bankrate 29% review, 73% don't follow) instead.
- **"67% quit budgeting apps within 30 days":** **misattributed.** The underlying stat is "67% who
  tried an app rated it not helpful / too much effort"; the "30-day" framing is a blogger's, not the
  source's. **Do not encode as sourced.**
- **Categorization vendor self-reports (97–98% accuracy):** discount; trust the academic F1 (93–95%
  full-context, ~58% merchant-name-only) and practitioner "70–80% out-of-box, hard categories 40–60%
  wrong."
- **Per-tier 50/30/20 splits ("needs ≈ 80% of take-home"):** `VENDOR/L`.

### 8.4 Explicit contradictions (report, don't average)
- **Budget adoption:** 74% (NerdWallet/Harris) vs ~85% (Debt.com) vs ~86% (secondary) — wording-
  driven; use ~74–86% as a range, not a point.
- **Paycheck-to-paycheck:** **34% (Bankrate) → 65% (PYMNTS) → 77%** ("struggle if paycheck delayed a
  week") — spread is purely definitional. Pick a defensible mid-band (~50%) and note it's
  definition-sensitive; do not average silently.
- **Minimum-payment-only share:** Fed/Philly Fed ~10.75–11.12% of *accounts* vs CFPB 15% general-
  purpose / 20% store cards — different populations/methodologies; both are "record highs." Use a
  ~10–20% band.
- **Debit txns/month:** 34.6 (PULSE, active cardholders) vs ~14 (Fed Diary, all consumers) — pick by
  whether you're modeling an *engaged* user (34.6) or a *population average* (14).
- **Housing share denominator:** CE "housing = 33% of *spending*" vs ACS "housing = 21–31% of
  *income*" — not contradictory; different denominators and scope. Keep them separate.
- **"Savings rate" is three different constructs:** NIPA macro (~4.6%), household-survey saving, and
  the CE pension/insurance line (~9–12%). Choose deliberately; they are not interchangeable.

### 8.5 Genuine data gaps the generator must invent (state as assumptions)
1. **Over-budget overshoot magnitude** (no published %/$).
2. **Splitwise settle-up cadence & balance persistence.**
3. **"One-pays-then-reimburses" split prevalence.**
4. **Recurring-vs-one-off transaction ratio** (inferred only).
5. **Multi-currency household behavior.**

---

## 9. Full citation list

**Category spending / income / debt (BLS, Census, Fed, BEA):**
- BLS Consumer Expenditures 2023 report — `GOV/H` — https://www.bls.gov/opub/reports/consumer-expenditures/2023/
- BLS Consumer Expenditures 2024 news release — `GOV/H` — https://www.bls.gov/news.release/cesan.nr0.htm
- BLS CE Table 1101 by income quintile (reproduced) — `GOV/H` — https://downloads.regulations.gov/EPA-HQ-OAR-2024-0505-0030/content.pdf
- BLS TED: housing+transportation = 50% of 2024 spending — `GOV/H` — https://www.bls.gov/opub/ted/2026/housing-and-transportation-accounted-for-50-percent-of-household-spending-in-2024.htm
- Census ACS 2024 (median rent/owner cost, cost burden) — `GOV/H` — https://www.census.gov/newsroom/press-releases/2025/acs-1-year-estimates.html
- Census ACS renter cost-burden — `GOV/H` — https://www.census.gov/newsroom/press-releases/2024/renter-households-cost-burdened-race.html
- BEA Personal Saving Rate — `GOV/H` — https://www.bea.gov/data/income-saving/personal-saving-rate
- FRED PSAVERT (saving rate) — `GOV/H` — https://fred.stlouisfed.org/series/PSAVERT
- Federal Reserve Household Debt Service Ratios — `GOV/H` — https://www.federalreserve.gov/releases/dsr/
- Fed FEDS Note, credit-bureau DSR methodology — `GOV/H` — https://www.federalreserve.gov/econres/notes/feds-notes/introducing-a-credit-bureau-based-measure-of-u-s-household-debt-service-20240904.html
- Bankrate 28/36 rule — `JOURN/M` — https://www.bankrate.com/real-estate/what-is-the-28-36-rule/

**Over-budget / variable income / abandonment / categorization:**
- NerdWallet 2023 Budgeting Report (Harris Poll, n=2,070) — `SURVEY/H` — https://www.nerdwallet.com/finance/studies/data-2023-budgeting-report
- Fed SHED 2024, Income & Expenses — `GOV/H` — https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-income-and-expenses.htm
- Fed SHED 2024, Employment & Gig Work — `GOV/H` — https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-employment-and-gig-work.htm
- JPMorgan Chase Institute, Weathering Volatility 2.0 (PDF) — `VENDOR-DATA/H-M` — https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/institute/pdf/institute-volatility-cash-buffer-report.pdf
- JPMC Institute, Earnings Instability — `VENDOR-DATA/H-M` — https://www.jpmorganchase.com/institute/all-topics/financial-health-wealth-creation/earnings-instability
- Bankrate 2025 budgeting (29% review / 34% track) — `SURVEY/H-M` — https://www.bankrate.com/banking/savings/survey-more-than-two-thirds-of-americans-arent-budgeting/
- NBC/OppLoans (73% don't regularly follow) — `SURVEY/M` — https://www.nbcbayarea.com/news/business/money-report/73-of-people-dont-regularly-follow-a-budget-and-thats-ok-says-a-financial-therapist/2877737/
- Debt.com 2026 Budgeting Survey — `SURVEY/M` — https://www.debt.com/research/best-way-to-budget/
- arXiv transformer transaction-categorization (F1 93–95% / ~58% merchant-only) — `ACAD/H` — https://arxiv.org/html/2312.07730v1
- Triqai categorization best-practices (70–80% out-of-box) — `VENDOR-blog/M-L` — https://www.triqai.com/article/automated-transaction-categorization-best-practices

**Subscriptions / overdraft / debt / fragility / spikes:**
- C+R Research subscription statistics — `VENDOR/M` — https://www.crresearch.com/blog/subscription-service-statistics-and-costs/
- CNBC: consumers spend $133 more than they realize — `JOURN/M` (reports C+R) — https://www.cnbc.com/2022/06/02/consumers-spend-133-more-monthly-on-subscriptions-than-they-realize.html
- Rocket Money (2.5M cancellations, $700/yr) — `VENDOR/L` — https://www.rocketmoney.com/learn/personal-finance/does-rocket-money-work
- CFPB overdraft/NSF data spotlight 2024 — `GOV/H` — https://www.consumerfinance.gov/data-research/research-reports/data-spotlight-overdraft-nsf-revenue-in-2023-down-more-than-50-versus-pre-pandemic-levels-saving-consumers-over-6-billion-annually/
- CNBC: minimum credit-card payments hit record — `JOURN/H` (reports Philly Fed) — https://www.cnbc.com/2025/01/22/minimum-payments-on-credit-cards-hit-record-level-as-delinquencies-also-rise.html
- Fed SHED 2024 Savings & Investments ($400 / $500 / 3-month fund) — `GOV/H` — https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-savings-and-investments.htm
- Fed SHED unexpected-expenses dataviz — `GOV/H` — https://www.federalreserve.gov/consumerscommunities/sheddataviz/unexpectedexpenses.html
- Bankrate Emergency Savings Report (59% can't cover $1,000; 27% zero) — `SURVEY/H` — https://www.bankrate.com/banking/savings/emergency-savings-report/
- Statista impulse spend per month — `VENDOR/L` — https://www.statista.com/statistics/1330467/per-month-spending-on-impulse-purchases-usa/
- NRF 2024 holiday spending ($902/person) — `SURVEY/H` (association) — https://nrf.com/media-center/press-releases/2024-holiday-spending-expected-reach-new-record
- NRF back-to-school 2024 ($874.68 / $1,364.75) — `SURVEY/H` — https://nrf.com/media-center/press-releases/back-to-school-season-begins-early-for-majority-of-shoppers
- AAA: 1 in 3 can't afford an unexpected car repair — `SURVEY/M` — https://newsroom.aaa.com/2017/04/one-three-u-s-drivers-cannot-pay-unexpected-car-repair-bill/
- KFF surprise medical bills (39% / <$500 / $2,000+) — `SURVEY/H` — https://www.kff.org/health-costs/data-note-public-worries-about-and-experience-with-surprise-medical-bills/
- PYMNTS paycheck-to-paycheck (65%) — `VENDOR/M` — https://www.pymnts.com/consumer-finance/2025/who-is-the-paycheck-to-paycheck-consumer-in-america/
- Bankrate paycheck-to-paycheck (34%) — `SURVEY/M` — https://www.bankrate.com/banking/living-paycheck-to-paycheck-survey/
- Dykstra, "Patience Across the Payday Cycle" (Harvard) — `ACAD/H` — https://scholar.harvard.edu/files/holly-dykstra/files/payday.pdf
- "Present bias, mental budget constraint, and the payday consumption cycle" (2024) — `ACAD/H` — https://www.sciencedirect.com/science/article/abs/pii/S1043951X24001950

**Couples / splitting / Splitwise:**
- US Census Bureau, "Married but Separate" (SIPP 1996–2023) — `GOV/H` — https://www.census.gov/library/stories/2025/09/married-but-separate.html
- CNBC: 62% of couples keep some money separate (Bankrate) — `SURVEY/H` — https://www.cnbc.com/2025/01/27/62percent-of-couples-keep-at-least-some-money-separate-from-each-other-survey.html
- CNBC: why Gen Z couples keep finances separate (generational gradient) — `SURVEY/H` — https://www.cnbc.com/2024/02/08/why-gen-z-couples-tend-to-keep-finances-separate.html
- Newsweek/Talker Research (Gen Z split preferences) — `SURVEY/M` — https://www.newsweek.com/gen-z-different-idea-who-should-pay-bills-1788500
- YouGov UK, fairest way to split bills (n=1,254) — `SURVEY/H` (UK) — https://yougov.com/en-gb/articles/50381-what-is-the-fairest-way-for-couples-to-split-household-bills
- Splitwise (Wikipedia: 20M+ users, $100B+ shared) — `VENDOR-derived/M` — https://en.wikipedia.org/wiki/Splitwise
- Splitwise blog, "Debts Made Simple" (algorithm) — `VENDOR` (mechanics) — https://blog.splitwise.com/2012/09/14/debts-made-simple/

**Transaction cadence / apps / international:**
- Fed Diary of Consumer Payment Choice 2024 (48/mo, mix) — `GOV/H` — https://www.frbservices.org/news/research/2024-findings-from-the-diary-of-consumer-payment-choice
- PULSE 2024 Debit Issuer Study (34.6 debit tx/mo) — `VENDOR/M-H` — https://www.pulsenetwork.com/public/insights-and-news/news-release-2024-debit-issuer-study/
- Circana (39 unique retailers/yr) — `VENDOR/M-H` — https://www.circana.com/post/consumers-shop-at-39-unique-retailers-a-year-focusing-on-convenience-and-value-reports-circana
- CNBC: Mint is shutting down — `JOURN/H` — https://www.cnbc.com/2023/11/07/budgeting-app-mint-is-shutting-down-users-are-disappointed.html
- Monarch: Mint's first PM on why it failed — `JOURN/M` — https://www.monarch.com/blog/mint-shutting-down
- YNAB pricing / learning curve — `JOURN/M` — https://www.ynab.com/pricing
- Rocket Money BBB complaints — `JOURN/M` — https://www.bbb.org/us/md/silver-spring/profile/billing-services/rocket-money-inc-0241-236043013/complaints
- OECD Household Savings by country — `GOV/H` — https://www.oecd.org/en/data/indicators/household-savings.html
- ECB SPACE 2024 (euro-area cash/card mix) — `GOV/H` — https://www.ecb.europa.eu/stats/ecb_surveys/space/html/ecb.space2024~19d46f0f17.en.html

**Flagged / discount (do not encode as authoritative):**
- Strategia-X blog ("67% quit in 30 days" — misattributed) — `VENDOR-blog/L` — https://www.strategia-x.com/blog/2026-04-12-why-budgeting-apps-fail-30-days-fintech-ux-data/
- The Penny Hoarder 50/30/20 per-tier splits — `VENDOR/L` — https://www.thepennyhoarder.com/budgeting/50-30-20-rule/

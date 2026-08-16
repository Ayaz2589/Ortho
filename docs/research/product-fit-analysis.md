# Ortho — Product-Fit Analysis

**Purpose.** Answer the question underneath every other question: **what is this app, who is it
for, and is there a business here?** Ortho is pre-launch and still being built, so this is not a
launch plan — it is a fit investigation. It states what is verified, what is assumed, and what is
unknown, and it gives one direction rather than several.

**Confidence tags.** `VERIFIED` = survived 3-vote adversarial verification against a primary source
(URL inline) · `REPO` = read from code on `main` and hand-checked (path inline) · `ASSUMED` = this
document's judgment, **not** a sourced claim · `UNKNOWN` = named gap · ⚠️ = caveat on an otherwise
sound claim.

**Status.** Living document, rewritten 2026-07-20 to remove accumulated contradictions (§10).
Nothing here is a commitment to build. When a question below is answered, record the answer here
rather than quietly acting on it.

---

## 1. The direction, in one page

**Ortho is the ledger for a household that isn't one wallet** — more than one adult, money shared
but not merged, rent as the biggest line, works with no bank, in your language. Nobody serves that
job: Monarch and YNAB assume a merged household; Splitwise tracks IOUs without a plan.

**The mission customer and the paying customer are different people.** This is the central finding
of this document and everything else follows from it. The households the job fits best — 2–4 adult
LEP renting households in Queens — have the lowest ability to pay in the city, and the evidence
against charging them is their own revealed preference: `VERIFIED` **23.3% of unbanked households
name minimum-balance cost as the single main reason they left banking, versus 5.1% for privacy**
([FDIC 2023](https://www.fdic.gov/household-survey/2023-fdic-national-survey-unbanked-and-underbanked-households-report)).

That is not a reason to abandon them. It is a reason to stop forecasting revenue from them:

> **The free tier is the mission. The paid tier is the business. They are not the same people, and
> the free tier costs essentially nothing to run.**

`VERIFIED` — the marginal cost of a free household is **~$0.002/month** (SimpleFIN's $1.50/mo is
paid by the *user*, not by Ortho; `output: 'export'` in `web/next.config.ts:10` means pure static
hosting). That is 30–500× below the $0.30–1.00/user/month that made Mint structurally unprofitable.
**The thing that killed Mint cannot kill Ortho.** Ten thousand free households cost about $17/month.

### The direction

| | What | Why |
|---|---|---|
| **Free, forever** | The whole ledger: manual entry, CSV import, splits, settle-up, budgets, insights, one property, all six languages, bank sync when it works | The mission. Revenue forecast: **$0, permanently.** No apology, no funnel maths, no conversion target |
| **Paid tier 1** | **$48/year, household-scoped, annual-only, unlimited adults** | Not the business — the **measurement instrument**. It is the only way to learn the real conversion rate, and it fixes a live billing defect (§3) |
| **Paid tier 2, conditional** | **~$180/year for the owner-occupier of a 2–4 unit house** — expense allocation + a Schedule E worksheet | The only architecture whose arithmetic closes. **Do not build it until a two-week, zero-code test says a buyer exists** (§6 Step 3) |

### Why the renter subscription cannot be the business

`VERIFIED` arithmetic, not pessimism. At a defensible conversion rate of **0.9–1.5%** of signups
(derived: 4–6% D30 for the manual-entry archetype × 15–25% purchase among survivors — not asserted):

| Net target | Renters at $48/yr | Owner-occupiers at $180/yr |
|---|---|---|
| $30k | 797 payers → ~80,000 signups | **212 payers → ~14–21k signups** |
| $60k | 1,569 payers → **~157,000 signups ≈ 18% of every multi-adult renter household in NYC** | 429 payers → ~29–43k signups |

The renter number is not a timing problem, it is an arithmetic one — **258 free signups per day,
forever, at zero CAC.** The owner-occupier number is 7–14 new paying households per month. That
ratio, not ARPU, is the entire argument for the second SKU.

**Break-even is not the constraint:** 6–8 payers covers infrastructure; ~84 covers an honest floor
including AI tooling. Ortho can stay alive indefinitely at near-zero traction — an option Mint,
YNAB and Monarch never had.

### The three fit questions

| Question | Verdict |
|---|---|
| **Product fit** — is the job real, and does the code serve it? | Job: `ASSUMED`, untested with a real household. Code: **partially** — the planning engines model a merged wallet (§3) |
| **Market fit** — do enough such households exist, reachably, in NYC? | **Yes**, `VERIFIED` and large (§4) |
| **Business fit** — will anyone pay enough to sustain the work? | **`UNKNOWN`.** No verified willingness-to-pay datapoint exists for *any* segment. The weakest flank in the thesis |

### One app, always

What varies by audience is the sentence you lead with, which catalog loads, and whether the user
ever taps "connect bank" — all already supported. What never varies is the ledger, splits, budgets,
insights, and the housing engine. An `if (userIsBengali)` branch anywhere means something has gone
wrong; the constitution's "one canonical implementation" already requires this.

**Immigrant Queens households are the free tier, not an identity.** `VERIFIED` support for targeting
the *job* rather than the demographic: Remitly shut down Passbook (its immigrant-focused neobank)
in 2023 because remittance customers and banking customers proved to be different segments; Comun's
wedge was utility (100+ accepted ID types, native Spanish support 7 days/week → NPS 86), not
identity; and the NYC unbanked rate varies **11×** by origin group (§4.2). `ASSUMED` — an app
*branded* "for immigrants" is also a liability for its own users given the April 2025 IRS–ICE
information-sharing agreement. Build an app that works flawlessly in Bangla; don't build one whose
installation is a statement about someone's status.

**Discipline test for any future feature:** would a Bushwick household with three roommates and no
immigrant background want this too? If yes, build it. If no, it is a segment feature — put it behind
spec-027 `tags` and wait for observed demand.

---

## 2. Who it is for

### The free tier — 2–4 adult renting households, Jackson Heights / Elmhurst / Corona

Adults sharing rent off the Roosevelt Ave / 74th St and 37th Ave corridors. Combined income roughly
$75–85k; rent $2,200–2,600 — **31–42% of gross income**, which is rent-burdened by the standard 30%
threshold but not severely so. One adult does most of the money admin and is more comfortable in
Bangla or Spanish than English. Most are banked.

⚠️ **Correction:** earlier revisions said "45–50% of income," which the persona's own numbers do not
support ($2,400/mo on $80k = 36%). The severe-burden framing was doing real argumentative work for
the housing wedge and has been removed.

Why Queens:

- `VERIFIED` — **Queens has the lowest unbanked rate of the four large boroughs (4.9%, 42,600
  households); the Bronx is 13.5%** ([DCWP 2025](https://www.nyc.gov/site/dca/news/027-25/dcwp-releases-updated-research-brief-238-900-households-nyc-unbanked)).
  ⚠️ That brief contains **no language or English-proficiency variable** — it cannot support claims
  about LEP households.
- `VERIFIED` (in-repo) — Queens is 29.6% LEP with ~650k LEP residents, and its dominant languages
  are three of the four Ortho already ships.
- `VERIFIED` — NYC is **67.3% renter households**; 51.6% of NYC renters pay ≥30% of income on rent,
  28.8% pay ≥50% ([ACS 2024 B25003](https://data.census.gov/table/ACSDT1Y2024.B25003);
  [RGB 2026 I&A Study](https://rentguidelinesboard.cityofnewyork.us/wp-content/uploads/2026/04/2026-IA.pdf)).

**Explicitly not a revenue segment.** `VERIFIED` — 66.2% of unbanked households are cash-only, but
that is only 2.8% of US households, skewing 55+, sub-$15k, no high-school diploma, with just 25.0%
ever interested in a bank account. Serve them generously; forecast $0.

### The paying customer — owner-occupier of a 2–4 unit house

Sunnyside, Woodside, Elmhurst, Ridgewood, Kensington. Has a mortgage, rental income, and an April 15
deadline. **`ASSUMED` — their willingness to pay is unverified**, which is exactly why §6 Step 3 is
a test and not a build.

The honest value claim: mortgage interest comes off a Form 1098 with one multiply, and depreciation
carries forward automatically in professional tax software — **a preparer already takes both.**
Ortho's incremental capture is **operating expenses only** (repairs, supplies, water split,
cleaning, travel): realistically $2,000–5,000 of recovered deduction ≈ **$600–1,500/yr of tax** at
a ~30% combined marginal rate. That is a 4–10× return on $180 and a perfectly good pitch. It is not
50×, and overselling it loses the accountant channel on the first return.

---

## 3. What the code actually is

`REPO`, hand-verified 2026-07-20. Ortho's **planning and analysis engines model a single merged
wallet**, while the ledger beneath them does not:

| Layer | Multi-adult aware? | Evidence |
|---|---|---|
| `web/lib/splits.ts`, `web/lib/finance/balances.ts` | **Yes** — N-person, deterministic to the cent, vector-locked | 2 and 4 references to `shares`/`paid_by`/`owner_ids` |
| `store.spentBy` + `PerOwnerBreakdownCard` (mounted on both dashboards) + the `household_owner_spend` SQL aggregate | **Yes** — shares-weighted per-person spend ships today | `web/lib/store.tsx:893`; `web/app/(app)/dashboard/page.tsx:90`; `web/components/web/DashboardDesktop.tsx:330`; `supabase/migrations/20260611120000_aggregates.sql:26` |
| `web/lib/finance/budgets.ts` (157 ln) | **No** | **0** references |
| `web/lib/finance/insights.ts` (399 ln) | **No** | **0** references |
| `web/lib/reports/*.ts` (113 ln) | **No** | **0** references |

⚠️ **Scope correction:** an earlier revision claimed the money engines were "structurally incapable"
of knowing about multiple adults and that Ortho contained "two disconnected worlds." That overstated
it — a shipping shares-aware surface exists. The accurate claim is narrower: **~670 lines of
planning/analysis code model a merged wallet, while the ledger and the per-owner dashboard card do
not.**

`ASSUMED` — the plausible resolution is one forward-looking money object: *this month's obligations,
rent first, split per adult, seeded from the lease.* Untested with a real household; it is
hypothesis **H1**.

**A concrete symptom:** `balanceBetween(viewer, other, …)` was viewer-anchored, so in a 3-adult
household **what Amir owes Fatima was invisible to the third roommate.** Correct for two people;
wrong for the target household.

> **UPDATE 2026-08-16.** This section is written against the 2026-07-20 tree and has since moved
> twice. Spec 043 **deleted** both shares-aware surfaces this scope correction relied on
> (`balances.ts`/settle-up and `PerOwnerBreakdownCard`), leaving `MemberSummary` as the only one.
> Specs 050–053 then rebuilt the story properly: transactions default to shared ownership, a
> `MoneyScope` primitive threads the person axis through planning/insights/financial-health, and
> an N-person balance engine (`lib/finance/balances.ts`) replaces the viewer-anchored one. The
> "~670 lines model a merged wallet" claim below no longer holds as stated.

### Defects that are true regardless of which direction wins

Not strategy-dependent — fix on their own merit:

| Defect | Evidence |
|---|---|
| **Two insight rules render red**, violating constitution Principle I ("loss/cost is never red", NON-NEGOTIABLE) | `severity:'critical'` at `web/lib/finance/insights.ts:160,201` → `var(--destructive)` at `web/lib/categories.ts:71-73` |
| **`entitlements.user_id` is the primary key** — three adults in one household can each buy their own subscription and Stripe will take all three | `supabase/migrations/…_subscription_entitlements.sql:43` |
| Budget rollover anchor dropped (`BudgetDrawer` omits `created_at`); `budgets.ts` uses raw `new Date()` against its own timezone-parity comment; non-positive limits render an empty bar beside "$X over"; `formatMoney` never reaches `generateInsights` | four wrong-number bugs |
| **~1.3 MB of unused font** — `Lato-Bold` (700) and `Lato-Black` (900) preload on every page; repo-wide use of `font-bold`/`font-black` is **0** | `web/app/layout.tsx:26-29` |
| **One `<label>` element** in the entire component tree; `<html lang="en">` hardcoded | `web/app/layout.tsx:54` |
| No `/privacy` or `/terms` route, while sign-in renders "you agree to our **Terms** and **Privacy**" as inert text | `web/app/sign-in/page.tsx:121-122` |
| Zero error monitoring; `main` unprotected so CI is advisory; no documented backup/PITR; no account deletion or data export | greps return nothing |
| **`simplefin-sync` requires an end-user JWT** and has no batch endpoint — "daily sync" cannot exist; every unmatched synced expense is written to `entertainment`, a real budget category | `supabase/functions/simplefin-sync/index.ts:20,31-39` |
| **The SimpleFIN parser has never seen a real byte** — every fixture is hand-authored from a spec doc, and the parser guesses across two schema variants | `services/aggregation/test/simplefin-*.test.ts` |

---

## 4. What the evidence establishes

### 4.1 `VERIFIED` — market shape

| Finding | Source |
|---|---|
| NYC is 67.3% renter households (Bronx 80.3%, Queens 55.6%) | [ACS 2024 B25003](https://data.census.gov/table/ACSDT1Y2024.B25003) |
| 51.6% of NYC renters pay ≥30% of income on rent; 28.8% pay ≥50% | [RGB 2026 I&A](https://rentguidelinesboard.cityofnewyork.us/wp-content/uploads/2026/04/2026-IA.pdf) |
| 238,900 NYC households (7.0%) unbanked; Bronx 13.5%, Queens 4.9% | [DCWP 2025](https://www.nyc.gov/site/dca/news/027-25/dcwp-releases-updated-research-brief-238-900-households-nyc-unbanked) |
| 24.3% of NYC households under $30k are unbanked vs 0.4% above $75k; non-citizens 9.9% vs citizens 5.8% | [NYC Comptroller 2025](https://comptroller.nyc.gov/reports/access-to-banking-credit-in-new-york-city/) |
| Among unbanked households, **cost is the main reason (23.3%)**; privacy 5.1%, distrust 15.7%. As *contributing* reasons: distrust 36.0%, privacy 33.9% | [FDIC 2023](https://www.fdic.gov/household-survey/2023-fdic-national-survey-unbanked-and-underbanked-households-report) |
| Local Law 30 designates 10 citywide languages; Japanese is not among them. **LL30 binds city agencies, not vendors** | [Council LL30 explainer](https://citymeetings.nyc/meetings/new-york-city-council/2024-09-24-0100-pm-committee-on-immigration/chapter/explanation-of-local-law-30-of-2017-and-its-requirements/) |

**Price gets the product tried; privacy determines whether it gets recommended.** Both matter, at
different moments. The consequence: any nudge toward connecting a bank repels about a third of this
audience, so the manual path must be first-class, never a degraded mode.

### 4.2 `VERIFIED` — the segment is not one segment

NYC's Office of Financial Empowerment surveyed 1,324 low/moderate-income immigrants ⚠️ (fieldwork
pre-2013 — a directional anchor, not a current number):

| Origin group | Unbanked |
|---|---|
| Mexican | **57%** |
| Ecuadorian | **35%** |
| Chinese | **5%** |

**And the strongest evidence for the language thesis anywhere in the corpus: 62% of unbanked
Mexican respondents said they would open an account "if I found a bank where they speak my
language."** Ortho already ships six full-UI languages with no SSN, no ID, no credit check.

Operationally this is **two front doors** — a *marketing* split, not a product split: lead with sync
in Flushing, lead with "works without a bank" in Corona. Both sentences are true of the same build.

### 4.3 `VERIFIED` — how money actually moves here

- **Cash is ~24% of payments for households under $25k** (vs 9% above $150k). Even a fully synced
  Ortho **silently under-reports spending** without a deliberate cash wallet.
- **66.2% of unbanked households are cash-only** — no feed will ever exist for them.
- **Prepaid/GPR cards are collapsing** (32.8% → 21.6% of unbanked households, 2021→2023). Build
  nothing prepaid-specific.
- **86.6% of foreign-born noncitizen households have smartphone access** even when unbanked. ⚠️ The
  poorest tier (~73%) does not — keep the web app usable on a shared or library computer.
- **Check cashing is the local banking substitute:** of the 61 NYC ZIP codes with ≤3 bank branches,
  check cashers equal or outnumber banks in **46**
  ([NYDFS](https://www.dfs.ny.gov/reports_and_publications/other_reports/nydfs_access_to_financial_services_nys_202305)).
  NY caps fees at 2.2% for a regular paycheck → a $600 weekly check costs **~$686/year.** A
  deterministic insight requiring no bank connection, shipped by nobody.

### 4.4 `VERIFIED` — what worked and what died for others

- **Propel** (born at Blue Ridge Labs, Brooklyn): its first product was a *mission* product — a
  website to help people apply for SNAP. It raised $11k, was rejected by ~60 investors, and only
  attracted capital after pivoting to a boring weekly utility. **The funding followed the utility,
  not the mission.** Separately, in 2018 a single data provider cut off access, affecting **~80% of
  users** — a direct read on SimpleFIN dependency.
- **Seis shut down in January 2026**, its CEO citing "declines in immigration," after a senator
  pressed Treasury on foreign-ID accounts. **Ortho is structurally immune** — no KYC, no ID, no
  money movement. Worth stating explicitly, and a standing argument against stored value.
- **Code for America:** identity verification was the single largest funnel loss — **88% dropped
  off** at a third-party ID portal; a redesign got it to 42%. 74% start on mobile.
  → **The SimpleFIN token-paste is the same shape** (an external, English-only site mid-signup) and
  **must never appear in first-run.**

### 4.5 `VERIFIED` — what actually changes behavior

- **A CFPB-funded RCT in NYC found coaching raised the share of people who *have* a budget by 20pp
  — and had *zero* effect on whether they stuck to it.** With 84% of budgeters exceeding budget and
  73% not following one, **activation is the movable outcome; adherence is not.** Design for a
  budget that gets created and glanced at.
- **WCAG 2.2 SC 3.1.5** sets a testable reading-level bar (≈US grade 9). Because the catalog key
  *is* the English source string, simplifying the source improves all six languages at once.
- ⚠️ Native-language preference data is weaker than commonly cited — the well-known "76% prefer
  their language" figure is about e-commerce, not money tasks. The defensible number: **60% of the
  *most English-confident* respondents still preferred native-language support.**

### 4.6 `VERIFIED` — economics and constraints

- **SimpleFIN Bridge is $1.50/mo paid by the end user**, so Ortho's marginal aggregation cost is
  ~zero. **Institution coverage probed live 2026-07-20:** present — Chime, Cash App, Varo, Municipal
  CU, Lower East Side People's FCU, Brooklyn Cooperative, Neighborhood Trust, Urban Upbound.
  Absent — PayPal, Venmo, Remitly, Wise. Better community-bank coverage than feared; this answers
  the SimpleFIN analysis's §9 open question.
- **SimpleFIN disclosed an MX-caused exposure on 2026-05-28** (up to 39 users saw each other's data
  for ~4 hours). "No bank credentials touch Ortho" is true but incomplete — the privacy policy must
  name MX.
- **NY Banking Law §641(1)** turns on *receiving money for transmission* — a read-only ledger is
  cleanly outside it.
- **`output: 'export'`** (`web/next.config.ts:10`) means pure static hosting: Cloudflare Pages is
  viable and saves ~$240/yr against Vercel Pro.
- **Annual billing beats monthly**: 12 fixed Stripe fees collapse to one, and it converts monthly
  churn into a single renewal decision.

### 4.7 `ASSUMED` and `UNKNOWN`

**Assumed, not verified:** that the job statement matches how households describe their own problem;
that anyone will pay $48 or $180; that owner-occupier density in Sunnyside/Woodside is high; that
word-of-mouth inside a language community works for Ortho specifically.

**Unknown, with the cheapest resolution:**

| Question | Test | Cost |
|---|---|---|
| Does the SimpleFIN parser work against a real bank? | Buy one Bridge subscription, connect one bank, capture `/accounts`, pin the fixture | **$1.50 + an afternoon** |
| Does the 8-digit OTP email deliver, out of spam? | Send to 5 providers | free |
| Do households describe the shared-obligation problem unprompted? | 15 conversations in Queens | free |
| Will an owner-occupier pay $180? | §6 Step 3's three gates | ~2 weeks + 4 Saturdays |
| Actual conversion rate | Ship §6 Step 1 and watch | free |
| Is Ortho a GLBA "financial institution"? | One lawyer conversation | real money |

---

## 5. What the revenue modelling killed

Six architectures were modelled with unit economics and stress-tested by three independent reviewers
each. **Every one failed on the demand side, while the cost model held under every lens.** These are
the tempting options, and why each dies:

| Architecture | Killed by |
|---|---|
| **Renter subscription as the business** | Conversion arithmetic (§1). Not a timing problem |
| **NY tenancy engine as the paid anchor** | Three independent kills: (a) it is the *acquisition* asset — you cannot sell the §226-c calculator while running it as free SEO; (b) the entire NYC tenancy-deadline search universe is ~10,700 queries/month across all phrasings and languages; (c) **RGB Order #58 is 0%/0% for leases commencing Oct 2026–Sep 2027**, so the flagship "your exact next-year rent" currently outputs *unchanged*. Landlord-side is worse — RPL §214 exempts owner-occupied ≤10-unit buildings from Good Cause, §226-c's penalty is a delay not a fine, and §235-e carries no monetary penalty. **You would price $180/yr against a maximum exposure of ~$220** |
| **One-time / pay-what-you-can** | CAC amortizes against a single payment; PWYC clusters at the visible floor (realistic ARPU ~$17, not $30) |
| **Open core / paid hosting** | Audience arithmetic ~15× short, and the self-host stack is 7 services (GoTrue, PostgREST, Kong, Vault, edge-runtime), not "Postgres + Caddy" |
| **B2B tax-preparer credit packs** | The calendar: a code handed out in March 2027 produces a packet in March 2028, so the December renewal is made having observed nothing. Also, the IRS public directory structurally excludes the non-credentialed storefront persona the model targeted |
| **Landlord-prosumer as a standalone go-to-market** | Preparer-referral yield overstated ~10×. **The SKU survives; the standalone channel does not** |

---

## 6. Direction — hypotheses and the tests that would falsify them

**Not a roadmap.** Each step is a hypothesis plus the smallest thing that would falsify it. A failed
gate is a **finding**, not a setback.

| # | Hypothesis | Status | Tested by |
|---|---|---|---|
| **H1** | The job is real and households describe it in their own words | `ASSUMED` | Step 0's 15 conversations |
| **H2** | Such a household will use a money app needing manual entry and no bank | `ASSUMED`; supported by §4.3 | Activation + D30 |
| **H3** | Anyone will pay $48/yr | `UNKNOWN` — no evidence for any segment | Step 1 |
| **H4** | Multi-adult households will invite each other into one ledger | `ASSUMED`; never exercised by two humans | Step 2 |
| **H5** | An owner-occupier will pay ~$180/yr | `ASSUMED` | Step 3's three gates |
| **H6** | Bank sync is reliable enough to offer | `UNKNOWN` — parser has never seen a real byte | The $1.50 test |
| **H7** | Language is a differentiator, not just a feature | Demand `VERIFIED` (§4.2); unverified *for Ortho* | ≥25% of engaged households on a non-English locale |

### Step 0 — Talk to fifteen households · free, no code

The cheapest test in this document, and it gates everything. Ask *"walk me through what happens on
the 1st of the month"*, *"who does everyone pay, and how do you keep track"*, *"when was the last
time there was confusion about money in the apartment"*. If rent collection comes up unprompted and
sounds tense, H1 holds. If people instead complain about not knowing where their money goes, the
merged-wallet engines are fine and §3's resolution is wrong.

The founder **lives in Queens** — the highest-trust, zero-CAC channel available, requiring nothing
to be built.

### Step 1 — Ship the billing rail · ~3–4 weeks

$48/year, household-scoped, annual-only, unlimited adults, on a permanently free ledger. Ship it
*not* because $48 is the business but because it is the only instrument that measures conversion,
and because `entitlements.user_id` being the primary key is a live defect (§3).

Prerequisites are the trust-and-reachability defects in §3: `/privacy` + `/terms`, a real domain,
error monitoring, backup verification, form labels, and the font surgery.

**`ASSUMED` — the highest strategic-payoff-per-line item in the corpus:** on `invoice.paid`, have
the Stripe webhook write a $48 **expense transaction** with `paid_by` = payer and shares across the
household's adults. Ortho's whole positioning is *money shared, not merged* — and without this, the
subscription is the one expense Ortho cannot help a household split. (Mind `amount_non_negative`:
a subscription is a positive expense.)

### Step 2 — One ledger, several adults · ~4 weeks

Land partner invites (`origin/017-partner-invite-join`, tip `65e0f2d`). ⚠️ **Measured rebase cost:**
`main` has moved **149 commits** since the merge base and `web/lib/store.tsx` has **+575/−98** on
`main` against the branch's **+403/−39** to the same file. Budget large, not medium; the fallback is
to cherry-pick `invites.ts`, the `/join` route, and the catalog keys.

⚠️ **Ship invites with an explicit disclosure that all household transactions are visible to all
members, or add a private scope first.** The schema has zero financial privacy between adults (spec
007 dropped `transactions.scope`). In multigenerational and mixed-status households one adult often
controls money and documents. **Do not ship invites silently.**

**Gate:** 20 households where two distinct `auth.users` each logged ≥1 transaction into the same
`household_id` within 14 days.

### Step 3 — Test the owner-occupier, then maybe build · 2 weeks of testing

Ship a free, no-signup **Owner-Occupied 2–4 Family Expense Allocator** — a static page computing the
Schedule A/E mortgage-interest split and the 27.5-yr depreciation schedule. It is ~80% written
(`web/lib/finance/mortgage.ts` already does the hard part) and costs $0 to serve. It is
simultaneously the SEO asset, the demo, and the willingness-to-pay probe.

**Build the $180 SKU only if all three hold:** ≥100 completed computations with ≥15% leaving an
email; 10 tax-prep shops and 20 owner-occupier doors visited; **≥5 of those 30 conversations name a
specific expense category that currently falls through.** If any fails, you have spent two weeks
instead of a quarter.

**This is why the mortgage and multifamily engines stay.** They do not serve the free-tier
household — but they are the only asset aimed at someone with a demonstrated reason to buy software.

### Step 4 — Make sync real, or stop offering it · ~3 weeks

Scheduled sync needs a service-role branch, a batch endpoint, and `pg_cron`. Connection health is
absent (status enum is only `active|disconnected`; `last_synced_at` rendered nowhere; `warnings[]`
dropped; re-claiming duplicates the institution row). The `entertainment` fallback needs an
`'other'` value ⚠️ (`ALTER TYPE … ADD VALUE` is irreversible).

**Gate:** 10 households whose transactions land daily with nobody tapping Refresh, over 21
consecutive days. **If it fails, sync is honestly demoted** and CSV/statement import becomes the
primary ingest — porting the CLI's blocking reconciliation, which the in-app scanner lacks.

### Step 5 — Language expansion · conditional

**Entry gate: ≥25% of engaged households on a non-English locale.** If met: Russian (~108k LEP, the
largest gap) and zh-Hant. ⚠️ Adding a language is **10 file edits**, not the 4 the market analysis
claims, and ~10 count-bearing strings must be reworded first — **reword the copy, refuse the ICU
engine.** If not met, drop multilingual from positioning and keep the five catalogs maintained.

---

## 7. Reaching people

The founder lives in Queens, which makes place-based, in-language distribution primary.

**The mechanism:** neighborhood-specific QR codes carrying in-language copy, resolving to a landing
page in that language with the lead message matched to that neighborhood (§4.2). Language is pre-set
(`?lang=bn`) rather than guessed — today auto-detection fails exactly where it matters, on a
borrowed or English-locale phone. Each code is a distinct slug, so per-neighborhood conversion is
measurable.

**Cards, not stickers.** `ASSUMED`, and the reasoning matters more than the conclusion: a random QR
on a pole leading to a page about your money is what a scam looks like, ⚠️ unpermitted posting on
NYC public property is generally prohibited (verify before printing), and stickers weather. The
identical QR on a card handed over by someone you know carries their endorsement. Ranked:

1. **Hand-carried cards, the founder's own network** — highest trust, no permission, no legal
   question. Fifty households is all that is needed to learn whether any of this works.
2. **Community bulletin boards** — a *designated* posting surface, so no favor is being asked.
   Laundromats are the best physical environment regardless: 30–60 min dwell time, phone in hand.
3. **Public libraries** — Queens Public Library: trusted, not a business, public posting policies.
4. **Community groups already joined** — WhatsApp / WeChat / neighborhood Facebook.
5. Local ethnic media; permissioned counter cards in shops. Later.

**The copy is the weakest link.** ⚠️ "Budgeting simplified" is what every competitor says, and
nobody here thinks their problem is that budgeting is too complicated. Lead with the situation:
*"One apartment. Four people. One rent."* (Jackson Heights) · *"Track your money. No bank needed."*
(Corona — the sharpest claim available) · *"Connect your bank, it fills itself in."* (Flushing).
The card being *in* Bangla proves the language claim; don't spend words on it. Never name the
demographic.

⚠️ **Do not machine-translate marketing copy.** The catalogs are hand-written and the constitution
is no-LLM; a line that reads slightly off signals the product is machine-made.

**Engineering prerequisite, cheap only if done early:** accept `?lang=` and a campaign slug on any
entry URL and persist the slug through signup onto the funnel events. **Self-host the short links on
your own domain** — a third-party redirect looks more like a scam and leaks scan data.

---

## 8. Non-goals

| Not building | Why |
|---|---|
| **Ads** | The inventory for this demographic is largely predatory (you would serve a check-casher ad beside an insight saying check cashing costs $686/yr); targeting requires the data use the positioning forbids; ad SDKs are a safety risk for undocumented-adjacent users; the closed design system cannot contain an ad unit. Mint's forcing function — expensive free users — does not apply here |
| **Any money movement** | §641(1) is cleanly avoided by a read-only ledger. Adding it means 50-state MTL + BSA/AML + Reg E — the exposure class that shut down Seis |
| **Institutional / CBO distribution as a channel** | Zero documented precedent for a for-profit budgeting app; the named funders do not fund technology platforms |
| **RTL (Arabic, Urdu, Yiddish)** | 61 physical-direction class sites, zero logical properties, no `dir` attribute. Engine work, and none is in the four languages covering ~three-quarters of foreign-born LEP New Yorkers |
| **ICU / plural engine** | Reword the ~10 count-bearing English strings instead |
| **Native-currency ledger** | Decided in spec 027. Implement the deferral honestly; do not reopen |
| **Remittance cost features — narrow version only** | Never *infer* remittances from a bank feed, and never compute an "you overpaid" figure (Ortho cannot see what arrived abroad). ⚠️ The 1% federal excise tax applies only to cash-funded transfers, which are invisible in a feed. **A manually-logged send with a stated funding method is different** and could carry World Bank corridor constants ($200 averages 5.04% vs $500 at 3.44%; China 7.31% vs Mexico 4.53%). Low priority, display-only |
| **Apple IAP / App Store / Android** | Zero of 7 Apple deploy secrets exist; no `DEVELOPMENT_TEAM`; the only deploy lane archives the *frozen* SwiftUI app onto the live bundle id — **delete `ios-deploy.yml`**. Android: `@capacitor/android` is absent and `appId` contains a dash, an invalid Android package name. "Nearly free" is false |
| **Client-side encryption / local-only mode** | The claimed foundation (`memory-client.ts`) has an `rpc()` that always resolves `null`. Single-device local mode also contradicts the shared household |
| **Net worth, investments, forecasting, Sankey, AI assistant** | All lose to Monarch on breadth. The no-LLM stance is constitutional **and** a margin advantage — Monarch's assistant is a variable COGS line Ortho does not carry |
| **Late-fee detector; rent reporting to credit bureaus** | Late fees are bundled into one rent payment and uncapturable; a self-maintained rent log is not furnishable to a bureau |

---

## 9. Open questions only the founder can answer

1. ~~**Are you in this community?**~~ **ANSWERED — the founder lives in Queens.** The 15
   conversations are therefore the first channel, not a research exercise. Remaining: *which*
   community can you sit at a kitchen table with?
2. **Is your own household using Ortho daily right now?** The only usage data that exists. If no,
   that is the most important signal in this document.
3. **Which are you aiming at — a business, or a maintained tool serving your neighborhood?** At ~$0
   marginal cost both are viable and honorable, but they imply different products. Decide on
   purpose.
4. **Who answers support, in what language?** Six languages, one founder. "In-language product,
   English-only support" is a discoverable gap.
5. **Who translates, and is machine translation allowed under the no-LLM rule?** ⚠️ The catalog key
   *is* the English source string, so editing a comma in any English string silently un-translates
   five languages **with no test failure.**
6. **Legal entity, insurance, counsel.** None exists in the repo, yet Step 1 publishes a privacy
   policy. Budget for one lawyer conversation: GLBA status, NY sales tax on SaaS, disclaimers.
7. **Do you accept web-only for two quarters in writing?** Ambiguity here is the most expensive
   option available.
8. **What is the number at which you stop?** Suggested: **fewer than 50 paying households 180 days
   after billing goes live** → Ortho becomes a maintained personal tool or an open-source project,
   not a business. Without a stop condition this plan cannot fail, only continue.

---

## 10. Method and revision history

**Method.** Four workflows on 2026-07-20, 683 agents total. (1) A 638-agent pass: 9 parallel code
readers mapped `main`; 12 research angles fetched primary sources and produced 202 candidate claims,
each faced 3 independent adversarial verifiers on distinct lenses (sourcing, precision, staleness)
and died on 2 of 3 refute votes — **77 survived, 125 were refuted**; then 5 strategy proposals from
conflicting framings were reconciled by a 4-lens judge panel. (2) An 11-agent feature audit
classifying every capability against the job. (3) A 26-agent revenue model: 6 architectures with
unit economics, each stress-tested by 3 reviewers. (4) An 8-agent consistency sweep. Every code
claim in this document was **hand-verified** before being written.

The 125 refuted claims are why several intuitive recommendations are **absent** — the
inferred-remittance calculator, the late-fee detector, the CBO-distribution spine, and
privacy-as-primary-wedge all died in verification.

**Revision 4 — 2026-07-20 (this rewrite).** Rebuilt from scratch to eliminate 30 material
contradictions found by the consistency sweep. The document had accumulated **two mutually exclusive
operating plans under one set of section numbers**: it simultaneously instructed deleting Reports and
goals while charging for them, deferring bank sync while selling it in Phase 1, and celebrating an
exit gate at ~3 paying households while a kill criterion fired at fewer than 30. Resolved by
adopting the revenue model's answer — **the free tier is the mission, the $48 household tier is the
measurement instrument, and the conditional $180 owner-occupier SKU is the only architecture whose
arithmetic closes.** Specific corrections: **§3's scope was narrowed** (an earlier claim that the
money engines were "structurally incapable" of multi-adult awareness was falsified — a shipping
shares-aware surface exists); **the beachhead's rent burden is 31–42%, not the 45–50% claimed**;
the NY tenancy engine moved from paid anchor to free acquisition asset; the mortgage/multifamily
engines were **retained** (they serve the paying customer, not the free tier); and the spec queue was
removed entirely, because a fit analysis should not carry a build commitment.

**Earlier revisions.** R1 was a launch strategy. R2 added the job statement, the 11× unbanked spread,
cash-rails research, growth precedents, and the go-to-market section. R3 reframed to a fit analysis
and moved this file from `docs/plan/` to `docs/research/`.

**Cross-doc reconciliation.** This document **corrects** two claims in
[nyc-market-language-analysis.md](./market-analysis/nyc-market-language-analysis.md): adding a
language is 10 file edits, not 4; and privacy/distrust is a *contributing*, not the *main*, unbanked
reason. It **resolves** that doc's §11 open question on NYC-specific unbanked rates and the
[SimpleFIN analysis](./competetive-analysis/simplefin-developer-analysis.md) §9 question on
community-bank coverage.

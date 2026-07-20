# Monarch Money — Competitive Analysis for Ortho

**Purpose.** Position Ortho against **Monarch Money**, the leading paid Mint-replacement
and the app whose feature set most overlaps Ortho's couples-budgeting core. This doc
answers two questions directly: *what does Monarch do better than Ortho*, and *what does
Ortho do better than Monarch* — then draws strategic takeaways for how Ortho should
position and where it should (and should not) compete.

**Scope & date.** Compiled **2026-07-20** from monarch.com (home + pricing) and 2026
third-party reviews (NerdWallet, Marriage Kids & Money, The Penny Hoarder, Finny,
Verithia review-consensus). Ortho's side is drawn from `docs/index.md`, `docs/web.md`,
`docs/finance.md`, `docs/simplefin.md`, `PARITY.md`, and specs 027–028. Read alongside
the [Plaid](./plaid-integration-competitive-analysis.md) and
[SimpleFIN](./simplefin-developer-analysis.md) analyses — those cover the bank-sync layer
that is Monarch's single biggest lead over Ortho.

**Confidence tags.** `MONARCH` = Monarch's own marketing/pricing pages · `REVIEW` =
third-party 2026 review · `ORTHO` = drawn from Ortho's own docs/specs · `SYNTHESIS` =
this report's recommendation, not a sourced claim.

> **One-line takeaway.** Monarch is the *aggregate-everything* platform (13k+ institutions,
> investments, net worth, forecasting, AI assistant) that added couples collaboration and,
> in 2026, basic rental/business income tracking. Ortho is a *calm, private, couples-first*
> budgeting app with a genuinely deeper housing/real-estate engine and deterministic,
> vector-locked math. Monarch wins on breadth, connectivity, and maturity; Ortho wins on
> focus, housing depth, correctness, and privacy. **Don't fight Monarch on breadth — win on
> housing + calm + couples + private + correct.** The existential risk is Ortho's immature
> bank-sync; the sharpest wedge is housing, which Monarch just started (shallowly) to enter.

---

## 1. What each product is

|                | **Monarch Money**                                   | **Ortho**                                                          |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Category       | Full-stack PFM / Mint replacement                   | Calm household budgeting for two-person households                 |
| Maturity       | Shipped, years in market, large user base           | Pre-launch; core ledger complete, bank sync in-flight (spec 028)  |
| Platforms      | Web, iOS, Android                                   | Web (canonical) + iOS (Capacitor shell); Android planned          |
| Pricing        | Core $99.99/yr ($14.99/mo); Plus $199/yr; 7-day trial, no free tier | Stripe subs, 31-day trial (plan tiers TBD)         |
| Philosophy     | Aggregate everything, automate, AI-assisted         | Deterministic, no-LLM, privacy-first, "loss is never red"         |

---

## 2. Where Monarch does it better

1. **Bank/account connectivity — its biggest lead.** `REVIEW` ~13,000 institutions via
   multiple data providers (Plaid + others), automatic transaction sync, balances, and
   auto-categorization. Ortho's SimpleFIN sync (spec 028) is brand-new, read-only,
   one-account-per-connection, stores no balances, and falls back to `entertainment` for
   uncategorized spend; Plaid in Ortho is connect-only. This is a years-of-work gap.

2. **Net worth & investments.** `MONARCH` Investment holdings, credit-score tracking, real
   estate value, loans — full net-worth-over-time with trend charts. Ortho has no
   investment/portfolio tracking and no net-worth trend (housing assets are manual;
   snapshots are roadmap §2.1).

3. **Forecasting & planning.** `MONARCH` Plus ($199/yr) adds cash-flow forecasting,
   retirement/what-if modeling, Morningstar analysis, and equity/RSU tracking. Ortho has no
   forecasting at all.

4. **AI assistant (2026 headline feature).** `REVIEW` Weekly financial summaries, trend
   surfacing, natural-language money questions, plus AI receipt matching with item-level
   category breakdown. Ortho has **zero** AI/LLM by design.

5. **Advanced, customizable reporting.** `MONARCH` Custom charts, spending trends,
   net-worth visualizations, custom date ranges. Ortho's Reports MVP is only savings-rate +
   category deep-dive (Sankey/custom charts deferred).

6. **Collaboration polish.** `REVIEW` Unlimited collaborators + advisor access,
   "mine/theirs/ours" shared views, per-transaction attribution — refined over years.

7. **Maturity & ecosystem.** `REVIEW` Real user base, status page, migration path for Mint
   refugees, cross-device consistency consistently praised.

---

## 3. Where Ortho does it better

1. **Housing / real-estate depth — Ortho's clearest moat.** `ORTHO` Mortgage amortization +
   equity + years-remaining, lease management with renewal alerts (≤60 days) and rent-due
   tracking, **multifamily rentals with occupancy flags and occupied-only net rental
   income**, and a rental payment log. `REVIEW` Monarch only recently added basic rental
   *income* tracking (Plus tier) — no amortization, occupancy, or lease modeling. For a
   landlord/couple with property, Ortho is materially deeper.

2. **Privacy posture.** `ORTHO` SimpleFIN-first (no third-party data broker), Plaid kept only
   as a contained rollback, no LLM sending data anywhere, self-hosted design tokens.
   `REVIEW` Monarch reviews repeatedly flag Plaid-dependency friction and at least one report
   of data-sharing with Meta/Facebook that users must manually disconnect.

3. **Deterministic correctness.** `ORTHO` All money math pinned by 13 golden regression
   vectors; CI blocks unreviewed behavior drift; atomic ledger writes with SQL-enforced
   share sums. `REVIEW` Monarch users cite miscategorization and misleading refund/payment
   displays — the cost of automation without a correctness lock.

4. **Calm, disciplined design.** `ORTHO` Tokens-only closed palette, hairlines, "loss is
   never red," meaning via typography/position not color — a deliberate anti-clutter stance
   vs. Monarch's dense, chart-heavy UI.

5. **Couples-first from day one (not bolted on).** `ORTHO` Per-person splits
   (even/percent/value), settle-up/reimbursement balances between members, split with
   non-Ortho people by name. The ledger *is* the two-person model, rather than a shared view
   added later.

6. **No sync-reliability tax (for now).** `REVIEW` Monarch's single most common complaint is
   sync breakage (2FA re-auth, Plaid handshake failures, Canadian banks). `ORTHO` Ortho's
   manual/CLI deterministic statement import sidesteps aggregator fragility — though partly
   because deep sync simply isn't built yet.

7. **Single canonical codebase.** `ORTHO` Web → iOS (Capacitor) → future Android from one
   TS/React source, no parity tax. An execution-velocity advantage, not user-facing.

---

## 4. Feature-by-feature

| Capability                          | Monarch                          | Ortho                                        |
| ----------------------------------- | -------------------------------- | -------------------------------------------- |
| Bank transaction sync               | ✅ Broad, automatic (~13k inst.)  | 🟡 SimpleFIN read-only, new; Plaid connect-only |
| Auto-categorization                 | ✅ (AI-assisted)                  | 🟡 Basic heuristics, `entertainment` fallback |
| Net worth over time                 | ✅                                | ❌ (roadmap §2.1)                             |
| Investment tracking                 | ✅ (Plus: Morningstar, RSU)       | ❌                                            |
| Forecasting / retirement            | ✅ (Plus)                         | ❌                                            |
| Budgeting (flex/fixed/non-monthly)  | ✅                                | ✅ (fixed/flex/non_monthly + rollover)        |
| Savings & debt goals                | ✅                                | ✅ (contribution-driven)                      |
| Couples / shared household          | ✅ Unlimited + advisor            | ✅ Two-person, splits + settle-up             |
| Mortgage amortization               | ❌                                | ✅                                            |
| Rental / multifamily w/ occupancy   | 🟡 Income only (Plus)             | ✅ Deep (occupancy, net income, leases)       |
| Receipt scanning                    | ✅ (AI item-level)                | ✅ (native Vision/PDFKit, deterministic)      |
| Recurring/subscription detection    | ✅                                | ✅ (Insights Rule 5)                          |
| AI assistant                        | ✅                                | ❌ (by design)                               |
| Advanced reports (Sankey/custom)    | ✅                                | 🟡 MVP only                                   |
| Multi-person (>2)                   | ✅                                | ❌ (couples-only by design)                  |
| Privacy (no broker / no LLM)        | ❌ Plaid + AI + Meta-sharing flag | ✅ SimpleFIN-first, no LLM                    |
| Deterministic/vector-locked math    | ❌                                | ✅                                            |
| Maturity                            | ✅ Years in market                | ❌ Pre-launch                                |

---

## 5. Strategic takeaways for Ortho

1. **Don't fight Monarch on breadth — you'll lose.** `SYNTHESIS` Aggregation, investments,
   forecasting, and AI are years of moat. Competing head-on dilutes what's actually
   differentiated.

2. **Housing is the wedge — and it's under attack.** `SYNTHESIS` Monarch just entered rental
   tracking at $199/yr but only does *income*. Ortho's amortization + occupancy + lease
   modeling is genuinely deeper. Lean in: property P&L (§7.1), property-value trend, and
   market as "the budgeting app that actually understands your mortgage and rentals."

3. **"Calm + couples + correct + private" is a coherent counter-position** to Monarch's
   "aggregate-everything + AI." `SYNTHESIS` Reviewers' top Monarch complaints — sync
   breakage, weak support, miscategorization, Meta data-sharing — map almost exactly onto
   Ortho's stated principles. That's a marketing gift.

4. **The bank-sync gap is existential for adoption.** `SYNTHESIS` Most Monarch users chose it
   *because* auto-sync works. Ortho's SimpleFIN path must become reliable and
   well-categorized fast, or "privacy-first" reads as "manual data entry." This is the #1
   thing standing between Ortho and being a real alternative.

5. **The AI abstention is a real fork in the road.** `SYNTHESIS` Monarch's 2026 AI assistant
   is a headline feature; Ortho's no-LLM stance is principled and privacy-consistent, but
   needs an answer for "where are my weekly insights?" Ortho's deterministic 9-rule Insights
   engine *is* that answer — frame it as *private, on-device intelligence without an LLM*.

> **One-line positioning.** Monarch is the everything-app that watches all your money; Ortho
> is the calm, private, couples-and-housing budgeting app that gets the math exactly right.

---

## 6. Sources

- Monarch home & pricing: <https://www.monarch.com/> · <https://www.monarch.com/pricing>
- NerdWallet, *I Used Monarch Money for 30 Days*: <https://www.nerdwallet.com/finance/learn/monarch-money-app-review>
- Marriage Kids & Money, *Monarch Review After 3 Years*: <https://marriagekidsandmoney.com/monarch-money-review/>
- The Penny Hoarder, *Monarch Review 2026*: <https://www.thepennyhoarder.com/budgeting/monarch-money-review/>
- Finny, *Monarch Pricing 2026*: <https://getfinny.app/blog/monarch-money-pricing-2026>
- Verithia review-consensus: <https://verithia.com/app/1459319842/consensus>
- Ortho internal: `docs/index.md`, `docs/web.md`, `docs/finance.md`, `docs/simplefin.md`, `PARITY.md`, `specs/027-*`, `specs/028-simplefin-sync/`

# Ortho — Future Tasks / Feature Backlog

A living backlog of **candidate features and platform changes** we may build over
time. Most entries are inspired by [Monarch Money](https://www.monarch.com/)'s
2026 feature set (a comprehensive net-worth/aggregation app). The one platform
consolidation (Capacitor, §0.1) has since **shipped as spec 021** — kept below as
a completed record. Everything else here is uncommitted — the idea pool.

> This directory is the broken-out form of the former root `FUTURE-TASKS.md`:
> one file per task, plus this index. Each file preserves its original section
> number (e.g. §4.2) so cross-references stay stable.

**How to use this doc**
- Each item is described at a **high level** (what it is · how it works · how it
  fits Ortho). It is *not* a spec.
- When we decide to build one, promote it into a real feature via the Spec Kit
  flow: `/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`
  into a new numbered `specs/NNN-…/` dir. Reconcile `PARITY.md` + docs as usual.
- Keep the "Ortho fit" notes honest — several Monarch features **cut against our
  positioning** (privacy-first, no third-party bank linking, deterministic/no-LLM,
  household-of-two, calm design). Those are strategic decisions, not just backlog.

**Legend** — Priority: 🔴 high · 🟡 medium · ⚪ low/exploratory. Tension: ⚠️ conflicts
with a current Ortho principle (flag before building).

**What we already have** (don't re-scope): shared+personal money, per-member
transaction splits + settle-up/reimbursement balances, monthly category budgets,
an 8-rule insights engine (incl. recurring-charge detection), a deep housing
engine (mortgage amortization / equity, lease renewal & rent-due, multifamily
units with occupancy + occupied-only net rental, rental-payment log),
multi-currency (7 + live FX), on-device receipt/statement scanning, a
deterministic bank-statement import CLI, month-scoped dashboard widgets,
transaction filters/search, 6-language i18n; delivered as web (Next.js, the sole
canonical implementation) + iOS (a Capacitor native shell over the same web bundle;
the SwiftUI app is frozen reference). Connect-only Plaid bank linking shipped in
spec 024 (see §1.1).

---

## Backlog by section

### 0. Platform & architecture
- [§0.1 Wrap the web app with Capacitor; retire the native Swift app](./0.1-capacitor-consolidation.md) — 🔴 · ✅ **shipped (spec 021)**

### 1. Aggregation & accounts
- [§1.1 Automatic account aggregation (bank/card/loan/investment sync)](./1.1-automatic-account-aggregation.md) — 🟡 ⚠️ · connect half shipped (spec 024)
- [§1.2 Manual accounts / balances as first-class objects](./1.2-manual-accounts.md) — 🟡

### 2. Net worth & investments
- [§2.1 Net worth tracking over time](./2.1-net-worth-tracking.md) — 🟡
- [§2.2 Investment / portfolio tracking](./2.2-investment-portfolio-tracking.md) — ⚪

### 3. Planning & goals
- [§3.1 Savings / debt-payoff goals](./3.1-savings-debt-payoff-goals.md) — 🟡
- [§3.2 Cash-flow forecasting / long-range planning](./3.2-cash-flow-forecasting.md) — ⚪

### 4. Money management
- [§4.1 Flexible budgeting ("Flex" buckets, rollover, forecasting)](./4.1-flexible-budgeting.md) — 🟡
- [§4.2 Subscription / bill manager](./4.2-subscription-bill-manager.md) — 🟡
- [§4.3 Transaction rules & bulk editing engine](./4.3-transaction-rules.md) — 🟡
- [§4.4 Transaction tags & richer notes](./4.4-transaction-tags-notes.md) — ⚪

### 5. Intelligence & reporting
- [§5.1 Advanced reports (Sankey cash-flow, savings rate, custom charts)](./5.1-advanced-reports.md) — ⚪
- [§5.2 AI assistant + weekly spending recaps](./5.2-ai-assistant-recaps.md) — ⚪ ⚠️

### 6. Collaboration
- [§6.1 More than two people + roles (advisor / read-only)](./6.1-more-people-roles.md) — ⚪ ⚠️

### 7. Real estate / property (extends our housing engine)
- [§7.1 Property value tracking + rental-property P&L](./7.1-property-value-rental-pl.md) — ⚪

### 8. Platform reach
- [§8.1 Android app](./8.1-android-app.md) — ⚪
- [§8.2 Push notifications](./8.2-push-notifications.md) — 🟡

### Deep dives
- [**Plaid feature opportunities**](./plaid-feature-opportunities.md) — what the
  shipped Plaid Connect foundation (spec 024) unlocks: transaction sync, balances,
  recurring streams, liabilities/mortgage seeding, categorization, and more, each
  mapped to Ortho infrastructure and priced by re-link cost.

---

## Rough sequencing (subject to change)

1. ~~**§0.1 Capacitor consolidation**~~ — ✅ **done (spec 021)**; it was the force
   multiplier that unblocked Android (§8.1) + push (§8.2) and removed the parity tax.
2. **§1.2 manual accounts → §2.1 net worth** and **§3.1 goals** — high-value,
   privacy-safe, self-contained.
3. **§4.1 flexible budgeting (rollover)**, **§4.2 subscription manager**, **§4.3
   rules** — extend money management we already do.
4. **§7.1 property value / rental P&L** — deepen our strongest area.
5. Later / thesis-dependent: **§1.1 aggregation** (⚠️ positioning), **§2.2
   investments**, **§5.x reports/AI** (⚠️), **§6.1 collaboration** (⚠️).

> The ⚠️ items are the ones that redefine what Ortho *is* (bank linking, LLM,
> >2 people). Decide the product thesis before scoping those; the unmarked items
> extend the app we already have.

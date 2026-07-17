# Ortho — Future Tasks / Feature Backlog

A living backlog of **candidate features and platform changes** we may build over
time. Most entries are inspired by [Monarch Money](https://www.monarch.com/)'s
2026 feature set (a comprehensive net-worth/aggregation app); one is a platform
consolidation (Capacitor). Nothing here is committed — this is the idea pool.

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
transaction filters/search, 6-language i18n, iOS (SwiftUI) + web (Next.js).

---

## 0. Platform & architecture

### 0.1 Wrap the web app with Capacitor; retire the native Swift app 🔴
- **What:** Ship iOS from the **existing Next.js/React web codebase** wrapped in
  [Capacitor](https://capacitorjs.com/) (a native App-Store binary around our web
  bundle — not a plain Safari PWA), instead of maintaining a separate SwiftUI app.
- **How it works (high level):**
  - Capacitor packages the web build as a native iOS app and exposes a JS↔native
    bridge. Off-the-shelf plugins cover Camera, Push, Biometrics (Face ID),
    Haptics, Preferences/secure-storage, Status Bar, Keyboard, Share, Deep Links.
  - **Custom Swift plugin for scanning:** keep our existing on-device scan
    pipeline (Vision OCR / PDFKit / custom AVFoundation camera / optional
    Foundation Models refiner) as ONE Capacitor plugin, invoked from the React
    scan flow. This preserves our best native feature while dropping ~90% of Swift.
  - `next.config` → static export (`output: 'export'`); the app is already almost
    entirely `'use client'`, so the main refactor is moving the `proxy.ts`
    server-side auth gate to **client-side route guards**. supabase-js persists the
    session via a secure-storage plugin instead of the iOS keychain.
  - Charts move from Apple Charts → Recharts (already used on web).
- **Why it's compelling for Ortho:** we currently implement the **same product
  twice** (Swift + TS) and pin it with golden vectors + a separate iOS CI loop.
  Consolidating deletes `iOS/Ortho-iOS/`, `AppTheme` (one design system), the
  XCTest parity suites, and the **entire class of TS↔Swift drift bugs** (≈¼ of
  spec 020's findings existed only because there are two implementations). Roughly
  halves per-feature cost.
- **Ortho fit / risks:** ⚠️ cuts against constitution Principle III ("native
  affordances per canvas") and the "iOS is canonical native app" positioning.
  Watch: WebView scroll/keyboard/gesture polish; App Store 4.2 "minimum
  functionality" (mitigated by the real scan/camera/push plugins); losing
  Foundation Models (optional). **De-risked path:** build the Capacitor iOS app
  alongside the SwiftUI app, TestFlight both, retire native only once it clears
  our UX bar.
- **Alternative considered:** React Native/Expo feels more native but can't reuse
  our web DOM components (partial UI rewrite). Capacitor maximizes reuse of the
  app we already have.

---

## 1. Aggregation & accounts

### 1.1 Automatic account aggregation (bank/card/loan/investment sync) 🟡 ⚠️
- **What:** Auto-connect external financial accounts so transactions and balances
  import continuously — Monarch's core (checking/savings, credit cards, loans,
  brokerages, crypto, even property/vehicles).
- **How it works:** an aggregator (Plaid / MX / Finicity) holds the bank
  credential link and streams normalized transactions + balances via webhooks;
  the app stores accounts, refreshes on a schedule, and de-dupes against manual
  rows.
- **Ortho fit:** ⚠️ **Biggest tension with our identity.** Today we are
  privacy-first with *no* third-party bank linking (manual entry + statement
  import + scan). Adopting aggregation is a positioning decision, not just eng
  work: cost (per-connection fees), a data-processor in the trust boundary, and
  security/compliance surface. If pursued, make it **opt-in** and keep the
  manual/import/scan paths as first-class. We already have the ingestion shape
  (`transactions` + `transaction_shares`, dedupe in the CLI) to reuse.
- **Status (2026-07-16, spec 024):** the CONNECT half is built — opt-in Plaid
  Link (embedded on web, Hosted Link on iOS), household-scoped
  `linked_institutions`/`linked_accounts`, access token in Supabase Vault,
  disconnect with provider-first revoke; manual/import/scan remain first-class
  and untouched. Transactions/balances **sync remains future work** (webhooks,
  staging/review queue, dedupe against manual rows — reuse the spec-014 review
  wizard per `.claude/research/2026-07-16-*` reports).

### 1.2 Manual accounts / balances as first-class objects 🟡
- **What:** Explicit "accounts" (checking, savings, card, cash) with balances,
  independent of our current card/source model.
- **How it works:** an `accounts` table with type + running balance; transactions
  reference an account; balances roll forward. Prerequisite for net worth (§2).
- **Ortho fit:** additive and privacy-safe (fully manual). A natural stepping
  stone that unlocks net worth without requiring aggregation.

---

## 2. Net worth & investments

### 2.1 Net worth tracking over time 🟡
- **What:** A single number (assets − liabilities) charted historically.
- **How it works:** sum balances across accounts + assets (property, vehicles)
  minus liabilities (loans, card balances); snapshot daily/monthly to draw a
  trend; Monarch uses Zillow for home value.
- **Ortho fit:** we already model property + mortgage (equity is computed!). Net
  worth = extend that with manual accounts (§1.2) + liabilities. Home *value* can
  be a manual input (avoids a Zillow dependency / keeps privacy). Depends on §1.2.

### 2.2 Investment / portfolio tracking ⚪
- **What:** Holdings, asset allocation, performance, top movers, benchmark
  comparison across brokerage accounts.
- **How it works:** import positions (via aggregation or manual), fetch security
  prices, compute allocation/returns, compare to an index.
- **Ortho fit:** ⚪ far from our current focus (household spending + housing).
  Needs a price-data feed and either aggregation (§1.1) or heavy manual entry.
  Lowest priority unless we broaden the product thesis.

---

## 3. Planning & goals

### 3.1 Savings / debt-payoff goals 🟡
- **What:** Named goals ("emergency fund", "trip") with a target + progress,
  linked to cash flow.
- **How it works:** a `goals` table (name, target cents, target date, linked
  account/category); progress = contributions or an account's balance vs target;
  optional monthly auto-contribution nudge in insights.
- **Ortho fit:** clean, self-contained, privacy-safe. Fits our cents model and
  the insights engine (a "goal off-track" rule). Good early candidate.

### 3.2 Cash-flow forecasting / long-range planning ⚪
- **What:** Project future balances from recurring income/expenses + goals
  (Monarch Plus: long-range + estate planning).
- **How it works:** extrapolate detected recurring items + scheduled transfers
  forward N months; show projected month-end balances.
- **Ortho fit:** builds on recurring detection (which we have in insights) +
  goals (§3.1) + accounts (§1.2). Medium-complex; do after those land.

---

## 4. Money management

### 4.1 Flexible budgeting ("Flex" buckets, rollover, forecasting) 🟡
- **What:** Beyond per-category monthly limits — group spend into fixed /
  non-monthly / flexible **buckets**, roll unused budget forward, and forecast.
- **How it works:** budgets gain a type (fixed/flex/non-monthly) and a rollover
  rule (carry remainder into next month); the dashboard shows per-bucket
  remaining.
- **Ortho fit:** direct extension of our existing budgets. Keep the calm UI;
  rollover is the highest-value piece. Vector-lockable (pure math).

### 4.2 Subscription / bill manager 🟡
- **What:** A dedicated view of recurring bills & subscriptions with a **calendar**
  and **pre-charge alerts** ("renews in 3 days — cancel?").
- **How it works:** cluster recurring merchants (amount + cadence), predict the
  next charge date, notify ahead of it; surface "unused / price-hiked" ones.
- **Ortho fit:** we already **detect** recurring charges in the insights engine —
  this promotes that into a first-class manager + notifications (needs the push
  plugin from §0.1). Strong, on-brand extension.

### 4.3 Transaction rules & bulk editing engine 🟡
- **What:** User-defined rules ("if merchant contains X → category Y, rename to Z,
  tag T"), applied automatically + retroactively; bulk edit + swipe-to-review.
- **How it works:** a `rules` table evaluated on import and on demand; a review
  queue for uncategorized/low-confidence rows.
- **Ortho fit:** our CLI already has a merchant→category heuristic; this exposes
  user-editable rules in-app and shares the engine across surfaces. Improves the
  import/scan pipelines we already have.

### 4.4 Transaction tags & richer notes ⚪
- **What:** Free-form tags (orthogonal to category) + notes/attachments.
- **How it works:** a `tags` table + join; filter/report by tag.
- **Ortho fit:** small, additive; complements our existing filters.

---

## 5. Intelligence & reporting

### 5.1 Advanced reports (Sankey cash-flow, savings rate, custom charts) ⚪
- **What:** Customizable charts — income→spend Sankey, savings-rate over time,
  category/merchant deep-dives.
- **How it works:** aggregate transactions into user-selected dimensions/date
  ranges; render configurable chart types.
- **Ortho fit:** we have fixed calm dashboard widgets; this adds a "reports"
  surface. Keep it calm (no chart-junk). Reuses our aggregate RPCs
  (`lib/api/aggregates.ts`, currently built-but-unwired).

### 5.2 AI assistant + weekly spending recaps ⚪ ⚠️
- **What:** A conversational assistant + auto-generated weekly summaries (Monarch,
  2026).
- **How it works:** an LLM over the user's (privacy-scoped) financial data answers
  questions and drafts recaps.
- **Ortho fit:** ⚠️ conflicts with our **deterministic / no-LLM** ethos (the
  import CLI is deliberately LLM-free; scan uses on-device models only). If
  pursued: on-device or strictly opt-in, and keep the deterministic paths intact.
  Weekly recaps (templated, non-LLM) are a safer first step and lean on the
  insights engine we already have.

---

## 6. Collaboration

### 6.1 More than two people + roles (advisor / read-only) ⚪ ⚠️
- **What:** Monarch's headline differentiator — unlimited collaborators + a
  financial-advisor (read-only) role, each with their own login.
- **How it works:** household membership with per-member roles/permissions;
  advisor gets scoped read access.
- **Ortho fit:** ⚠️ we are deliberately **household-of-two** (+ device-only "local"
  members). Broadening membership + roles is a real model change (RLS, splits,
  settle-up all assume the two-party household). Advisor read-only is the most
  plausible slice if we want any of this.

---

## 7. Real estate / property (extends our housing engine)

### 7.1 Property value tracking + rental-property P&L ⚪
- **What:** Track a property's *market value* over time and richer rental
  business tracking (Monarch Plus, 2026: business/rental property + estate).
- **How it works:** manual (or Zillow-style) value input charted over time; rental
  P&L = rent received − expenses per property.
- **Ortho fit:** we already lead here (amortization, equity, lease, occupancy,
  net rental). Natural extensions: a **manual home-value history** (feeds net
  worth §2.1) and a **per-property expense/P&L** view. Privacy-safe if value is a
  manual input. One of our strongest, most on-brand areas to deepen.

---

## 8. Platform reach

### 8.1 Android app ⚪
- **What:** Monarch ships web + iOS + Android; we ship web + iOS.
- **How it works:** if we adopt Capacitor (§0.1), Android is **nearly free** — the
  same web bundle targets Android with the same plugins.
- **Ortho fit:** best unlocked *by* §0.1; low marginal cost afterward, so it's a
  reason the Capacitor bet compounds.

### 8.2 Push notifications 🟡
- **What:** Alerts for bills/renewals (§4.2), goals (§3.1), settle-up reminders,
  budget thresholds.
- **How it works:** device token registration + a send path (APNs/FCM via a
  Capacitor push plugin or a small server function).
- **Ortho fit:** a shared enabler for several items above; pairs with §0.1.

---

## Rough sequencing (subject to change)

1. **§0.1 Capacitor consolidation** — the force multiplier; unblocks Android (§8.1)
   + push (§8.2) and removes the parity tax before we add feature surface.
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

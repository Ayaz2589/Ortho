# Plaid Feature Opportunities

> **What this is.** A survey of features Ortho could build on top of the Plaid
> integration we already shipped in **spec 024 (Plaid Connect)**. It reads the
> current, *connect-only* implementation, then maps each Plaid capability we
> could switch on to the Ortho infrastructure it would feed and the product
> principles it would touch. Like the rest of `docs/future_tasks/`, entries are
> **high-level candidates**, not specs — promote one via the Spec Kit flow
> (`/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`)
> when we decide to build it.

**Legend** — Priority: 🔴 high · 🟡 medium · ⚪ low/exploratory. Tension: ⚠️
conflicts with a current Ortho principle (flag before building).

---

## 1. What we shipped (the foundation)

Spec 024 built **connect-only** bank linking. The important thing for this doc
is what that foundation already gives us for free:

- **A stored, permanent `access_token` per institution**, encrypted at rest in
  **Supabase Vault** and reachable only by service-role edge functions through
  `SECURITY DEFINER` wrapper RPCs (`get_institution_secret`). Every capability
  below is "call another Plaid endpoint with a token we already hold."
- **`transactions` consent already collected at link time.** The link token is
  created with `products: ['auth']` and
  `additional_consented_products: ['transactions']`
  (`services/aggregation/src/plaid.ts`). Per Plaid's billing model, consent is
  collected now and billed only when first used — so **turning on transaction
  sync needs no re-link** of existing items (FR-011). This is the single most
  valuable thing the foundation bought us.
- **Household-scoped tables** — `linked_institutions` (item + institution
  metadata, `active | disconnected` status) and `linked_accounts` (display
  metadata only: name, mask, type/subtype) — with member-select RLS and
  service-role-only writes.
- **A pure, tested provider core** (`services/aggregation`, byte-copied into
  `supabase/functions/_shared/aggregation`) where request builders and response
  parsers live as pure functions with a drift lock. New endpoints are new pure
  functions here, adapters in `supabase/functions/`.
- **Three edge functions** (`plaid-link-token`, `plaid-exchange`,
  `plaid-disconnect`) that establish the authed-caller + service-role-writer
  pattern every new function copies.

**What it deliberately does NOT do yet** (scope guards in spec 024): no
transactions, no balances, no owner assignment on accounts, **no webhook
function**, no staging/review tables. Those are the work items below.

### The one piece of shared infrastructure almost everything needs

Every "keep data fresh" capability depends on two things spec 024 left for the
future:

1. **A Plaid webhook edge function** (`verify_jwt = false`) to receive
   `SYNC_UPDATES_AVAILABLE`, `DEFAULT_UPDATE`, item-error, and
   recurring-update webhooks. Spec 024 explicitly deferred this ("no webhook
   function → no `verify_jwt = false` entries needed").
2. **Item health / repair (Link update mode).** Items break
   (`ITEM_LOGIN_REQUIRED`, revoked consent). The `linked_institution_status`
   enum was designed to grow `error`/repair states cheaply. A resilient sync
   needs a re-auth flow: create a link token in *update mode* for the existing
   item and re-run Link. **Build this alongside the first sync feature — it is
   not optional for anything that stays connected over time.**

Treat **§2.1 Transaction sync + this webhook/health infrastructure** as the
gateway epic; most other rows get much cheaper once it exists.

---

## 2. Opportunities at a glance

| # | Opportunity | Plaid product / endpoint | Re-link needed? | Feeds | Priority |
|---|---|---|---|---|---|
| 2.1 | **Transaction sync** | Transactions · `/transactions/sync` | **No** (already consented) | §1.1 aggregation, `transactions`/`transaction_shares`, rules (§4.3) | 🔴 |
| 2.2 | **Account balances → net worth** | Balance · `/accounts/balance/get` | No | §1.2 accounts, §2.1 net worth | 🟡 |
| 2.3 | **Recurring streams** | Transactions · `/transactions/recurring/get` | No | §4.2 subscription manager | 🟡 |
| 2.4 | **Liabilities (loans/cards/mortgage)** | Liabilities · `/liabilities/get` | Yes (add `liabilities`) | Housing engine, §2.1 net worth | 🟡 |
| 2.5 | **Categorization / enrichment** | PFC on transactions (or `/transactions/enrich`) | No (rides on 2.1) | §4.3 rules, import CLI heuristic | 🟡 |
| 2.6 | **Owner auto-assignment** | Identity · `/identity/get` | Yes (add `identity`) | Deferred owner-assignment, splits | ⚪ |
| 2.7 | **Investments / holdings** | Investments · `/investments/holdings/get` | Yes (add `investments`) | §2.2 portfolio tracking | ⚪ |
| 2.8 | **Balance & spend alerts** | Balance + webhooks + push | No | §8.2 push, insights engine | ⚪ |
| 2.9 | **Auto-fetched statements** | Statements · `/statements/*` | Yes (add `statements`) | Existing statement-import CLI + scan | ⚪ |

> **Re-link cost is the key gate.** 2.1/2.2/2.3/2.5 ride on consent we already
> hold — cheap to reach. 2.4/2.6/2.7/2.9 need a new product consented, which for
> **existing** linked items means either an update-mode re-link or newly-linked
> items only. Weigh that friction before scoping them.

---

## 3. Detailed opportunities

### 2.1 Transaction sync 🔴 ⚠️
- **What:** Continuously import posted + pending transactions from linked
  institutions into Ortho, de-duped against manually-entered rows, with a review
  step before they land.
- **How (Plaid):** `/transactions/sync` — a cursor-based diff API
  (`added`/`modified`/`removed`) driven by the `SYNC_UPDATES_AVAILABLE` webhook.
  The cursor lives per institution; each webhook triggers a drain-to-completion
  sync in the edge function.
- **Ortho fit:** this is the maturation of **§1.1 aggregation** and the headline
  use of the foundation. It reuses the ingestion shape we already have
  (`transactions` + `transaction_shares`, plus the dedupe logic already proven in
  the import CLI). ⚠️ It is also the ⚠️ **positioning step** — going from
  "connect only" to "Ortho ingests your bank data" crosses the privacy-first line
  deliberately. Keep it opt-in per institution; keep manual/import/scan
  first-class; land rows in a **staging/review queue** (reuse the spec-014 review
  wizard per the `.claude/research/2026-07-16-*` reports) rather than silently
  writing to the ledger.
- **New infra:** webhook function (§1 above), `plaid-transactions-sync` function,
  a staging table + cursor storage, dedupe against manual rows, and item-health
  repair. Owner assignment of a synced transaction stays a manual/split decision
  unless 2.6 lands.
- **Dependencies:** webhook + item-health infrastructure (§1).

### 2.2 Account balances → net worth 🟡
- **What:** Show current balances for linked accounts and use them as the
  auto-updating asset/liability inputs to **net worth (§2.1)**.
- **How (Plaid):** `/accounts/balance/get` for on-demand fresh balances (or the
  `balances` field returned on `/accounts/get` and transaction syncs). No extra
  consent — `auth`/`transactions` already cover it.
- **Ortho fit:** turns **§1.2 manual accounts** into optionally auto-synced
  accounts and gives **§2.1 net worth** a live assets/liabilities feed without
  manual upkeep. Note that `linked_accounts` today stores **display metadata
  only by design** — surfacing balances is a deliberate scope expansion of that
  table (add a balances table or columns), so it inherits the same privacy
  decision as 2.1. Home value can still stay a manual input (privacy-safe), with
  linked cash/card balances filling the rest.
- **Dependencies:** §1.2 accounts model; shares the "we now store financial
  values from Plaid" decision with 2.1.

### 2.3 Recurring streams 🟡
- **What:** A first-class subscription/bill manager backed by Plaid's own
  recurring-transaction detection instead of (or alongside) our heuristic.
- **How (Plaid):** `/transactions/recurring/get` returns inflow/outflow
  **streams** with merchant, average amount, cadence, predicted next date, and
  active/inactive status; refreshed via recurring-update webhooks.
- **Ortho fit:** directly supercharges **§4.2 subscription / bill manager**. We
  already *detect* recurring charges in the insights engine — Plaid gives
  structured streams (next-charge prediction, price-hike/"unused" signals) that
  are hard to derive from manual data alone. Pair with **push (§8.2)** for
  pre-charge alerts. Keep our deterministic detector as the fallback for
  non-linked users so the feature isn't Plaid-only.
- **Dependencies:** rides on 2.1 (needs the transactions product active).

### 2.4 Liabilities (loans / cards / **mortgage**) 🟡
- **What:** Auto-populate loan and credit details — APR, balance, minimum
  payment, next due date, and for **mortgages**: origination, rate, escrow,
  next payment.
- **How (Plaid):** `/liabilities/get` (student loans, credit cards, mortgages).
  Requires the `liabilities` product — **new consent**, so existing items need an
  update-mode re-link (or offer it on new links only).
- **Ortho fit:** two strong, on-brand landings. (a) The **liabilities side of net
  worth (§2.1)** stops being manual. (b) **Our housing/mortgage engine** already
  models amortization/equity from manual inputs — Plaid could seed and reconcile
  the mortgage balance/rate/next-payment automatically, one of our most
  differentiated areas (§7.1). Treat Plaid as a *seed + reconcile* source, not
  the source of truth, so the deterministic housing math stays vector-lockable.
- **Dependencies:** re-link for `liabilities`; housing engine integration design.

### 2.5 Categorization / enrichment 🟡
- **What:** Better default categories on imported (and even manually-entered)
  transactions.
- **How (Plaid):** every synced transaction carries Plaid's **Personal Finance
  Category** taxonomy; `/transactions/enrich` can also categorize *our own*
  manually-entered/CLI-imported rows (merchant → category, logo, PFC).
- **Ortho fit:** improves **§4.3 transaction rules** and the import CLI's
  merchant→category heuristic. Map Plaid PFC → Ortho's category set once, keep it
  deterministic (a static mapping table, no LLM — stays within our no-LLM ethos),
  and let user rules always override. Enrichment of manual rows is the privacy-
  spendier variant (sends merchant strings to Plaid) — gate it as opt-in.
- **Dependencies:** PFC rides free on 2.1; `/transactions/enrich` for manual rows
  is independent but shares the category-mapping work.

### 2.6 Owner auto-assignment ⚪ ⚠️
- **What:** Auto-suggest which household member owns a linked account (the owner
  assignment spec 024 explicitly deferred), so synced transactions default to the
  right split.
- **How (Plaid):** `/identity/get` returns account-holder names/emails/phones on
  file. Match against household members to suggest an owner. Requires the
  `identity` product — **new consent / re-link**.
- **Ortho fit:** would make transaction sync (2.1) land with the correct
  split/ownership instead of always asking. ⚠️ Identity data is the most
  sensitive Plaid payload (PII of both partners); only worth it if 2.1 is live
  and the manual owner picker is friction users actually complain about. Match
  locally, store only the resolved owner, never the raw identity blob.
- **Dependencies:** 2.1; re-link for `identity`.

### 2.7 Investments / holdings ⚪
- **What:** Holdings, allocation, and performance across linked brokerages.
- **How (Plaid):** `/investments/holdings/get` +
  `/investments/transactions/get`. Requires the `investments` product — **new
  consent / re-link**.
- **Ortho fit:** this is the aggregation path to **§2.2 portfolio tracking**,
  which is already flagged ⚪ as far from our household-spending + housing focus.
  Plaid removes the manual-entry and price-feed burden, but the product-thesis
  question from §2.2 stands. Lowest priority unless we broaden the thesis.
- **Dependencies:** re-link for `investments`; §2.2 product decision.

### 2.8 Balance & spend alerts ⚪
- **What:** "Balance below $X", "unusually large transaction", "paycheck landed"
  notifications.
- **How (Plaid):** combine 2.2 balances / 2.1 transaction webhooks with the
  **push path (§8.2)** and our existing **insights engine** rules.
- **Ortho fit:** a thin, high-delight layer *on top of* 2.1/2.2 + push — little
  new Plaid surface, mostly wiring existing pieces. Keep thresholds deterministic
  and user-set (no ML), consistent with our insights approach.
- **Dependencies:** 2.1 and/or 2.2; §8.2 push.

### 2.9 Auto-fetched statements ⚪
- **What:** Pull official PDF statements for linked accounts and feed them into
  the pipeline we already have.
- **How (Plaid):** the `statements` product (`/statements/list` +
  `/statements/download`). New consent / re-link.
- **Ortho fit:** interesting because Ortho **already** has a deterministic
  statement-import CLI and an on-device scan pipeline — Plaid statements could
  auto-supply the input those consume, bridging aggregation to our existing
  deterministic ingestion (arguably a *more* privacy-aligned path than raw
  transaction sync, since it mirrors what a user already downloads). Niche, but a
  natural fit with infrastructure we uniquely have. Lowest priority.
- **Dependencies:** re-link for `statements`; statement-import CLI integration.

---

## 4. Recommended sequencing

1. **Gateway epic — Transaction sync (2.1) + webhook & item-health
   infrastructure (§1).** Highest value, no re-link, and it builds the webhook +
   repair plumbing every other "stay fresh" row reuses. This is also the ⚠️
   positioning decision — settle *that* before scoping the rest.
2. **Balances → net worth (2.2)** and **recurring streams (2.3)** — both ride on
   consent we already hold and light up existing backlog items (§2.1 net worth,
   §4.2 subscription manager) with minimal new Plaid surface.
3. **Categorization/enrichment (2.5)** — cheap once 2.1 is flowing; improves
   rules (§4.3) and the import heuristic. Keep the PFC→Ortho mapping deterministic.
4. **Liabilities (2.4)** — needs a re-link, but the mortgage-seeding tie-in with
   our housing engine is uniquely on-brand. Do once we accept the re-link friction.
5. **Alerts (2.8)** — wiring layer on top of 2.1/2.2 + push (§8.2).
6. **Thesis-dependent / highest-friction:** owner auto-assignment (2.6, ⚠️ PII),
   investments (2.7, product thesis), statements (2.9, niche). Each needs a
   re-link and a deliberate reason.

---

## 5. Guardrails (carry these into any spec)

- **Opt-in, per institution.** Connecting a bank ≠ consenting to ingest its data.
  Every data-pulling capability is a separate, revocable opt-in.
- **Manual / import / scan stay first-class.** Plaid augments; it never becomes a
  required path. Non-linked households must keep every feature (fallback
  detectors, manual entry).
- **Deterministic core stays deterministic.** Map Plaid categories/streams
  through static tables, not an LLM (§5.2 ethos). Plaid is a *seed + reconcile*
  source for money math (esp. the housing engine), never the source of truth that
  bypasses our vector-locked calculations.
- **Secrets discipline.** New products still route through the Vault wrapper RPCs;
  `access_token` and raw provider payloads (identity, full transaction blobs) are
  service-role-only, never logged, minimized before they touch client-visible
  tables.
- **Re-link honesty.** Any product beyond `auth`/`transactions` needs new consent;
  design the update-mode re-link UX before promising the feature on existing items.

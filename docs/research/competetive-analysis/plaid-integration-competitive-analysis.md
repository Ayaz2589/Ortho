# How Companies Use Plaid — Competitive Analysis for Ortho's Bank Integration

**Purpose.** Ortho ships a **connect-only** Plaid integration today (spec 024: link an
institution, list its accounts, store the `access_token` server-side — *no transaction
sync, no balances, no owner assignment*). This report gathers primary-sourced evidence on
how companies actually build on Plaid in production, what it costs, how the reliability and
categorization machinery works, where competitors diverge from Plaid, and what the
2024–2026 open-banking regulatory shift means — then translates all of it into concrete
recommendations for evolving Ortho from connect-only to real transaction sync on its
Supabase-edge / USD-cents-ledger stack.

**Scope & date.** Compiled **2026-07-19**. US-centric. Produced by the repo's
`deep-research` harness (fan-out web search → source fetch → 3-vote adversarial
verification → synthesis); 19 sources fetched, 79 claims extracted, 25 verified, 23
confirmed, 2 refuted, synthesized to 9 findings. Everything tagged below carries the
harness's verification status so you can tell audited fact from directional context.

**Confidence & source tags.**
`PRIMARY` = vendor/official docs or the government rule text itself ·
`SECONDARY` = reputable reporting/analyst ·
`DIRECTIONAL` = appeared in extraction but **did not survive** 3-vote verification, or is a
third-party price estimate — treat as a hypothesis to confirm, not a fact ·
`ORTHO` = engineering synthesis/recommendation by this report, **not** a sourced claim.
Confidence: **H / M / L**.

> **The single most important takeaway.** The modern way to build transaction sync on Plaid
> is **not** polling. It is: initialize an Item with the `transactions` product → receive the
> **`SYNC_UPDATES_AVAILABLE`** webhook → call **`/transactions/sync`** with your saved cursor
> → apply the returned `added` / `modified` / `removed` arrays to your ledger → persist the
> new cursor. Everything else in this document — billing, re-auth, backfill, categorization —
> hangs off that one loop. Ortho's connect-only plumbing already has the hard part (Link,
> token exchange, Vault-stored `access_token`, provider seam); transaction sync is
> additive.

---

## 1. Ortho today (the baseline this analysis measures against)

From spec 024 (`supabase/migrations/20260717120000_plaid_connect.sql`, three edge functions):

- **Three authed Deno edge functions** — `plaid-link-token`, `plaid-exchange`,
  `plaid-disconnect` — call Plaid REST with raw `fetch`, `Plaid-Version: 2020-09-14`, no
  Plaid SDK.
- **Provider-agnostic schema.** `linked_institutions` / `linked_accounts` (client-visible),
  `linked_institution_secrets` → Vault (the `access_token` lives in `vault.secrets`, never
  in a table or client), `plaid_link_sessions` (transient connect attempts). A
  `linked_provider` enum (`plaid`) is the seam for a future second provider.
- **Explicit non-scope (deferred to "the transactions feature"):** no columns on
  `transactions`/`transaction_shares`, no `owner_person_id` on `linked_accounts`, **no
  webhook/audit-log tables**, no `SESSION_FINISHED` webhook (iOS hand-back uses a
  foreground poll instead).
- **Plan:** dogfooding Plaid's free tier (10 permanent Production Items; Sandbox
  unlimited).
- **Ledger invariant Ortho must protect:** every stored amount is a non-negative **integer
  USD cent**; per-person `transaction_shares` must sum to the transaction total, enforced in
  SQL by the atomic `upsert_transaction` RPC.

So the gap to close is precisely: **webhooks + a sync cursor + a dedupe/upsert path into an
integer-cents ledger + connection-health repair UX.** The rest of this report is about doing
that the way production apps do.

---

## 2. Plaid's product surface — what companies actually build on

Plaid is not one API; it's a menu, and *which products you enable per Item drives both cost
and webhooks*. For a budgeting app the center of gravity is **Transactions**. The other
products (Auth, Balance, Identity, Investments, Liabilities, Assets, Income/CRA, Signal,
Transfer, Layer) are mostly for payments, lending, and onboarding — relevant to Ortho only
at the margins. This report deliberately goes deep on Transactions (verified) and treats the
rest as out-of-scope context, because that is where the verified evidence and Ortho's need
both land.

### 2.1 `/transactions/sync` is the canonical architecture — `PRIMARY` · **H**

Plaid **explicitly directs all new integrations to the cursor-based `/transactions/sync`**
endpoint over the older offset-based `/transactions/get`:

> "All new implementations are encouraged to use `/transactions/sync` rather than
> `/transactions/get`." — [Plaid Transactions API docs](https://plaid.com/docs/api/products/transactions/)

Mechanics you must implement:

- **Cursor pagination.** First call sends no cursor; each response returns `added`,
  `modified`, `removed`, a `has_more` boolean, and a `next_cursor`. Keep calling with the
  latest cursor until `has_more` is `false`.
- **The cursor is durable.** "The cursor obtained after all pages have been pulled
  (indicated by `has_more` being `false`) will be valid for **at least 1 year**." So Ortho
  persists one cursor per Item and can safely resume sync days or weeks later.
- **Two documented gotchas** (both from the docs, `PRIMARY`):
  - The **first** `/sync` call for an Item can have up to **8× higher latency** than
    subsequent calls (it's building the initial page set) — don't block a UI thread on it.
  - If the underlying data mutates mid-pagination you get
    `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`; recover by **restarting from your last
    saved cursor** (this is why you persist the cursor *before* you finish, and only advance
    it once a full pass completes cleanly).

### 2.2 It's webhook-driven, not polling — `PRIMARY` · **H**

> `SYNC_UPDATES_AVAILABLE` "will fire whenever any change has happened to the Item's
> transactions … The changes can then be retrieved by calling `/transactions/sync` with the
> cursor from your last sync call." — [Plaid Transactions webhooks](https://plaid.com/docs/transactions/webhooks/)

Nuance that survived verification (the claim initially split 2-1): the webhook removes the
need for *you* to poll to **discover** changes — but you still make **one** `/sync` API call
to **fetch** the delta once notified. `SYNC_UPDATES_AVAILABLE` is the modern `/sync` webhook;
the legacy `/transactions/get` webhooks (`INITIAL_UPDATE`, `HISTORICAL_UPDATE`,
`DEFAULT_UPDATE`, `TRANSACTIONS_REMOVED`) still exist but are for the old endpoint — **Ortho
should ignore them and build only on `SYNC_UPDATES_AVAILABLE`.**

### 2.3 Refresh cadence & the backfill window — `PRIMARY` · **H**

- **Plaid itself only checks upstream 1–4× per day**, depending on institution and account
  type. Bank sync is therefore *near-daily, not real-time*; a household budgeting app should
  set user expectations accordingly ("updated daily"), not promise live balances.
- **History arrives progressively.** `initial_update_complete` flips true at **≥30 days** of
  history; `historical_update_complete` at **up to 24 months**. Your sync loop must tolerate
  a partially-populated Item that keeps growing over the first minutes/hours after link.
- **24 months is a ceiling, not a floor.** Actual available history varies by institution
  (some Items yield only ~3 months). Since **June 24, 2024** the default `days_requested` is
  **90 days** — to get the full 730 days you must **explicitly set `transactions.days_requested`
  = 730** at link-token creation. `ORTHO`: set this to your desired backfill window up front;
  you cannot cheaply widen it later.
- **On-demand refresh exists but is billed separately.** `/transactions/refresh` forces an
  immediate upstream check — but it is a **per-request flat fee on top of** the Transactions
  subscription (see §3). Use it sparingly (e.g. an explicit user "refresh now" button with a
  cooldown), never as your primary sync mechanism.

### 2.4 Connection health & re-auth via update mode — `PRIMARY` · **H**

This is the reliability spine of any always-on bank integration, and it is well-documented:

- **What breaks a connection:** `ITEM_LOGIN_REQUIRED` fires when credentials, MFA, or consent
  change. Separately, **`PENDING_DISCONNECT` (US/CA)** / `PENDING_EXPIRATION` (UK/EU) webhooks
  arrive **7 days before consent expires**.
- **How you fix it — Link in *update mode*:** re-initialize Link **with the existing
  `access_token`** and **no products in the `products` array**. Critically: "An Item's
  `access_token` does **not** change when using Link in update mode, so there is no need to
  repeat the exchange token process."
  ([update-mode docs](https://plaid.com/docs/link/update-mode/)). For Ortho this means re-auth
  reuses the Vault-stored token — no schema change, no re-exchange.
- **Backfill is automatic on restore.** "The next webhook fired for the Item will include
  data for all missed information back to the last time Plaid made a successful connection."
  So a re-authed Item self-heals the gap — *provided* it was initialized with a
  webhook-sending product (Transactions). Your job is only to **proactively nudge the user**
  (in-app banner / email) to re-auth, and to launch update-mode Link when they do.
- Minor exception to "no products": update mode does permit adding
  `assets`/`statements`/`income`/consumer-report — not relevant to Ortho v1.

---

## 3. Pricing & billing — the three models that shape architecture

Plaid's Production billing is not one price; it's **three billing models**, and *which one a
product uses changes how you architect around it.* This is the highest-leverage cost fact in
the report. — `PRIMARY` · **H**
([billing docs](https://plaid.com/docs/account/billing/), [pricing](https://plaid.com/pricing/))

| Model | How it's charged | Products (relevant ones) | Architectural implication |
|---|---|---|---|
| **Subscription (per-Item / month)** | Monthly fee **per connected Item, as long as a valid `access_token` exists — even if you make zero API calls**; **not** pro-rated for mid-month create/remove | **Transactions**, Recurring Transactions, Liabilities, Investments | Every linked bank is a **recurring monthly cost** the moment you enable Transactions on it. Disconnect = stop the token = stop the meter (next cycle). |
| **One-time (per-Item)** | Charged once, when the product is first successfully added to an Item | Auth, Identity, Income (exc. payroll refresh), Layer | Cheap to add opportunistically; irrelevant to Ortho v1. |
| **Per-request (flat fee per successful call)** | Flat fee on **each** successful call | Balance, Signal, Investments Move, **and `/transactions/refresh`** | `/transactions/refresh` is billed **separately from and in addition to** the Transactions subscription. Gate it hard. |

Verbatim anchors: *"An Item will incur a monthly subscription fee as long as a valid
`access_token` exists"*; *"Fees for Items created or removed in the middle of the month are
not pro-rated"*; *"Plaid will charge for the subscription even if no API calls are made."*

**The connect-only corollary (`ORTHO` · **H**):** Because Ortho links Items **without** the
Transactions product today, it accrues **no** Transactions subscription — that's why
connect-only is nearly free. **The moment Ortho enables Transactions on an Item, that Item
starts costing a monthly subscription.** So the unit economics of "deepen the integration"
are literally: *per active linked bank, per month.* This should drive product decisions (e.g.
only enable sync for households on a paid tier; let users disconnect idle banks).

**Trial / Limited Production cap — `PRIMARY` · **H**:** *"Our Limited Production service
allows you to make up to **200 API calls with each available product** using live data."* The
cap is **per product**, and **both failed and successful calls count**; non-product calls
(e.g. `/accounts/get`) don't. `ORTHO`: 200 Transactions calls is enough to validate the sync
loop end-to-end against a couple of real banks, but **not** enough to run a real user base —
plan the Production upgrade (and its per-Item cost) before any GA.

**Dollar figures — `DIRECTIONAL` · **L** (do not quote to anyone):** Third-party/analyst
sources floated per-call ranges (e.g. Transactions "$0.30–$0.60", Balance "$0.05–$0.15") and
an older "Scale tier from $500/mo" (2021). **None of these survived verification** and
Plaid's public pricing page does not publish per-product dollar amounts. Treat exact pricing
as *unknown until you see your own Plaid quote/contract.* The **billing model** (above) is
solid; the **numbers** are not.

---

## 4. Transaction categorization quality — `PRIMARY` · **M/H**

Plaid ships an AI-enhanced Personal Finance Category model, **PFCv2** (released **Dec 3,
2025**), accessed by setting `personal_finance_category_version = 'v2'` (nested under
`options`) when calling Transactions via `/get` or `/sync` (also `/enrich`, `/recurring/get`).
([Plaid blog](https://plaid.com/blog/ai-enhanced-transaction-categorization/),
[PFC migration docs](https://plaid.com/docs/transactions/pfc-migration/))

- **v1 stays available**; customers enabled **before Dec 3, 2025 default to v1** and must
  **explicitly opt in** to v2. `ORTHO`: opt into v2 from day one — there's no back-compat
  reason for a new sync integration to inherit v1.
- **Reported gains — `VENDOR`, unvalidated:** *"up to 10% higher accuracy on primary
  categories and 20% higher accuracy on detailed sub-categories"* vs v1. These are
  **vendor-self-reported with no disclosed methodology** (the claim survived 2-1; the numbers
  are the weak part). Independent categorization quality remains a known industry pain point —
  budget on doing **your own category mapping + user-override UX**, not on Plaid's taxonomy
  being perfect.
- `ORTHO`: Plaid's PFC taxonomy will **not** match Ortho's 12-value `transaction_category`
  enum. You need a deterministic **PFC → Ortho category map** (with a fallback) as pure,
  vector-pinned finance logic, plus a way for users to correct a category and have the
  correction stick across future syncs of the same merchant.

---

## 5. Competitive landscape — how peers wire (or avoid) Plaid

**Honesty flag.** This is the section the research was *weakest* on. The adversarial verifier
**killed almost every per-app "which Plaid products does X use" claim** — those internals are
rarely primary-sourced, and public blog posts don't reliably document them. So this section
separates the **one competitor stance that verified** from **directional** industry knowledge
you should confirm before relying on it.

### 5.1 Verified: not everyone uses Plaid — Actual Budget → SimpleFIN — `PRIMARY` · **H**

**Actual Budget deliberately does *not* integrate Plaid as a first-party option.** Its
official bank-sync page lists **SimpleFIN, GoCardless, Pluggy.ai, Akahu, Enable Banking** —
Plaid appears only via third-party community forks.
([Actual bank-sync docs](https://actualbudget.org/docs/advanced/bank-sync/simplefin/))

- **SimpleFIN Bridge** uses **MX** as its upstream aggregator, and charges a **flat,
  consumer-facing $1.50/month or $15/year** for up to 25 institutions.
  ([SimpleFIN Bridge](https://beta-bridge.simplefin.org))
- **Why this matters for Ortho:** it's a live proof that a budgeting app can sync banks
  **without Plaid's B2B per-Item billing** — trading Plaid's breadth/reliability and OAuth
  coverage for a flat, cheap, privacy-forward consumer price. Ortho's spec-024 research
  already flagged SimpleFIN as "best for a private family app, rejected on commercial
  trajectory." That trade-off is real and worth revisiting *if* per-Item Transactions cost
  turns out to threaten Ortho's margins at its price point.

### 5.2 Directional: the rest of the field — `DIRECTIONAL` · **L**

None of the following survived verification; they are widely-reported but **treat as
hypotheses to confirm**, not facts to cite:

- **Mint's shutdown (2024)** pushed a cohort of budgeting apps to prominence — **Monarch
  Money, Copilot, Rocket Money, Simplifi, YNAB, Lunch Money, Origin** — most of which
  advertise Plaid (and often **MX/Finicity** as fallbacks) for bank linking. *Which* Plaid
  products, sync cadence, and enrichment each uses is **not** publicly, primarily documented.
- **YNAB and others are widely reported to use multiple aggregators** (Plaid + MX +
  Finicity) to maximize institution coverage — a common production pattern (aggregator
  redundancy) but unconfirmed here.
- **Empower / Personal Capital, PocketGuard** — reportedly Plaid/aggregator-based; internals
  unverified.
- **Teller** (developer-favorite, mTLS client certs) was flagged in Ortho's own 024 research
  as *likely unusable inside Supabase Edge Deno* — a real constraint if a second provider is
  ever considered.

**`ORTHO` recommendation for this gap:** if the competitive-wiring detail matters to a
product decision, the way to get it is **not** more web search (it isn't published) — it's
**hands-on**: create sandbox accounts, read each app's public API/help docs, and inspect what
they actually request. Flagged as an open question in §8.

---

## 6. The regulatory backdrop — open banking / CFPB 1033

This shifted under our feet and the research caught the nuance. Handle with care.

- **Verified core — `PRIMARY` · **H**:** the CFPB's Section 1033 final rule (Federal Register
  2024-25079, finalized **Nov 18, 2024**) **bars credential-based screen scraping**: *"the
  data provider cannot comply with the requirement to make data available to authorized third
  parties by allowing the third party to engage in screen scraping."* It pushes the industry
  toward **tokenized, API-based access** — i.e. it *reinforces* an aggregator-based strategy
  (Plaid/MX/etc.) rather than DIY credential storage.
  ([Federal Register final rule](https://www.federalregister.gov/documents/2024/11/18/2024-25079/required-rulemaking-on-personal-financial-data-rights))
- **What was *refuted* (1-2) — do not overclaim:** the broader framings that 1033 gives
  consumers a blanket data-access *right* underpinning aggregators, and that it *prohibits
  fees* for API access, **did not survive verification.** In fact the fee question is live and
  going the *other* way in practice:
- **Directional but materially important — `SECONDARY` · **M**:** in **July 2025 JPMorgan
  Chase announced data-access fees**, and **Plaid agreed to pay** to keep retrieving data
  that was previously free. As of early 2026 the 1033 rule is **legally final but its near-term
  enforcement is stalled** by litigation and a CFPB reconsideration under the current
  administration; the April 2026 compliance deadline for the largest banks was **enjoined**.
  ([Payments Dive](https://www.paymentsdive.com/news/plaid-to-pay-for-jpmorgan-data-open-banking-fintechs/760192/),
  [American Banker](https://www.americanbanker.com/news/on-the-day-of-a-would-be-deadline-open-banking-is-in-flux))

**`ORTHO` read:** the regulatory tide favors **tokenized aggregator access over screen
scraping** (good — that's what Plaid is), but the "data will be free" assumption is **wrong**;
banks are starting to charge aggregators, which will eventually flow into Plaid's per-Item
pricing. Do not build a business model that assumes bank data stays cheap forever. This
*strengthens* the case for (a) enabling Transactions only for paying households, and (b)
keeping the provider seam so a cheaper aggregator (SimpleFIN/MX-upstream) stays an option.

---

## 7. Recommendations — how Ortho should evolve connect-only → sync

All `ORTHO` (engineering synthesis grounded in the verified findings + spec 024's actual
schema). Ordered as an implementable path.

1. **Enable the `transactions` product at link time, opt into PFCv2, request your backfill
   window.** In `plaid-link-token`, add `transactions` to `products` and set
   `transactions.days_requested` (e.g. 730 for full history, or 90 to start cheap) and
   `personal_finance_category_version: 'v2'`. Remember: this flips each Item onto the
   **monthly Transactions subscription** (§3) — so gate it behind the paid entitlement.

2. **Add a fourth edge function: `plaid-webhook` (unauthenticated, signature-verified).** It
   receives `SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED`, and `PENDING_DISCONNECT`. Spec
   024 explicitly deferred "webhook/audit-log tables" to this feature — now is when they land.
   Verify the Plaid webhook JWT (the verification-key plumbing 024 deferred) before trusting a
   payload; treat the webhook as *only a trigger* — never trust its body as data, always
   re-fetch via `/sync`.

3. **Persist a sync cursor per Item.** New column/table: `linked_institutions.transactions_cursor`
   (nullable text) — or a dedicated `plaid_item_sync` row. Advance it **only after a full
   pagination pass completes** (`has_more == false`); on
   `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, restart from the last committed cursor.

4. **Reconcile `added`/`modified`/`removed` into the integer-cents ledger idempotently.** Key
   incoming rows by Plaid's `transaction_id`. Convert Plaid's decimal `amount` to **integer
   USD cents** at the boundary (round half-to-even, guard against float drift — this is the
   USD-cents invariant). `added` → insert (skip if `transaction_id` already seen);
   `modified` → update; `removed` → soft-delete/mark. **Route every write through the atomic
   `upsert_transaction` RPC** so the `transaction_shares`-sum-equals-total constraint holds.
   Decide the split rule for synced rows (default to the linking member? unassigned pending
   review?) — that's a product decision to spec.

5. **Map PFC → Ortho's 12-value category enum as pure, vector-pinned logic.** New file under
   `web/lib/finance/` with a deterministic PFCv2→category map + fallback, regenerated into a
   regression vector (`npm run gen:vectors`), reconciled in `PARITY.md`. Add per-merchant
   user category overrides that persist across future syncs.

6. **Build the connection-health repair loop.** On `ITEM_LOGIN_REQUIRED` /
   `PENDING_DISCONNECT`: set `linked_institution_status` to a new `needs_reauth` state, show a
   calm in-app banner (never alarmist — house style), and wire a "Reconnect" button that
   launches **Link in update mode with the Vault `access_token` and no products.** No
   re-exchange, no new token. Plaid backfills the gap automatically on the next webhook.

7. **Gate `/transactions/refresh` behind an explicit, rate-limited user action.** It's a
   billed per-request call. A manual "Refresh now" with a cooldown is fine; automatic refresh
   on every app open is a cost trap.

8. **Keep the provider seam honest.** The verified SimpleFIN/Actual data point plus the
   JPMorgan-fee trend mean a cheaper aggregator may matter later. Keep sync logic behind the
   `linked_provider` abstraction so Transactions-sync isn't hard-wired to Plaid's payload
   shape.

9. **Respect the platform limits.** All of this is JS/Deno and testable in a Linux sandbox
   against **Plaid Sandbox** (unlimited) — no macOS needed until the iOS Capacitor shell needs
   the webhook round-trip verified. Validate the full loop in Sandbox, then a *tiny* Limited
   Production run (≤200 Transactions calls) against one or two real banks before committing to
   paid Production.

---

## 8. Open questions (what this research could *not* settle)

1. **Per-app competitive wiring.** Which Plaid products / sync cadence / enrichment Copilot,
   Monarch, YNAB, Rocket Money, Simplifi, Lunch Money, Origin actually use — and who has moved
   to MX/Finicity/Teller or direct OAuth. *Not publicly primary-sourced; get it hands-on.*
2. **Real Plaid dollar pricing.** Actual Production per-Item Transactions subscription price,
   `/transactions/refresh` per-call price, volume tiers, and contract minimums — only knowable
   from a Plaid quote. Drives whether per-Item economics work at Ortho's price point.
3. **Ortho-specific dedupe edge cases.** Handling `pending` → `posted` transitions (Plaid
   re-keys some transactions), cross-account transfers appearing on both sides, and the
   `modified`-that-changes-amount case against an already-split transaction.
4. **1033's live legal status (mid-2026).** The rule is final but enjoined/under
   reconsideration; whether tokenized access becomes mandatory-and-free, or banks keep
   charging aggregators (raising Plaid's prices), is unresolved and worth monitoring.

---

## 9. Sources

Primary (Plaid official docs & the rule text):
- Transactions API / `/transactions/sync` — https://plaid.com/docs/api/products/transactions/
- Transactions product overview — https://plaid.com/docs/transactions/
- Transactions webhooks (`SYNC_UPDATES_AVAILABLE`) — https://plaid.com/docs/transactions/webhooks/
- Link update mode — https://plaid.com/docs/link/update-mode/
- Item errors (`ITEM_LOGIN_REQUIRED`) — https://plaid.com/docs/errors/item/
- Billing models — https://plaid.com/docs/account/billing/
- Pricing / Limited Production cap — https://plaid.com/pricing/
- PFCv2 AI categorization — https://plaid.com/blog/ai-enhanced-transaction-categorization/ · https://plaid.com/docs/transactions/pfc-migration/
- CFPB 1033 final rule — https://www.federalregister.gov/documents/2024/11/18/2024-25079/required-rulemaking-on-personal-financial-data-rights

Competitor (primary):
- Actual Budget bank sync (SimpleFIN) — https://actualbudget.org/docs/advanced/bank-sync/simplefin/
- SimpleFIN Bridge pricing — https://beta-bridge.simplefin.org

Secondary (regulatory/market, directional):
- Plaid to pay JPMorgan for data — https://www.paymentsdive.com/news/plaid-to-pay-for-jpmorgan-data-open-banking-fintechs/760192/
- Open banking in flux (deadline) — https://www.americanbanker.com/news/on-the-day-of-a-would-be-deadline-open-banking-is-in-flux
- Aggregators push secure access as 1033 rewrite looms — https://www.pymnts.com/bank-regulation/2026/data-aggregators-push-secure-access-as-rule-1033-rewrite-looms/

**Refuted / excluded (did not survive 3-vote verification):** broad "1033 grants a blanket
consumer data right underpinning aggregators" framing; "1033 prohibits fees for API access";
and all per-app "which Plaid products X uses" internals. Documented here so they are not
silently reintroduced.

# SimpleFIN (Bridge) — Developer Analysis for Ortho

**Purpose.** The Plaid competitive analysis
([plaid-integration-competitive-analysis.md](./plaid-integration-competitive-analysis.md))
identified **SimpleFIN** as the one *verified* way a budgeting app syncs banks **without**
Plaid — it's what Actual Budget uses, at a flat consumer price. This doc goes a level deeper:
what SimpleFIN actually is as a developer protocol, how its token flow and `/accounts` API
work, and whether/how it could help Ortho — either as the cheap bank-sync path or as the
second provider behind Ortho's existing `linked_provider` seam.

**Scope & date.** Compiled **2026-07-19** from the SimpleFIN Bridge developer page
(<https://beta-bridge.simplefin.org/info/developers>), the SimpleFIN Protocol spec
(<https://www.simplefin.org/protocol.html>), and the Bridge homepage. Read alongside the
Plaid analysis — the two are the "expensive/broad vs cheap/narrow" poles of Ortho's
bank-sync decision.

**Confidence tags.** `PRIMARY` = SimpleFIN's own docs · `ORTHO` = engineering
synthesis/recommendation by this report (not a sourced claim) · ⚠️ = **verify against a live
sandbox response before coding** (the published spec has version-dependent field names — see
§3.3).

> **One-line takeaway.** SimpleFIN is a dead-simple, **read-only**, HTTP-Basic-auth protocol:
> claim a one-time setup token → get an Access URL with embedded credentials → `GET
> /accounts` returns accounts + transactions as JSON, where **every amount is a *signed
> decimal string*** (e.g. `"-33.45"`). It's ~10× cheaper than Plaid and trivially simple to
> integrate on Supabase edge functions, but it's **pull-only (no webhooks)**, capped at ~24
> requests/day, and its upstream breadth/reliability is MX-via-Bridge, not Plaid's. It's a
> strong candidate for a **cheap tier / second provider**, not a wholesale Plaid replacement.

---

## 1. What SimpleFIN is — protocol vs Bridge — `PRIMARY`

Two distinct things share the name:

- **The SimpleFIN Protocol** — an open, minimal spec (<https://www.simplefin.org/protocol.html>)
  for *read-only* transfer of financial data. Any server can implement it. It defines the
  token flow, the `/accounts` endpoint, and the JSON schema. That's essentially the whole
  protocol — it is deliberately tiny.
- **SimpleFIN Bridge** (`beta-bridge.simplefin.org`) — a *hosted implementation* of that
  protocol that connects to real banks (upstream aggregator: **MX**, per the Actual Budget
  docs verified in the Plaid analysis). This is the thing you'd actually integrate against.
  Consumer-facing pricing, one account connects "up to **25 institutions and 25 apps**."

The design ethos is the opposite of Plaid's: no SDK, no OAuth dance in your code, no product
menu, no webhooks. Just an authenticated URL you `GET`.

**Security model — `PRIMARY`:** access is **read-only**; "Your application never sees the
user's bank account credentials"; and "At any point, the user can disable the Access Token."
Credentials ride in the Access URL as HTTP Basic Auth (`scheme://user:pass@host/path`).

---

## 2. The token flow — `PRIMARY` · ⚠️ verify exact endpoints

Five steps, single-use setup token:

1. The **user** obtains a **Setup Token** from the Bridge (they go to the Bridge, connect
   their bank(s), and get a token to hand to your app).
2. User pastes the Setup Token into Ortho.
3. Ortho **base64-decodes** the token → yields a **claim URL** → **POSTs** to it.
4. The Bridge responds with an **Access URL** that embeds Basic-Auth credentials, of the form
   `https://<user>:<pass>@<host>/simplefin`.
5. Ortho **stores the Access URL securely** and uses it for all subsequent `/accounts` calls.

> **Critical:** "You can only do the above step once." The setup token is **single-use** —
> once claimed, it's dead, and the Access URL is the durable credential. Lose the Access URL
> and the user must generate a new setup token.

`ORTHO` implications:
- The Access URL **is** the long-lived secret (analogous to Plaid's `access_token`). It must
  go in **Vault**, exactly like Ortho already stores the Plaid token in
  `linked_institution_secrets` → `vault.secrets`. Never in a client-visible table, never to
  the browser.
- The whole exchange is server-side — a natural fit for a new edge function
  (`simplefin-claim`) mirroring `plaid-exchange`.
- **No OAuth redirect, no Link SDK, no hosted-flow hand-back.** The user does the bank
  connection *on the Bridge's site* and returns with a token string. That sidesteps the
  entire iOS Hosted-Link / custom-scheme / foreground-poll machinery spec 024 needed for
  Plaid — the iOS flow becomes "open Bridge in the browser, come back, paste token."

---

## 3. The `/accounts` endpoint — the whole data API — `PRIMARY`

### 3.1 Request

`GET {ACCESS_URL}/accounts` with HTTP Basic Auth (from the Access URL). Query params:

| Param | Meaning |
|---|---|
| `start-date` | Unix epoch seconds, **inclusive** |
| `end-date` | Unix epoch seconds, **exclusive** |
| `pending` | `1` to include pending transactions (default: excluded) |
| `account` | filter to an account id (repeatable) |
| `balances-only` | `1` to skip transactions (balances only) |
| `version` | protocol version (`1` or `2`) |

- **Date range is capped at 90 days per request** ("difference between `start-date` and
  `end-date` is limited to 90 days at a time"). Longer history = multiple windowed calls.
- `balances-only=1` is the cheap "is the connection alive / current balance" call.

### 3.2 Response — accounts + transactions (v2 shape)

The response is a single JSON object: an errors list, connection/organization info, and an
`accounts` array, each account carrying its `transactions`. Representative v2 shape ⚠️:

```json
{
  "errlist": [],
  "connections": [
    {
      "conn_id": "10829309823094234",
      "name": "My Bank - Jeff",
      "org_id": "INST-982394823948230-2340923094",
      "org_name": "My Bank",
      "org_url": "https://mybank.com",
      "sfin_url": "https://sfin.mybank.com"
    }
  ],
  "accounts": [
    {
      "id": "2930002",
      "name": "Savings",
      "conn_id": "10829309823094234",
      "currency": "USD",
      "balance": "100.23",
      "available-balance": "75.23",
      "balance-date": 978366153,
      "transactions": [
        {
          "id": "12394832938403",
          "posted": 978360153,
          "amount": "-33.45",
          "description": "Uncle Frank's Bait Shop",
          "transacted_at": 978360000,
          "pending": false,
          "extra": {}
        }
      ]
    }
  ]
}
```

Field semantics (`PRIMARY`):

- **`amount` is a signed *numeric string*** (e.g. `"-33.45"`, `"100.23"`). **Positive =
  deposit/inflow into the account.**
- **`balance` / `available-balance`** — also numeric strings (decimal).
- **`currency`** — ISO 4217 code (`"USD"`, `"ZMW"`, …) *or* a custom currency URL.
- **`balance-date`, `posted`, `transacted_at`** — Unix epoch seconds. `posted` may be `0`
  for a pending transaction; `transacted_at` (optional) is when the purchase actually
  happened vs when it posted.
- **`id`** — "uniquely describes a transaction **within an Account**" (see dedupe, §4).
- **`pending`** — boolean, optional, default false. **`extra`** — free-form object
  (institution-specific fields).
- **Errors** are returned in-band (the errors list) — "Always show those errors to your end
  users." Error codes follow a `prefix.subcode` scheme (`gen`/`con`/`act`), e.g. `gen.auth`,
  `con.auth`, `act.failed`, `act.missingdata`; consumers should fall back to the prefix for
  unknown subcodes.

### 3.3 ⚠️ Schema is version-dependent — pin and verify

The published spec renders **differently across protocol versions**, and our source fetches
disagreed on exact key names. Observed variants:

- A **v1-style** shape: top-level `errors` (array of strings) and organization info **nested**
  as an `org` object *inside each account*; transactions include `payee` and `memo`.
- A **v2-style** shape (shown above): top-level `errlist` + a `connections` array with
  `conn_id`/`org_id`, accounts referencing `conn_id`.

**`ORTHO` action:** do **not** hard-code field names from this doc. Before writing the
parser, (a) fix a `version` explicitly on every request, and (b) capture a **real sandbox
`/accounts` response** and generate the TS types from *that*. Treat the schema above as the
map, not the territory.

---

## 4. Syncing, dedupe & the pull model — `PRIMARY` + `ORTHO`

This is where SimpleFIN differs most from Plaid, and it shapes Ortho's architecture:

- **Pull-only. There are no webhooks.** You poll `GET /accounts` on a schedule. Intended
  usage: **"Daily updates … 24 requests or fewer per day."** Separate quotas for all-accounts
  vs per-account requests; exceeding them first warns (in the errors list), then **disables
  the Access Token**. `ORTHO`: budget **one scheduled daily sync per connection** (a cron/edge
  invocation), plus a rate-limited manual "refresh" — nothing like Plaid's event-driven
  `SYNC_UPDATES_AVAILABLE` loop.
- **No delta endpoint.** Unlike Plaid's cursor with `added/modified/removed`, SimpleFIN just
  returns the transactions in your date window. **You compute the delta yourself** by keying
  on transaction `id` and upserting.
- **`id` is unique *within an account only*** and may be **reused across accounts**. So the
  dedupe key must be **`(account_id, transaction.id)`**, never `transaction.id` alone.
- **No documented "modified/removed" signal.** A pending transaction that later posts can
  change its `id`/`amount`/`posted` — you must reconcile pending→posted yourself (re-fetch
  the window with `pending=1`, match heuristically, supersede the pending row). This is real
  work SimpleFIN pushes onto the client that Plaid handles for you.

---

## 5. Pricing — `PRIMARY`

SimpleFIN Bridge: **$1.50 + tax / month** or **$15.00 + tax / year**, for up to **25
institutions and 25 apps** per account. This is a **consumer-facing** subscription the *user*
pays to the Bridge — contrast Plaid's **B2B per-Item** billing that *Ortho* pays. That
difference is strategically important (see §7).

---

## 6. SimpleFIN vs Plaid — the honest comparison

| Dimension | **SimpleFIN (Bridge)** | **Plaid (Transactions)** |
|---|---|---|
| Integration complexity | Trivial: 1 endpoint, Basic Auth, JSON | Link SDK, token exchange, webhooks, update mode |
| Sync model | **Pull-only**, poll ~1×/day (≤24 req/day) | **Webhook-driven** (`SYNC_UPDATES_AVAILABLE`) + cursor |
| Delta handling | **You diff by `(account,id)`** | `added/modified/removed` cursor deltas |
| Amount format | Signed **decimal string**, +=inflow | Decimal, **+=money leaving account** (opposite sign) |
| History window | 90 days/request (window it) | up to 24 mo (`days_requested`) |
| iOS flow | User claims token on Bridge site, pastes it | Hosted Link + custom-scheme hand-back (spec 024) |
| Re-auth/health | User re-enables on Bridge; errors in-band | Update mode, `ITEM_LOGIN_REQUIRED`, auto-backfill |
| Categorization | **None** — raw description only | PFCv2 AI categories |
| Who pays | **Consumer** pays Bridge $1.50/mo | **Ortho** pays per-Item subscription |
| Upstream breadth | MX (via Bridge) | Plaid's full institution + OAuth coverage |
| Webhooks | ❌ none | ✅ |

**Net:** SimpleFIN trades *breadth, richness, and automation* for *radical simplicity and a
flat, cheap, consumer-borne price*. Plaid is the product-grade path; SimpleFIN is the
indie/privacy-forward path Ortho's own 024 research already flagged.

---

## 7. How SimpleFIN could help Ortho — `ORTHO`

1. **A genuine second provider behind the existing seam.** Spec 024 built
   `linked_provider` (`plaid`) *specifically* so a second provider could slot in. SimpleFIN
   is the obvious candidate: add `simplefin` to the enum, store the Access URL in Vault beside
   the Plaid token, and let the sync layer branch on provider.
2. **A cheaper path to transaction sync than Plaid.** The Plaid analysis showed each
   Transactions-enabled Item becomes a **monthly per-Item cost to Ortho**. SimpleFIN moves
   that cost **to the user** ($1.50/mo to the Bridge) and off Ortho's P&L — attractive for a
   free/low tier, or for privacy-conscious households who prefer not to route through Plaid.
3. **Dramatically less iOS/native surface.** No Hosted Link, no `ortho://` custom scheme, no
   foreground poll — the token-paste flow works identically on web and in the Capacitor shell
   with zero native plumbing. That's a real fit for spec 021's "no native feature work"
   posture.
4. **Reuses the same ledger-boundary work.** Whichever provider, Ortho must convert a decimal
   string → **integer USD cents**, dedupe idempotently, and write through the atomic
   `upsert_transaction` RPC. A provider-agnostic "normalize → cents → upsert" core (pure,
   vector-pinned) serves both Plaid and SimpleFIN.

### Costs / risks to weigh — `ORTHO`
- **Sign convention is inverted** vs Plaid (SimpleFIN +=inflow; Plaid +=outflow). The
  normalization layer must own sign per provider or the ledger flips.
- **No categorization** — Ortho supplies 100% of category assignment from `description` (its
  own rules + user overrides). With Plaid you at least start from PFCv2.
- **Pull-only + 24 req/day** means near-real-time is impossible; "updated daily" is the
  honest promise.
- **Pending→posted reconciliation is on you** (no modified/removed signal).
- **"beta-bridge" and indie** — smaller operation than Plaid; upstream is MX. Reliability/SLA
  is not enterprise-grade. Fine for a household app; a risk to name explicitly.
- **Schema is version-dependent** (§3.3) — pin a version, generate types from a live
  response.

---

## 8. Recommendation — `ORTHO`

Treat SimpleFIN as a **strong "second provider / cheap tier" option, not a Plaid
replacement.** Concretely, when Ortho builds transaction sync (per the Plaid analysis §7):

1. Build the **provider-agnostic normalization + upsert core first** (decimal→cents, dedupe
   on `(account, id)`, sign-per-provider, `upsert_transaction`) — it's required for *both*
   providers and is pure, testable, vector-pinnable logic.
2. Ship **Plaid Transactions** as the primary/product-grade path (webhooks, categorization,
   breadth).
3. Add **SimpleFIN as the second provider** behind `linked_provider` for a cheaper /
   privacy-forward tier — its simplicity means the incremental cost is mostly a `simplefin-claim`
   edge function + a daily poll job + a parser generated from a live sandbox response.
4. Before any of this, **spike SimpleFIN against the Bridge sandbox**: claim a token, capture
   a real `/accounts` v2 response, and confirm the exact schema, the pending→posted behavior,
   and the sign convention empirically (§3.3, §4).

---

## 9. Open questions
- Exact **v2 field names** and whether `payee`/`memo` are present in the current Bridge output
  (resolve by capturing a live response).
- **Pending→posted** behavior in practice: does the `id` change, and by how much does
  `amount`/`posted` shift?
- Bridge **reliability/uptime** and MX upstream institution coverage vs Plaid for the specific
  banks Ortho's households use.
- Whether the Bridge offers a **developer/sandbox** tier for testing without a paid consumer
  subscription, and any per-app (vs per-user) developer terms.

---

## 10. Sources
- SimpleFIN Bridge — Developers — https://beta-bridge.simplefin.org/info/developers
- SimpleFIN Protocol spec — https://www.simplefin.org/protocol.html
- SimpleFIN Bridge — pricing/home — https://beta-bridge.simplefin.org/
- Cross-reference: [Plaid integration competitive analysis](./plaid-integration-competitive-analysis.md) (Actual Budget → SimpleFIN → MX; verified)

# Go/No-Go: Bank-Account Aggregation for Ortho (private family app)

## 1. Verdict

**Yes — via SimpleFIN Bridge.** Aggregation is viable for a private household **without registering a business or passing KYB**. SimpleFIN Bridge is the only option that clears every bar: (a) explicitly *licensed* for ongoing personal use (not a repurposed prototyping tier), (b) read-only by protocol, (c) flat-cheap (~$15/yr paid by the family, no per-account fee, $0 to the developer), (d) needs no business entity/KYB/SDK/OAuth-client, and (e) drops into static-Next + Capacitor + Supabase-Edge with **zero** deep-link/native-SDK/mTLS work because the connect step is "paste a setup token."

Teller free dev tier and Plaid free Trial are *technically* usable at family scale with no KYB but carry ToS-gray-area risk + heavier integration (Teller mTLS client cert likely won't run in a Supabase Edge Function; Plaid in-webview Link deprecated + 10-item cap a 5-person family can exceed). They are fallbacks, not primary.

**Aggregation should complement, not replace, file upload.** Keep the spec-014 review-wizard import path as the safety net.

## 2. Provider ranking (private family, no business, static-export + Capacitor + Supabase)

| Rank | Provider | Business/KYB? | Cost ~4 accts/mo | Capacitor iOS? | Data quality | Security | ToS OK for real personal use? |
|---|---|---|---|---|---|---|---|
| **1 primary** | **SimpleFIN Bridge** | **None** | **~$1.25/mo flat** ($15/yr, ≤25 inst + 25 apps; $0 dev) | **Best — paste-a-token, no SDK/OAuth/deep-link** | Moderate: stable tx id, pending flag, **no categories**, decimal-dollar strings, ~daily refresh, 90-day/request | **Read-only by protocol**; creds held by MX; Access URL = revocable bearer; one-tap disconnect | **Yes — intended personal-finance product** |
| 2 fallback | Teller (free dev) | None (dev); KYB for prod | Free dev; ~$1–2 prod | In-webview drop-in — needs a spike | Strong: ids, categories, webhooks | **mTLS client cert every call** → server-side, likely won't run in Supabase Edge (Deno) | Gray — dev tier is pre-production |
| 3 | Plaid (Trial) | None (**10-item cap**); KYB for prod | Free ≤10; ~$0.30/acct + KYB | Hardest — Hosted Link/native LinkKit + AASA | Excellent: `/transactions/sync` | Bearer, scope can be write | Gray — Trial = hobbyist/eval |
| 4 | Stripe Financial Connections | **Yes** (business/sole-prop + approval) | ~$0.60–0.90 + $1.50/verif | Hosted flow OK | Good | Bearer | Wrong shape — forces business |
| 5 | MX/Finicity/Akoya | **Yes** (enterprise) | Sales-led | N/A | Enterprise | Enterprise | Unavailable to a household |
| 6 | DIY OFX Direct Connect | None | ~Free | Poor | Fragile | **Worst — app holds raw bank logins** | Coverage collapsing (BofA off 9/30/25, Chase since 2022) |

## 3. Recommended architecture (introduces the repo's FIRST Supabase Edge Function)

`[edge_runtime] enabled=true` already; `[db.vault]`/`[edge_runtime.secrets]` are commented stubs; no `supabase/functions/` dir yet.

- **Token custody:** SimpleFIN needs **no app secret**. The per-connection **Access URL** (embeds Basic-Auth creds → treat as bearer) is minted server-side, stored via `vault.create_secret()`; `linked_institutions` keeps only `vault_secret_id`. Client holds the single-use *setup token* for one request. Only the service-role Edge Function reads `vault.decrypted_secrets`.
- **Connect flow (identical web + iOS):** family member links banks at the SimpleFIN Bridge site (system browser; creds go to MX, never Ortho), copies a base64 setup token, **pastes it into one Ortho text field**. Same paste UI in web + Capacitor WKWebView. Edge Function decodes → claims → Access URL → Vault → lists accounts → assign each to a `household_people` person.
- **Sync flow (cron, not webhook):** SimpleFIN is poll-only (~24 req/day). **Supabase Cron** (`pg_cron` + `pg_net`) → daily service-role Edge Function → `GET /accounts` → parse decimal dollars to **integer cents** (never `float*100`) → sign→kind → upsert. Enum is only `expense|income` (no `transfer`). No category from SimpleFIN → reuse `web/scripts/import/engine/categorize.ts` (+ `money.ts`/`toTransaction.ts`/`dedupe.ts`) verbatim in Deno.
- **RLS:** cron writer has no user JWT → must use the **service-role key like the existing import CLI `--admin` path**, setting `created_by`/`household_id`/`paid_by` explicitly + the share invariant (full-amount `transaction_shares` to the account owner; shares sum to `amount_cents`).
- **Schema additions:** `linked_institutions` (household_id, created_by, provider, status, vault_secret_id); `linked_accounts` (institution_id, provider_account_id, name, mask, type, owner_person_id, sync_cursor, last_synced_at, auto_confirm, active); staging **`imported_transactions`** review queue with `external_id` + `linked_account_id` + partial unique index `(linked_account_id, external_id) WHERE external_id IS NOT NULL` for idempotent upsert; optional `sync_runs` log.
- **Dedupe:** key on SimpleFIN's stable transaction `id`. Retire `createdBy|day|amount|source` to a secondary guard for file/CLI rows only.
- **Auto vs review:** **review queue by default** (reuse spec-014 wizard); per-account `auto_confirm` opt-in once trusted.
- **No raw financial file persisted** — SimpleFIN returns structured JSON.

## 4. Replace or complement file upload? → **Complement.** Keep file upload for: coverage gaps (MX can't reach every bank), security-conservative members (no standing credential), provider longevity (SimpleFIN is beta indie, single MX upstream), outages/link breakage. Aggregation *reuses* the spec-014 wizard, replaces nothing.

## 5. Risks (honest)
- **Token custody / always-on blast radius** — the real new risk vs one-off upload: a durable read credential. Mitigate: Access URL in **Vault only**, decrypted only in service-role Edge Function, never in the bundle. SimpleFIN read-only-by-protocol caps worst case at *disclosure* not money movement (May-2026 MX bug exposed ~39 users' balances but **no bank creds**).
- **Link breakage / re-auth chores** — bounded. (90-day re-consent is EU PSD2; US MX/SimpleFIN tokens are long-lived — does not apply.)
- **Provider longevity** — SimpleFIN indie + beta, MX single upstream. Store nothing you can't re-derive.
- **ToS** — SimpleFIN *wins* here; real family use is intended.
- **Regulatory** — household app is not a GLBA institution; CFPB §1033 enjoined/under reconsideration in 2026 — no new duty on Ortho today.

## 6. Cost & effort
- **$:** SimpleFIN ~$15/yr (~$1.25/mo), family-paid, one sub for all accounts. Supabase Edge/cron/Vault within free tier. **Total ≈ $15/yr.**
- **Effort:** first Edge Function + Vault + Cron (one-time infra), port the already-portable import engine to Deno, connect + account-assignment UI, schema + review-queue reuse. SimpleFIN removes the two hardest risks (no Teller mTLS, no Plaid native LinkKit/AASA). ≈ a spec-014-sized effort.

## 7. Open questions
1. **Coverage:** do the family's *actual* banks resolve through MX/SimpleFIN? (Confirm before speccing — the one thing that can invalidate the plan.)
2. **Subscription ownership:** who holds/pays the SimpleFIN sub; is everyone OK linking real banks at SimpleFIN's (beta) MX-powered site?
3. **Auto-import vs review default:** review-queue-by-default + per-account `auto_confirm` opt-in — agreed?
4. **History/retention:** how far back to backfill (90-day/request, chunkable) and how much to keep?
5. **Dependency tolerance:** OK depending on a beta indie provider (SimpleFIN) + single upstream (MX) for the happy path, with file upload as fallback?

## 8. Suggested next step — /speckit-specify one-liner

> **Add read-only bank-account aggregation via SimpleFIN Bridge with web + iOS parity:** a paste-the-setup-token connect flow identical in the static-export Next web app and the Capacitor iOS webview (no SDK/OAuth/deep-link); the Access URL claimed and stored **server-side in Supabase Vault**, never in the client; a daily **service-role Supabase Edge Function** woken by `pg_cron` that pulls `/accounts`, maps decimal dollars to **integer cents**, dedupes on SimpleFIN's **stable transaction id** (partial-unique upsert), assigns each account to a `household_people` owner, and lands synced rows in the **existing spec-014 review-and-confirm queue** (per-account auto-confirm opt-in) — **read-only, no raw financial file persisted at rest**, with file/manual import kept as the fallback.

Before tasks, run two cheap de-risking checks: (1) confirm the family's banks resolve in a SimpleFIN Bridge trial; (2) prototype the setup-token → claim → `GET /accounts` round-trip from a throwaway Deno Edge Function with the Access URL in Vault.

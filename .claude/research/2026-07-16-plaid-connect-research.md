# Plaid Connect — Feature Research (spec 024 grounding)

Date: 2026-07-16. Scope decided by the user: **add Plaid to Ortho — just the connect**
(link a bank account, custody the token, list the linked accounts). Transactions sync,
balances, and everything downstream are later features. This doc synthesizes (a) live
Plaid docs research (verified July 2026) and (b) a full codebase recon, on top of the
two earlier reports in this directory (bank-statement upload; aggregation feasibility
memo — whose SimpleFIN ranking predates the commercial-intent decision; Plaid is the
standing choice, behind a provider-agnostic seam).

## 1. Verified Plaid facts (July 2026, plaid.com/docs)

- **Flow:** server `POST /link/token/create` → client runs Link with `link_token` →
  `public_token` (expires 30 min) → server `POST /item/public_token/exchange` →
  `access_token` + `item_id`. API version header `Plaid-Version: 2020-09-14`.
  Environments: only `sandbox.plaid.com` and `production.plaid.com` (Development env
  removed 2024).
- **Products:** at least one product required in `/link/token/create` (`products: []`
  not allowed). For connect-only: `products: ["auth"]` (one-time fee per Item; free on
  Trial) + `additional_consented_products: ["transactions"]` — consent collected now,
  **billed only when used**, so the later transactions feature needs no re-link.
  `/accounts/get` is a free non-product endpoint (names, masks, types).
- **Web Link (static export OK):** `react-plaid-link@4.x` (`usePlaidLink`); the script
  must load from `https://cdn.plaid.com/link/v2/stable/link-initialize.js` (never
  bundled). Zero server involvement between token create and exchange — perfectly
  compatible with `output: 'export'`. OAuth banks: `redirect_uri` must be a real
  HTTPS route allowlisted in the Plaid Dashboard (no `#` routing); persist the
  `link_token` in `localStorage`, and on the return route re-init Link with the same
  token + `receivedRedirectUri: window.location.href`.
- **Webview is deprecated:** "Using webviews to present Link is deprecated" — Chase
  may block it. Official recommendation for webview/hybrid apps = **Hosted Link**
  opened out-of-process (system browser / ASWebAuthenticationSession).
- **Hosted Link:** `/link/token/create` with `hosted_link: { completion_redirect_uri,
  is_mobile_app: true, url_lifetime_seconds }` → response includes `hosted_link_url`.
  `completion_redirect_uri` may be a **custom app scheme, no Dashboard registration
  needed**. Completion without a redirect also works: poll `POST /link/token/get` —
  session results (incl. `link_sessions[].results.item_add_results[].public_token`)
  are retrievable **up to 6 h after the session ends**; a `SESSION_FINISHED` webhook
  also exists (deferred — see §3).
- **Trial plan (replaced Limited Production for new signups 2026-04-15):** free, real
  production data, **10 production Items max, slots never freed by `/item/remove`**
  (each re-link = new Item = new slot), 8 products included free (Auth, Transactions,
  Balance, Identity, …). Upgrade = KYB-style production-access request. Sandbox:
  unlimited free Items, `user_good`/`pass_good`, `POST /sandbox/public_token/create`
  bypasses the Link UI for automated tests (Platypus OAuth Bank `ins_127287` for OAuth).
- **Token custody:** `access_token` never expires, secret-equivalent, one per Item;
  `item_id` is the stable key. `/item/remove` invalidates it (disconnect best practice).
- **SDK in Deno:** official `plaid` npm SDK depends on axios — known edge-runtime
  liability, unverified under Supabase Deno. **Use raw `fetch`** — we need only
  `/link/token/create`, `/link/token/get`, `/item/public_token/exchange`,
  `/accounts/get`, `/item/remove`. Auth = `client_id`/`secret` in the JSON body,
  base URL switched by a `PLAID_ENV` secret.

## 2. Codebase recon (what we build on)

- **Next spec number: 024** (highest existing 023; 016/017 skipped). Branch via
  `.specify/scripts/bash/create-new-feature.sh` → `specs/024-<short-name>/`.
- **Edge Function template (spec 018):** `supabase/functions/` — user-JWT functions
  build an anon client scoped to the `Authorization` header to resolve the caller,
  plus a separate service-role client for privileged writes; CORS + error envelope
  `{ error: { code, message } }` from `_shared/http.ts` (clients localize by `code`).
  `verify_jwt = false` only for signature-auth webhooks (config.toml per-function
  block). No deno tests — pure logic lives in a `services/*` Vitest package,
  byte-copied to `supabase/functions/_shared/<pkg>/` by a sync script and locked by a
  drift test in web CI (`services/billing` is the model; its tsconfig `lib: ES2022,
  types: []` forces runtime-agnostic code).
- **Vault is net-new:** `[db.vault]` commented out in config.toml; zero prior usage.
  The vault schema is NOT exposed over PostgREST, so Edge Functions must go through
  `SECURITY DEFINER` wrapper RPCs (EXECUTE granted to `service_role` only) to
  `vault.create_secret()` / read `vault.decrypted_secrets`.
- **Migration/RLS patterns:** `20260716130000_subscription_entitlements.sql` is the
  template — enums → tables → indexes → RLS enable → policies → RPCs; service-role-
  only write posture = RLS enabled with zero (or select-only) policies;
  `is_household_member(uuid)` scopes household tables. Latest migration timestamp
  `20260716130000` — the new one must sort after it.
- **Web:** Next 16 App Router static export. New settings sub-page =
  `app/(app)/settings/<x>/page.tsx`; the pattern to copy is
  `web/components/settings/SubscriptionSection.tsx` + `web/lib/billing.ts`
  (`functions.invoke` wrapper returning `{ ok, code }`). Store = split contexts in
  `web/lib/store.tsx` (bootstrap fan-out + refresher functions). External URLs open
  via `window.location.assign` (Capacitor auto-opens non-app-origin top-level
  navigations externally). i18n: every user-visible string must land in all 5
  catalogs (`bn es ja ko zh`) or reachability tests fail. Vitest 4 + Testing Library;
  112 test files; gates = `npm test` + `npx tsc --noEmit` + vector-drift + billing
  package CI.
- **Capacitor:** v8; NO `@capacitor/browser`, NO `appUrlOpen`/universal-link wiring
  today; `@capacitor/app` IS installed (lifecycle listeners already used — 018
  re-derives entitlements on foreground). `server.iosScheme: 'https'` → webview
  origin `https://localhost`. Custom URL scheme = Info.plist `CFBundleURLTypes`
  edit (XML, no Swift — allowed; verified by Capacitor iOS CI).
- **Privacy identity:** `FUTURE-TASKS.md` §1.1 flags bank linking as the biggest
  tension with Ortho's privacy-first identity → the feature must be **opt-in**, with
  manual entry / statement import / scan staying first-class.
- **No existing Plaid/bank-linking code** — greenfield.

## 3. Architecture decisions carried into the spec

1. **Two Link modes, one feature:** web (browser) = embedded `react-plaid-link`;
   Capacitor iOS = **Hosted Link in the external browser** (webview Link is
   deprecated). Completion on iOS: custom-scheme `completion_redirect_uri` +
   `appUrlOpen`, with foreground-poll of `/link/token/get` as the fallback (session
   results live 6 h).
2. **Server side = Supabase Edge Functions with raw fetch** (no npm:plaid):
   `plaid-link-token` (authed; both modes), `plaid-exchange` (authed; accepts a
   `public_token` from embedded Link OR resolves one from a hosted session via
   `/link/token/get`), `plaid-disconnect` (authed; `/item/remove`). **Webhooks
   deferred** to the transactions feature — polling covers connect-only.
3. **Token custody in Supabase Vault** (net-new, per the feasibility memo):
   `access_token` → `vault.create_secret()` via service-role-only wrapper RPCs;
   client-visible tables never carry secrets.
4. **Schema:** household-scoped `linked_institutions` (provider seam: `provider`
   column, `'plaid'` first) + `linked_accounts` (name/mask/type/subtype), member
   select RLS; secrets (vault_secret_id ↔ item) in a zero-policy service-role-only
   table. No sync/staging tables yet.
5. **Provider seam:** pure logic in a new `services/aggregation` package
   (`src/plaid.ts` is the only Plaid-aware file), Vitest-tested, byte-copied into
   `supabase/functions/_shared/aggregation/` with a drift lock — the exact
   `services/billing` extraction contract.
6. **Scope guard:** connect + list + disconnect ONLY. No transactions, no balances,
   no owner-assignment UI, no auto-sync. Trial has 10 permanent Item slots → dev/test
   exclusively on Sandbox; live linking is a deliberate operator act.
7. **Secrets:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` via
   `supabase secrets set` (operator runbook step, like Stripe's).

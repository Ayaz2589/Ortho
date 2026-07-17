# Phase 0 Research: Plaid Connect (spec 024)

All Plaid claims verified against live docs 2026-07-16; full sourced report in
`.claude/research/2026-07-16-plaid-connect-research.md` (plus the two earlier
reports in that directory for the bank-feature context and provider ranking).
No NEEDS CLARIFICATION markers remain.

## D1 — Provider: Plaid (behind a provider-agnostic seam)

- **Decision**: Plaid, dogfooding the free Trial plan (10 permanent production
  Items, Sandbox unlimited), recorded behind a `provider` attribute so the data
  model survives a second provider.
- **Rationale**: Ortho has commercial intent (persistent memory
  `ortho-commercial-intent`); only Plaid scales to a marketed product
  (production access + KYB when ready) while offering a free real-data tier
  today. SimpleFIN (the private-household winner) is ToS-fine but beta-indie
  and not business-grade.
- **Alternatives**: SimpleFIN Bridge (best for a private family app — rejected
  on commercial trajectory); Teller (mTLS client certs likely unusable in
  Supabase Edge Deno, dev tier is ToS-gray); MX/Finicity/Akoya (enterprise
  sales-gated); Stripe FC (forces business entity now).

## D2 — Link mode per surface

- **Decision**: Web = embedded Link via `react-plaid-link@4.1.1` (verified
  React 19-compatible; script self-loads from `cdn.plaid.com`, never bundled).
  Capacitor iOS = **Hosted Link** opened in the external system browser.
- **Rationale**: Plaid: "Using webviews to present Link is deprecated"; Hosted
  Link is Plaid's recommended mode when official SDKs can't be used, including
  webview apps. Chase may block webview Link outright. Embedded Link is
  fully client-side once a `link_token` exists — compatible with
  `output: 'export'` (no server between token create and exchange).
- **Alternatives**: Embedded Link inside WKWebView (deprecated, Chase-hostile
  — rejected); native LinkKit SDK (requires native Swift feature work —
  prohibited by spec 021 posture); Hosted Link on web too (worse UX than
  embedded; kept as an implicit fallback since the plumbing exists).

## D3 — iOS hand-back: custom scheme + foreground poll

- **Decision**: `hosted_link: { completion_redirect_uri: "ortho://plaid-done",
  is_mobile_app: true }`; register `ortho` in Info.plist `CFBundleURLTypes`;
  `App.addListener('appUrlOpen')` routes to Linked banks and completes; an
  `appStateChange` foreground check completes any pending session if the
  hand-back was lost. Completion = server resolves the session via
  `POST /link/token/get` (results pollable ≤ 6 h after session end).
- **Rationale**: custom-scheme `completion_redirect_uri` needs **no Plaid
  Dashboard registration** (verified); universal links would need AASA hosting
  + entitlements (native churn for no v1 gain). The poll fallback satisfies
  FR-004's lost-hand-back scenario; `SESSION_FINISHED` webhook deferred with
  the rest of webhooks to the transactions feature.
- **Alternatives**: universal links (heavier, needs associated domains);
  webhook-driven completion (requires the whole webhook-verification stack —
  JWT verification keys — for marginal v1 value); manual "I'm done" button
  (worse UX, still needed poll plumbing anyway).

## D4 — Server: raw fetch, no Plaid SDK

- **Decision**: three authed edge functions (`plaid-link-token`,
  `plaid-exchange`, `plaid-disconnect`) call Plaid REST with plain `fetch`:
  JSON body auth (`client_id`, `secret`), `Plaid-Version: 2020-09-14`, base
  URL from `PLAID_ENV` (`sandbox.plaid.com` | `production.plaid.com`; the
  Development environment no longer exists). Five endpoints total:
  `/link/token/create`, `/link/token/get`, `/item/public_token/exchange`,
  `/accounts/get`, `/item/remove` (+ `/institutions/get_by_id` for the display
  name).
- **Rationale**: the official `plaid` npm SDK's one runtime dep is axios — a
  documented edge-runtime liability (Plaid docs themselves point Vercel Edge
  users to a community fetch wrapper), and npm-compat under Supabase Deno is
  historically erratic. Five endpoints don't justify an SDK.
- **Alternatives**: `npm:plaid` (rejected above); community `plaid-fetch`
  (unnecessary third-party trust for five endpoints).

## D5 — Token custody: Supabase Vault via service-role wrapper RPCs

- **Decision**: `access_token` → `vault.create_secret()` at exchange time;
  institutions map to secrets via zero-policy `linked_institution_secrets`
  (`vault_secret_id`). Because PostgREST does not expose the `vault` schema,
  three `SECURITY DEFINER` wrapper RPCs (`store_institution_secret`,
  `get_institution_secret`, `delete_institution_secret`) are created in
  `public`, revoked from `public`/`anon`/`authenticated`, granted to
  `service_role` only.
- **Rationale**: the access token is permanent and secret-equivalent (Plaid:
  store "in a persistent, secure manner"); Vault adds encryption at rest and
  keeps the value out of logical dumps. First Vault use in the repo — the
  aggregation feasibility memo already designed this exact pattern.
- **Alternatives**: plaintext column in a zero-policy table (client-invisible
  but plaintext at rest — rejected); `supabase secrets` env (wrong shape —
  per-row secrets, not deploy-time config); encrypt-in-function with an env
  key (hand-rolled crypto, key rotation pain — rejected).

## D6 — Link token parameters

- **Decision**: `products: ["auth"]`,
  `additional_consented_products: ["transactions"]`, `country_codes: ["US"]`,
  `user.client_user_id` = Supabase auth UUID, `language` = active app language
  when in Plaid's supported set else `en`; embedded mode adds `redirect_uri:
  APP_BASE_URL + "/plaid-oauth"` (Dashboard-allowlisted, HTTPS, no hash
  routing); hosted mode adds the `hosted_link` object.
- **Rationale**: ≥1 product is mandatory (`[]` rejected by the API). Auth is a
  one-time-fee product (free on Trial) vs Transactions' monthly per-Item
  subscription; `additional_consented_products` collects the consent now and
  **bills nothing until used** — the future transactions feature needs no
  re-link (FR-011). `/accounts/get` and `/institutions/get_by_id` are free
  non-product endpoints.
- **Alternatives**: `products: ["transactions"]` (starts the subscription
  product on the Item now — wrong for connect-only); no
  `additional_consented_products` (forces every household member to re-link
  when transactions ship — user-hostile and burns Trial slots).

## D7 — Session persistence and idempotency

- **Decision**: server-side `plaid_link_sessions` row per attempt (zero-policy
  table; all access via functions), client keeps only `{ sessionId, linkToken,
  mode }` in `localStorage` while pending. `plaid-exchange` is idempotent:
  a completed session returns its existing institution + accounts; new
  institutions insert with `on conflict (provider, provider_item_id)` reuse.
  Any failure after `/item/public_token/exchange` compensates with
  best-effort `/item/remove` + row cleanup.
- **Rationale**: `public_token` is single-use and 30-min-limited, so naive
  retry after a mid-exchange crash would orphan a live Item (and on Trial,
  permanently burn one of 10 slots). Compensation + idempotency give SC-005's
  "zero partial records" and FR-004's double-hand-back safety.
- **Alternatives**: stateless flow (client holds the link token only — loses
  the iOS foreground-poll path and any retry safety); webhook-confirmed
  completion (deferred, D3).

## D8 — Testing strategy (TDD)

- **Decision**: (1) `services/aggregation` Vitest suite written first —
  request builders, response parsers (fixtures shaped from Plaid sandbox
  responses), error mapping, hosted-session extraction, fetch-injected client;
  drift-lock test vs `_shared/aggregation`. (2) Web Vitest+RTL tests written
  first per component/state: unconfigured/dark, disclosure, connect happy
  path (Plaid modules mocked), abandon, OAuth-return resume, iOS hand-back +
  foreground completion, disconnect confirm + failure, i18n reachability.
  (3) Operator-only sandbox roundtrip probe
  (`web/scripts/ops/plaid-smoke.ts`) using `/sandbox/public_token/create` —
  proves the real REST path without the UI; requires real sandbox keys, so
  not in CI. Edge functions stay thin adapters (018 precedent: logic is
  tested in the core package; adapters have no runner).
- **Rationale**: mirrors the repo's only proven pattern for
  provider+function features (018), satisfies constitution VI, and respects
  sandbox-only credentials (FR-014).
- **Alternatives**: Deno test runner for functions (new toolchain, still
  can't hit Plaid in CI); Playwright E2E vs Plaid sandbox (secrets in CI —
  rejected by FR-014).

## D9 — Feature-dark posture & operator runbook

- **Decision**: missing `PLAID_CLIENT_ID`/`PLAID_SECRET`/`PLAID_ENV` →
  functions return the shared-envelope `not_configured` error; the page shows
  the calm "not available yet" state. `quickstart.md` is the operator runbook
  (Plaid dashboard → keys → redirect-URI allowlisting → `supabase secrets set`
  → `db push` → `functions deploy` → sandbox smoke → production notes).
- **Rationale**: identical to 018's dark-until-runbook posture, which is
  already proven in production; Vercel auto-deploys `main`, so merge order
  must never require backend setup first.
- **Alternatives**: hiding the Settings entry entirely via a build flag
  (invisible features rot; the calm placeholder communicates intent).

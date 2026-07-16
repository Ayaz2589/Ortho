# Implementation Plan: Connect a Bank Account (Plaid Connect)

**Branch**: `024-plaid-connect` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-plaid-connect/spec.md`

## Summary

Household members opt in to link real bank accounts to Ortho via Plaid —
connect-only (no transactions, no balances, no owner assignment). Web runs
embedded Plaid Link (`react-plaid-link`); the Capacitor iOS shell uses Plaid
**Hosted Link** in the external system browser (webview Link is deprecated by
Plaid) with a custom-scheme hand-back plus a foreground poll fallback. All
secret-bearing calls run in three new **Supabase Edge Functions** using raw
`fetch` against the Plaid REST API; the permanent `access_token` lives in
**Supabase Vault** behind service-role-only `SECURITY DEFINER` wrapper RPCs.
Household-scoped `linked_institutions` / `linked_accounts` tables (member
select RLS, service-role-only writes) record display metadata; a zero-policy
`linked_institution_secrets` table maps institutions to Vault secrets. Pure
provider logic is developed test-first in a new **`services/aggregation`**
package byte-copied into `supabase/functions/_shared/aggregation/` with a
drift lock — the exact `services/billing` extraction contract. UI is a new
Settings → "Linked banks" sub-page. Full research grounding:
`.claude/research/2026-07-16-plaid-connect-research.md`.

## Technical Context

**Language/Version**: TypeScript 5 (web: Next.js 16.2.9 + React 19, static
export; edge: Deno 2 via Supabase Edge Functions; core package: runtime-
agnostic TS, `lib: ES2022`, `types: []`)

**Primary Dependencies**: `react-plaid-link@4.1.1` (React 19-compatible,
verified) — the only new npm dependency; Plaid REST API (`Plaid-Version:
2020-09-14`) via raw `fetch` (no `plaid` SDK — axios is an edge-runtime
liability); `jsr:@supabase/supabase-js@2` in functions (existing pattern)

**Storage**: Supabase Postgres — new migration `20260717120000_plaid_connect.sql`
(sorts after `20260716130000`): 4 tables + 2 enums + 3 Vault wrapper RPCs;
Supabase Vault (net-new in this repo) for `access_token` at rest

**Testing**: Vitest (web suite + new `services/aggregation` suite, both in web
CI); TDD throughout — failing test precedes code; fixture-driven parser tests
using sandbox-shaped Plaid responses; operator sandbox smoke script
(`web/scripts/ops/plaid-smoke.ts`, needs real sandbox keys — not CI)

**Target Platform**: Responsive web (desktop + mobile browser) and the
Capacitor iOS shell — one bundle, platform-forked Link mode only

**Project Type**: Web application (static-export SPA) + serverless edge
functions + SQL migration

**Performance Goals**: Link session issued < 2 s perceived; institution +
accounts visible ≤ 5 s after provider flow completes (SC-003); no new eager
bundle weight for users who never open Linked banks (lazy-load the Plaid
integration)

**Constraints**: No server except Supabase Edge Functions (static export —
no Next API routes); Plaid Link script must load from `cdn.plaid.com` at
runtime (never bundled); iOS webview must never host Link; `access_token` is
secret-equivalent — server-side only, encrypted at rest, never logged; Plaid
Trial = 10 permanent production Items → dev/tests use Sandbox exclusively;
no native Swift feature code (Info.plist URL-scheme config only)

**Scale/Scope**: Two-person households; ≤ ~10 linked institutions per
household in practice; 3 edge functions; ~6 web components/routes touched;
5 i18n catalogs to extend

## Constitution Check

*GATE: constitution v2.0.0 evaluated pre-Phase-0 and re-checked post-design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | PASS | Linked banks UI uses existing tokens/components only; no new colors. Plaid Link's own modal is provider chrome outside our DOM (same posture as Stripe Checkout in 018). |
| II. Calm Over Dense | PASS | Disclosure is short plain copy; errors are quiet single-line notices (`role="status"`), never red panels; list rows mirror existing Settings rows. |
| III. Right Form Factor Per Canvas | PASS | Same page both canvases; connect affordance forks by platform (embedded Link vs external browser) — an affordance fork, not a redesign. Safe-areas/keyboard unaffected (provider UI is external on iOS). |
| IV. Plainspoken Voice & Money Formatting | PASS | "Linked banks", "Connect a bank", "Disconnect". No money rendering in this feature (no balances by scope). |
| V. Accessible & Interaction-Complete | PASS | Real `<button>`/`<a>` controls, focus-visible rings, ≥40px targets, `role="status"` notices; list is plain semantic markup. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | PASS | Every pure function (request builders, response parsers, error mapping, session state) lands test-first in `services/aggregation`; web components tested behavior-first via RTL with the data layer mocked; no golden money/date vectors needed (no money math) — deliberate, like 018's entitlement vectors decision. |
| Additional: stack, no second implementation | PASS | All feature code in `web/` + `services/` + `supabase/`; iOS gets it via the same bundle. Frozen `iOS/Ortho-iOS/` untouched. Info.plist `CFBundleURLTypes` is build configuration, not native feature code (same class as existing plist entries). |

**Deviations requiring tracking**: none. (New `services/aggregation` package
and Vault adoption are additive infrastructure with direct 018 precedent —
justified in Complexity Tracking anyway, since they add a package and a new
platform facility.)

## Project Structure

### Documentation (this feature)

```text
specs/024-plaid-connect/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + verified Plaid facts
├── data-model.md        # Phase 1 — tables, RLS, RPCs, state machine
├── quickstart.md        # Phase 1 — operator runbook + validation guide
├── contracts/
│   ├── plaid-functions.md      # HTTP contract of the 3 edge functions
│   └── link-session-lifecycle.md  # session states, idempotency, compensation
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
services/aggregation/                  # NEW package — @ortho/aggregation-core
├── package.json                       # vitest; sync:functions script
├── tsconfig.json                      # lib ES2022, types [] (runtime-agnostic)
├── tsconfig.tests.json
├── README.md                          # extraction contract (billing pattern)
├── scripts/sync-to-functions.mjs      # byte-copy src → functions/_shared/aggregation
├── src/
│   ├── index.ts                       # public surface
│   ├── types.ts                       # LinkedInstitution/LinkedAccount/session/error codes
│   ├── plaid.ts                       # request builders + response parsers (pure)
│   └── plaidClient.ts                 # fetch-injected Plaid REST client factory (pure)
└── test/
    ├── link-token.test.ts             # builder + parser, embedded vs hosted
    ├── exchange.test.ts               # exchange + accounts + institution parsing
    ├── hosted-session.test.ts         # /link/token/get result extraction
    ├── errors.test.ts                 # Plaid error → contract error-code mapping
    ├── client.test.ts                 # plaidClient fetch wiring (fake fetch)
    └── shared-sync.test.ts            # drift lock vs functions/_shared/aggregation

supabase/
├── config.toml                        # + [db.vault] note; no verify_jwt overrides needed
├── migrations/20260717120000_plaid_connect.sql   # NEW (see data-model.md)
└── functions/
    ├── _shared/aggregation/           # GENERATED byte-copy — never hand-edited
    ├── plaid-link-token/index.ts      # authed: create session (embedded|hosted)
    ├── plaid-exchange/index.ts        # authed: complete session (idempotent)
    └── plaid-disconnect/index.ts      # authed: /item/remove + secret delete + status

web/
├── package.json                       # + react-plaid-link@4.1.1
├── lib/aggregation.ts                 # NEW invoke wrapper (billing.ts pattern)
├── lib/store.tsx                      # + linkedInstitutions/linkedAccounts bootstrap + refresh
├── lib/plaidLinkSession.ts            # NEW pending-session persistence (localStorage) + pure helpers
├── app/(app)/settings/page.tsx        # + "Linked banks" entry row
├── app/(app)/settings/linked-banks/page.tsx   # NEW sub-page
├── app/(app)/plaid-oauth/page.tsx     # NEW OAuth return route (web embedded mode)
├── components/settings/LinkedBanks.tsx        # NEW section: disclosure, list, connect, disconnect
├── components/settings/PlaidLinkButton.tsx    # NEW platform-forked connect control (lazy)
├── lib/i18n/{bn,es,ja,ko,zh}.ts       # + all new strings
└── test/settings/linked-banks*.test.tsx, test/lib/aggregation.test.ts,
    test/lib/plaid-link-session.test.ts, test/store/linked-banks-bootstrap.test.tsx  # NEW

web/ios/App/App/Info.plist             # + CFBundleURLTypes scheme "ortho" (config only)
web/scripts/ops/plaid-smoke.ts         # NEW operator sandbox roundtrip probe
.github/workflows/web-ci.yml           # + services/aggregation typecheck+test job steps
docs/supabase.md, docs/web.md          # updated for the new functions/package/page
```

**Structure Decision**: mirrors spec 018 exactly — pure core package under
`services/`, thin Deno adapters under `supabase/functions/`, UI in `web/`,
one migration. This is the repo's established seam for provider-backed
features; no new structural patterns are introduced.

## Architecture decisions (summary — full detail in research.md & contracts/)

1. **Link modes**: web = embedded `react-plaid-link` (script from
   `cdn.plaid.com`, loaded lazily on the Linked banks page); Capacitor =
   Hosted Link URL opened via `window.location.assign` (Capacitor opens
   non-app-origin top-level navigations in the system browser — verified 018
   pattern), `completion_redirect_uri: "ortho://plaid-done"` +
   `App.addListener('appUrlOpen')` + foreground `appStateChange` poll
   fallback. Session results remain pollable server-side for 6 h.
2. **Edge functions authed like `billing-checkout`**: anon client bound to the
   caller's `Authorization` header resolves the user; a separate service-role
   client performs writes. No webhook function (deferred to transactions
   feature) → no `verify_jwt = false` entries needed in `config.toml`.
3. **Token custody**: Vault. Migration creates wrapper RPCs
   (`store_institution_secret`, `get_institution_secret`,
   `delete_institution_secret`) — `SECURITY DEFINER`, `search_path = public`,
   revoked from `public/anon/authenticated`, granted to `service_role` only —
   because the `vault` schema is not exposed over PostgREST. Zero-policy
   `linked_institution_secrets` maps institution → `vault_secret_id`.
4. **Exchange is compensating**: exchange → insert institution → store secret
   → fetch + insert accounts; any failure after `/item/public_token/exchange`
   triggers best-effort `/item/remove` + row cleanup so no orphaned provider
   access survives a partial failure (SC-005, FR-009 posture).
5. **Idempotency**: `unique (provider, provider_item_id)` on
   `linked_institutions`; completed sessions return the existing result;
   double hand-back on iOS is harmless (FR-004).
6. **Link token params**: `products: ["auth"]`,
   `additional_consented_products: ["transactions"]` (consent now, billed only
   when used — future transactions feature needs no re-link, FR-011),
   `country_codes: ["US"]`, `language` from the active app language when Plaid
   supports it (else `en`), `user.client_user_id` = Supabase auth UUID.
7. **Feature-dark posture**: missing `PLAID_*` secrets → functions return the
   contract `not_configured` error; the page renders the calm "not available
   yet" state (FR-012), mirroring 018's fail-open shim philosophy.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New `services/aggregation` package (+ CI steps, sync script, drift lock) | Pure provider logic must be Vitest-testable and TDD-able; Deno functions aren't covered by any test runner in this repo | Logic inline in functions = untested I/O shells (violates Principle VI); importing `services/` directly from functions breaks the Supabase deploy bundler (proven by 018) |
| Supabase Vault adoption (first use in repo) | `access_token` is a permanent, secret-equivalent credential; Vault gives encryption at rest + keeps it out of logical dumps | Zero-policy table column is client-invisible but stores the secret in plaintext at rest; the aggregation feasibility memo already designed the Vault pattern for exactly this credential class |
| New route + custom URL scheme (`ortho://`) | Plaid deprecates webview Link; Hosted Link needs a hand-back into the app | Embedded Link in the WKWebView is deprecated by Plaid and Chase-hostile; polling-only (no scheme) makes the return UX a manual app-switch with no automatic completion signal |

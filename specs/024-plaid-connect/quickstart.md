# Quickstart & Operator Runbook: Plaid Connect (spec 024)

Two audiences: **developers** validating the feature locally/in CI (§1), and
the **operator** lighting it up against real Plaid Sandbox — and eventually
Production (§2–3). Until §2 runs, the feature is deliberately dark: the
functions answer `not_configured` and the Linked banks page shows the calm
"not available yet" state (FR-012) — do not "fix" that.

## 1. Developer validation (no Plaid account needed)

```bash
# Pure provider core (TDD suite — request builders, parsers, drift lock)
cd services/aggregation && npm ci && npm test
npx tsc --noEmit && npx tsc -p tsconfig.tests.json --noEmit

# Web suite (components, store, session lifecycle, i18n reachability)
cd ../../web && npm test
npx tsc --noEmit

# After editing services/aggregation/src — resync the functions copy
cd ../services/aggregation && npm run sync:functions   # then commit the copy
```

Expected: all green. The `shared-sync` test fails if
`supabase/functions/_shared/aggregation/` drifts from
`services/aggregation/src/` — never edit the copy by hand.

**What is covered without credentials**: everything except a live Plaid
round-trip — Plaid HTTP is exercised against recorded sandbox-shaped
fixtures; the web flow is exercised with the Link modules mocked
(constitution VI: mock the data layer, never hit the network).

## 2. Operator: light up Sandbox `[OPERATOR-PENDING]`

Prereqs: Plaid account (free), Supabase CLI linked to `brujhxmtzfgowimprueo`.

1. **Plaid Dashboard** (dashboard.plaid.com):
   - Team Settings → Keys: note `client_id` and the **Sandbox** secret.
   - API → Allowed redirect URIs: add `https://<the Vercel prod URL>/plaid-oauth`
     (exact HTTPS path; wildcards allowed per-subdomain only; localhost HTTP
     is Sandbox-only).
2. **Apply the migration** (adds tables + Vault RPCs):
   ```bash
   supabase db push
   ```
3. **Function secrets** (`APP_BASE_URL` already set by the 018 runbook):
   ```bash
   supabase secrets set PLAID_CLIENT_ID=<client_id> \
                        PLAID_SECRET=<sandbox secret> \
                        PLAID_ENV=sandbox
   ```
4. **Deploy the functions** (all default-JWT — no `--no-verify-jwt` anywhere):
   ```bash
   supabase functions deploy plaid-link-token plaid-exchange plaid-disconnect
   ```
5. **Headless sandbox smoke** (proves the full REST path without the UI —
   uses `/sandbox/public_token/create`, so no browser needed):
   ```bash
   cd web && OPERATOR=1 npx tsx scripts/ops/plaid-smoke.ts
   ```
   Expected output: link-token OK → sandbox item created → exchange OK →
   institution + accounts rows visible → disconnect OK (`/item/remove`
   confirmed) → cleanup done.
6. **Guided UI smoke (web)**: sign in → Settings → Linked banks → Connect →
   institution "First Platypus Bank" → credentials `user_good` / `pass_good`
   → back in Ortho: institution + accounts listed. Then Disconnect → gone
   from active list. For the OAuth path use "Platypus OAuth Bank"
   (`ins_127287`).
7. **Guided UI smoke (iOS shell)**: TestFlight/dev build → same flow — Link
   must open in the **system browser** (never in-app), and returning to the
   app must complete the connection automatically (or within one
   foregrounding). Requires the `ortho://` scheme in the build (committed in
   Info.plist — no operator step).

## 3. Operator: Production notes (later, deliberate)

- Switch = `supabase secrets set PLAID_SECRET=<production secret>
  PLAID_ENV=production` + re-deploy nothing (functions read env at runtime).
- **Trial plan: 10 production Items, permanent** — `/item/remove` does NOT
  refund a slot. Every live link is a budget decision; re-linking the same
  bank burns a new slot. Dogfood on Sandbox; go live deliberately.
- Full production access (unlimited Items, paid) = Plaid's
  "Request production access" flow (business description + beneficial
  ownership — the KYB step planned for Ortho's commercial launch).
- The redirect URI allowlist must also carry any preview/staging origins you
  actually use; never add localhost in Production.

## 4. Acceptance validation map (spec → how to verify)

| Spec item | Verification |
|---|---|
| US1 (web connect) | §2.6 guided smoke; RTL suite `web/test/settings/linked-banks*` |
| US2 (iOS connect) | §2.7 guided smoke; session-lifecycle unit tests (hand-back + foreground poll) |
| US3 (disconnect) | §2.5 headless smoke (provider-side revoke asserted) + §2.6 |
| US4 (household visibility) | RLS: member-select policies in the migration; store bootstrap test |
| SC-002 (no secrets client-side) | zero-policy tables + Vault; grep the static export for `PLAID_`; exchange response contract carries display data only |
| SC-005 (no partial records) | compensation tests in `services/aggregation`; abandon-path RTL tests |
| FR-012 (dark until configured) | delete the secrets locally → functions answer `not_configured` → page shows the calm placeholder (RTL-tested) |

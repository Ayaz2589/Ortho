# Quickstart / Verification: SimpleFIN Bank-Sync (spec 028)

How to build and verify this feature **without a live SimpleFIN Bridge account**. All
provider interactions are exercised against mocked `fetch`; the live round-trip is a
documented manual follow-up.

## Prerequisites

- Node 22 (`.nvmrc`); `cd web && npm install`.
- Aggregation core deps: `cd services/aggregation && npm install`.
- Deno for edge-function checks (as in web CI).

## The verification bar (what "done" means — no live account)

Run all of these green:

```bash
# 1. Aggregation core — money/normalization + parsers (TDD heart)
cd services/aggregation
npm run typecheck            # tsc --noEmit (+ tsconfig.tests.json)
npm test                     # normalize, simplefin-claim, simplefin-accounts, + existing plaid (unchanged)
npm run sync:functions       # regenerate _shared byte-copy (now recursive → includes deprecated/ + simplefin*)
npm test                     # re-run: shared-sync drift-lock must be GREEN

# 2. Web — client + Linked banks UI + type mirrors
cd ../../web
npx tsc --noEmit
npm test
npm run build                # next static export must succeed

# 3. Edge functions — pure-logic + type checks (Deno), no Plaid/SimpleFIN network
#    (mirror the web-ci Deno job)
```

Success criteria mapping: SC-002/003/004 are asserted by `normalize.test.ts` +
`simplefin-accounts.test.ts` (sign, dedupe, pending→posted, share-sum). SC-005 is the
unchanged Plaid suite staying green + `next build`. SC-006 is this whole list.

## Manual live verification (later, with a real Bridge account)

1. Create a SimpleFIN Bridge account; connect a bank; generate a **setup token**.
2. In Settings → Linked banks, choose SimpleFIN, paste the token, connect.
3. Confirm the institution + accounts appear.
4. **Capture the real `/accounts` response** and diff it against the fixtures in
   `services/aggregation/test/` — if field names differ (schema is version-dependent,
   research D3), update the parser + fixtures and re-run the bar above.
5. Tap "Refresh now" → confirm transactions import with correct signs; tap again within
   the hour → confirm the calm rate-limit message.
6. Disconnect → confirm status flips and imported transactions remain.

## Scheduling the daily sync (operator / deploy)

Not exercised in CI. Wire a scheduled trigger (Supabase scheduled function / `pg_cron`
/ external cron) to `POST /functions/v1/simplefin-sync` with `{ institutionId }` for
each active SimpleFIN institution, once daily. Keep within SimpleFIN's ~24 req/day/conn
budget.

## Rollback

Plaid remains fully wired under `deprecated/` namespaces. To fall back, re-emphasize the
Plaid connect path in `LinkedBanks.tsx`; no data migration is needed (SimpleFIN rows are
additive and provider-tagged).

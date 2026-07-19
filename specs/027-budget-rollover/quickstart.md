# Quickstart: Budget rollover

## Run & verify (Linux sandbox, all JS — no Xcode needed)

```bash
cd web

# Full regression + new vectors
npm test                     # vitest; budget-rollover.parity.test.ts must pass
npm run gen:vectors          # (re)writes shared/test-vectors/*.json incl. budget-rollover.json
npx tsc --noEmit             # type gate (also gates next build)

# Replay the migration against the local Supabase stack
supabase db reset
```

CI mirrors this: `web-ci.yml` runs `tsc`, `npm test`, and the vector-drift check
on any `web/**` / `shared/test-vectors/**` change; `capacitor-ios-ci.yml`
build-verifies the iOS shell.

## Manual smoke (dev server against local DB)

```bash
cd web && npm run dev        # http://localhost:3000 (publish the port from the host to view)
```

1. Settings → Budgets → pick a category → set a **Flex** budget of `600.00`.
2. Add a `500.00` expense in that category dated last month.
3. Open the Dashboard for **this** month → the bucket shows `$700` available,
   `$700` remaining, and a "$100 rolled over" caption.
4. Add `750.00` of spend this month, advance a month → next month shows exactly
   `$600` available (overspend forgiven, no debt).
5. Switch the same budget to **Non-monthly** and repeat step 4 → the shortfall now
   carries as a negative into the next month.

## What's locked

- `shared/test-vectors/budget-rollover.json` pins the recurrence (fixed / flex /
  flex-capped / opening-carry / non_monthly build+drawdown).
- `insights.json` is **unchanged** for the existing (fixed) cases; new
  flex/non_monthly cases exercise the effective-limit path.
- The full suite runs with one command (`npm test`) and gates the merge.

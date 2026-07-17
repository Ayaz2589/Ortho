# @ortho/aggregation-core

The extraction-ready bank-aggregation core (spec 024): provider-agnostic
types plus everything Plaid-shaped that the `plaid-link-token` /
`plaid-exchange` / `plaid-disconnect` edge functions need — request builders,
response parsers, hosted-session result extraction, and error mapping. The
functions themselves stay thin I/O adapters; every branch worth testing lives
here under Vitest.

## Extraction contract (same rules as `services/billing`)

- **Zero runtime dependencies.** `package.json` has devDependencies only.
- **Zero imports from the host app** — nothing from `web/`, `iOS/`, or
  `supabase/`. The core must compile alone.
- **Runtime-agnostic by construction**: `tsconfig.json` sets
  `"lib": ["ES2022"], "types": []`, so DOM, Node, and Deno globals fail
  typecheck. I/O is injected — `createPlaidClient` takes a structural
  `FetchLike`, never the global `fetch`.
- **Provider-specifics stay in `src/plaid.ts` / `src/plaidClient.ts`.**
  `src/types.ts` is the provider-agnostic seam (FR-010): a second provider
  adds a new module ending in the same shapes, not a reshape.

## How the edge functions consume this

`npm run sync:functions` byte-copies `src/` into
`supabase/functions/_shared/aggregation/` (the Supabase deploy bundler only
reliably follows imports inside `supabase/functions/`). The committed copy is
locked byte-identical by `test/shared-sync.test.ts`, which runs in web CI —
**never edit the copy**; edit `src/` and re-sync.

## Commands

```bash
npm test                                  # vitest run
npx tsc --noEmit                          # core must compile with no env types
npx tsc -p tsconfig.tests.json --noEmit   # tests compile with node types
npm run sync:functions                    # regenerate the _shared copy
```

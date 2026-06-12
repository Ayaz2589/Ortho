# Web test suite

Run from `web/`. No build, dev server, or network needed.

```bash
npm test            # all suites (node logic + jsdom components), one shot
npm run test:coverage   # + v8 coverage with lib/ thresholds
npm test -- test/format.test.ts   # focus one file
npm test -- --watch               # TDD loop
npx tsc --noEmit                  # typecheck (always pair with tests)
```

## Layout & environments

- **Node (default)** — pure-logic suites: `money`, `currency`, `format`,
  `categories`, `utils`, `aggregates`, and the existing `*.parity` suites
  (mortgage, insights) driven by `shared/test-vectors/`.
- **jsdom** — component/store suites opt in with `// @vitest-environment jsdom`
  as the **first line**: `store`, `DatePicker`, `transactions-accordion`, `nav`,
  `tx-form-validation`. They use `@testing-library/react` + `user-event` and query
  by accessible role/label.

`test/setup.ts` registers `jest-dom` matchers and RTL cleanup. The runner uses the
`threads` pool (faster, race-free jsdom startup in CI).

## Helpers (`test/helpers/`)

- `supabase-mock.ts` — `makeSupabaseMock(dataset)`: a chainable, no-network stand-in
  for the Supabase client. `from(table)` resolves rows from `dataset.tables`;
  writes are recorded in `.calls`; `rpc` is configurable. Also `primeFxCache()` and
  `stubNoNetwork()` so the store never calls `fetch`.
- `fixtures.ts` — `makeUser`/`makeHousehold`/`makeTx` builders with overrides.

## Rules (see Constitution Principle VI)

- Deterministic: pass an explicit reference date to date logic, or pin `new Date()`
  with `vi.setSystemTime`. Never assert against the real clock.
- No real network/DB — always mock the Supabase client.
- Assert observable behavior (outputs, accessible DOM), not private internals.

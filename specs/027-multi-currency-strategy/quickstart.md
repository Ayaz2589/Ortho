# Quickstart: validate the decision + its evidence

This feature ships a **decision** (a recommendation doc) plus **one RED reproduction test** as
evidence. There is nothing to run in an app — validation is: run the test, read the doc.

## Prerequisites

- Node 22 (`.nvmrc`), web deps installed: `cd web && npm install`.

## 1. Run the reproduction test (proves the drift)

```bash
cd web && npx vitest run test/multicurrency-instability.test.ts
```

**Expected:** all cases green. The three drift cases are wrapped in `test.fails`, so the suite
passing **confirms** the current model drifts (an expected-failure that threw as expected). The
USD control passes as a normal assertion (zero drift at rate 1.0).

To *see* the drift as a real failure, temporarily change a `test.fails` to `test` and re-run —
it will fail with `expected 103.70 to be 100` (that is the bug, made visible), then revert.

## 2. Confirm nothing else moved (SC-003, SC-005)

```bash
cd web && npm test && npx tsc --noEmit      # full suite + typecheck stay green
git status shared/test-vectors/             # must be empty — vectors byte-identical (NG-003)
```

## 3. Read the recommendation (the actual deliverable)

`docs/future_tasks/9.5-multi-currency-strategy.md` — validate it against the spec's
FR-005..FR-012 and SC-001/SC-004:

- [ ] states today's storage unit (USD cents) and the two conversion points
- [ ] shows the worked drift example (numbers match the test)
- [ ] lays out exactly two options (a) US/USD-defer and (b) native-currency ledger
- [ ] enumerates option (b)'s cost: schema, migration, every read/write, vector harness
- [ ] explicitly rejects the "silent in-between" (rate-alongside-USD)
- [ ] states the research gate (is a non-USD audience in scope?) and is conditional on it
- [ ] scopes correctly: accounting model, **not** the FX feed
- [ ] ends with one recommended option + a one-line actionable rationale

## Done when

Test green (drift confirmed via `test.fails`, USD control passes), full suite + typecheck green,
vectors unchanged, and the doc satisfies every box above.

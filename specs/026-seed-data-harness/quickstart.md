# Quickstart — Seed-Data Harness + Coverage Corpus

All commands run from `web/`.

## Prerequisites
- Node ≥ 20.19 / 22.12, deps installed (`npm ci`).
- For DB seeding only: a **local** Supabase stack (`supabase start`) and
  `.env.local` with its `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

## 1. Run the corpus test suite (default, TZ=UTC)
```
npm test
```
Proves (US1): the corpus is deterministic, every transaction's shares reconcile,
every coverage dimension is present, and the serialized corpus matches the
committed snapshot. Also runs the **A4** divergence test (`splits-divergence.test.ts`)
— timezone-independent, so it lives in the default run.

## 2. Reproduce A2 (timezone insight-bucketing) — non-UTC run
```
npm run test:tz
```
Runs only `*.tz.test.ts` under `vitest.tz.config.ts` (`TZ=America/New_York`).
Expected: `insights-timezone.tz.test.ts` shows ≥ 1 month-boundary transaction
bucketed into the wrong month (US2 / SC-004). The same assertion under the default
`TZ=UTC` run does **not** misbucket — demonstrating the defect is timezone-gated
and why UTC-pinned CI never caught it.

> Note: this test **pins the current (buggy) behavior** so the later §9.4 fix has a
> clear before/after. When A2 is fixed, this test is updated to assert correct
> bucketing.

## 3. Regenerate the committed snapshot (intentional diffs only)
```
npm run gen:corpus
git diff web/test/corpus/__snapshots__/corpus.snapshot.json
```
Run this only when a generator change is meant to alter the corpus. An unexpected
diff here in CI means the generator changed behavior — investigate before
committing.

## 4. Seed a local/dev database (US3)
```
supabase start
npm run seed:corpus                 # writes only to a localhost Supabase
npm run seed:corpus -- --dry-run    # counts + guard, no writes
```
Expected: app screens render varied households (joint + separate finances,
over-budget categories, refunds, a paid-off property, multifamily occupancy).
Re-running produces no duplicate rows (stable ids / upsert). Against a non-local
URL the command **refuses** unless the loud double opt-in is set (see
`contracts/seed-cli.md`).

## 5. Inspect coverage
```
# in a test or a REPL:
import { generateCorpus, coverageOf, DIMENSIONS } from './test/corpus'
const cov = coverageOf(generateCorpus())
// every DIMENSIONS entry maps to ≥ 1 scenario label
```

## What "done" looks like
- `npm test` green (determinism, reconciliation, coverage, snapshot, A4).
- `npm run test:tz` reproduces A2 (documented expected-to-change lock).
- `npm run seed:corpus` populates a local DB idempotently and refuses non-local.
- `lib/` coverage threshold still met; no app-bundle import of `test/corpus/`.

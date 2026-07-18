# Phase 0 Research — Seed-Data Harness + Coverage Corpus

All decisions below resolve the Technical Context; there are no remaining
NEEDS CLARIFICATION items.

## D1 — Deterministic randomness

**Decision**: Ship a tiny seeded PRNG (`mulberry32`) in `test/corpus/prng.ts`;
derive all "random" choices (which merchant, which day within a month, jitter on
amounts) from it. No `Math.random()`, no `Date.now()`, no `crypto`.

**Rationale**: The corpus must be byte-identical across runs and machines
(SC-001) and the constitution forbids asserting against the real clock. A 4-line
integer-hash PRNG is deterministic, dependency-free, and portable. A single
top-level seed threads into per-scenario sub-seeds so scenarios are independent
and reorderable without perturbing each other's output.

**Alternatives considered**: (a) fully hardcoded rows like `gen-vectors.ts` —
rejected: doesn't scale to a few-hundred-household matrix and is tedious to keep
diverse; (b) `seedrandom` npm dep — rejected: unnecessary dependency for 4 lines;
(c) `Math.random` with a mocked global — rejected: leaky, non-portable, fights
the test runner.

## D2 — Canonical serialization + snapshot

**Decision**: Serialize via a **stable-key** stringifier (recursively sort object
keys; arrays keep insertion order) emitting `JSON.stringify(sorted, null, 2) +
'\n'` — matching the `gen-vectors.ts` house style. Commit the result to
`test/corpus/__snapshots__/corpus.snapshot.json`; a test regenerates and asserts
equality, and `npm run gen:corpus` rewrites it intentionally.

**Rationale**: FR-002/SC-001 require byte-stable, diffable output. Sorting keys
removes insertion-order noise so a real behavioral change is the only thing that
moves the snapshot. Mirrors the existing golden-vector regression pattern
(`gen:vectors`), so the team already understands the "diff = signal" workflow.

**Alternatives considered**: Vitest inline/`toMatchSnapshot` — rejected: the
corpus doubles as a **DB seed** and a cross-tool artifact, so it needs to exist as
a real file with a stable canonical form, not a runner-managed snapshot blob.

## D3 — Multi-currency representation

**Decision**: Money stays **USD cents** on every row (the app's model). The
multi-currency dimension is a per-scenario `displayCurrency: CurrencyKey` label.
Coverage assertions and a formatting test push the scenario's USD-cent amounts
through `finance/money.ts` (`toDisplayAmount`/formatting) and `finance/currency.ts`
(`fractionDigits`) under each of USD/EUR/JPY/BDT, exercising conversion + the
JPY zero-decimal path.

**Rationale**: `Transaction` has **no currency column**; the display currency is a
client `localStorage` preference (`store.tsx:278`). Inventing a per-row currency
field would fork the accounting model and pre-empt the §9.5 decision (explicitly
out of scope). Carrying a display-currency *label* exercises the real currency
layer (including JPY) without changing storage. `FALLBACK_RATE_FROM_USD` provides
deterministic rates so conversions are reproducible.

**Alternatives considered**: A fabricated `currency` column on transactions —
rejected: contradicts the constitution ("all money stored as USD cents") and
§9.5's open decision.

## D4 — A2 (timezone insight-bucketing) reproduction

**Decision**: One scenario stores month-boundary transactions (1st/last of month)
at times **other than noon-UTC** (e.g. `...T23:30:00.000Z` and `...T00:15:00.000Z`).
A dedicated `insights-timezone.tz.test.ts`, run under a new `vitest.tz.config.ts`
that sets `process.env.TZ = 'America/New_York'`, asserts that
`insights.ts` month-bucketing (`monthInterval` builds *local* boundaries;
`inInterval` parses `new Date(t.date)`) places at least one boundary row in the
wrong month — and that the same assertion under `TZ=UTC` does **not** misbucket.

**Rationale**: `vitest.config.ts:8` pins `TZ='UTC'` process-wide, which is exactly
what hides A2 from CI. A timezone-dependent defect can only be shown by running
under a non-UTC zone in a *separate* process/config; excluding `*.tz.test.ts` from
the default run and giving it its own config is the least-magic way to do that.
The app masks A2 by storing app rows at noon-UTC (`TxForm` `T12:00:00.000Z`); the
corpus deliberately includes imported/legacy-style non-noon rows to expose it.

**Alternatives considered**: (a) Mocking `Date`/timezone inside one test —
rejected: `TZ` is read by the engine's `new Date(y,m,1)` local construction at call
time; reliably faking the host zone mid-process is brittle. (b) Vitest
`environmentMatchGlobs`/workspace projects — viable, but a second config file is
simpler and self-documenting for a single extra project. The default run stays
`TZ=UTC` and unchanged.

## D5 — A4 (owner-ordering leftover cent) reproduction

**Decision**: One scenario is a household whose members' `sort_order` **disagrees**
with the lexical order of their ids (e.g. person id `p-aaa` has `sort_order: 1`,
`p-bbb` has `sort_order: 0`), with an even-split transaction of an amount that
leaves a leftover cent (e.g. 3 owners / not divisible by 3, or 2 owners of an odd
cent count). The corpus stores shares using the **app-canonical** order
(`orderedOwnerIds`, lexical). `splits-divergence.test.ts` computes the
leftover-cent recipient under (a) `orderedOwnerIds` and (b) `sort_order` ordering
(what `import/db/lookups.ts:37` `.order('sort_order')` yields) and asserts the
recipient **differs** — and that an aligned-order household yields the **same**
recipient under both.

**Rationale**: `computeShares` hands leftover cents out "one per owner in list
order" (`splits.ts:64`), so the recipient is purely a function of input ordering.
Making `sort_order ≠ lexical` observable is precisely the A4 condition; storing
canonical shares keeps the corpus faithful to the app while the test demonstrates
the CLI's divergence.

**Alternatives considered**: Storing CLI-order shares in the corpus — rejected:
that would bake the bug into the fixture; the corpus should reflect app-canonical
truth and let the test surface the divergence.

## D6 — Generator location (not bundle-reachable)

**Decision**: `web/test/corpus/` holds the pure generator modules and their tests.
`scripts/seed-corpus.ts` imports from `../test/corpus`. Nothing under `web/lib/` or
`web/app/` imports it.

**Rationale**: `lib/testdata/seed.ts` deliberately ships in the bundle (behind
`isTestBuild()`); a few-hundred-household corpus must **not**. Placing it under
`test/` keeps it out of every app import graph while remaining a normal TS module
that both `vitest` and `tsx` can import. Confirmed `tsx` (used by `gen:vectors`)
runs modules across `web/` dirs without path restriction.

**Alternatives considered**: `web/lib/testdata/corpus/` — rejected (bundle-reach
risk); a new top-level `web/corpus/` — rejected (extra tsconfig/include wiring for
no benefit over `test/`).

## D7 — Local/dev DB seeding + safety guard

**Decision**: `scripts/seed-corpus.ts` reuses `import/db/client.ts` (`loadEnv` +
`makeClient`, admin/service-role mode) and `import/db/persist.ts` (`persist` for
tx+shares) plus direct inserts for households/people/properties/budgets. Before
any write it enforces a **safe-target guard**: the Supabase URL must be a local
host (`localhost`/`127.0.0.1`/`*.local`) OR the operator must pass an explicit
`--i-understand-this-is-not-local` override AND `SEED_ALLOW_REMOTE=1`. It refuses
otherwise. Ids are stable (from the corpus) so re-running upserts/no-dupes.

**Rationale**: FR-008/FR-009 — the seeder must never mutate the shared hosted
project. A URL allowlist is the cheapest reliable gate; a loud double-opt-in
escape hatch avoids being un-runnable against a personal throwaway cloud project
while making the shared DB effectively unreachable by accident. Reusing `persist`
keeps imported/seeded rows indistinguishable from app rows and inherits its
share-less-row compensation.

**Alternatives considered**: Seeding via raw SQL in `supabase/seed.sql` — rejected:
that file is intentionally empty and SQL would duplicate the generator's logic and
split math; generating rows in TS and inserting via the same client the app uses
keeps one source of truth.

## D8 — Relationship to existing fixtures

**Decision**: Leave `lib/testdata/seed.ts` (in-app sample) and
`test/helpers/fixtures.ts` (`makeTx` factories) as they are. The corpus is
additive infrastructure. Where convenient, `builders.ts` may re-use the same field
shapes as `fixtures.ts` but does not import vitest and is not gated by
`isTestBuild()`.

**Rationale**: The two existing helpers serve narrow, still-valid purposes (the
in-app happy-path demo; per-test single-row construction). Replacing them is scope
creep; the corpus targets systematic edge coverage + DB seeding, a different job.

**Alternatives considered**: Refactoring `seed.ts` to be generated by the corpus —
rejected: couples an in-bundle module to the (bundle-excluded) generator and mixes
the §9.2 realism concern into this feature.

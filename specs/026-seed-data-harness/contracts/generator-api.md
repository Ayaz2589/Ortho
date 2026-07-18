# Contract — Corpus Generator Public API

Module: `web/test/corpus/index.ts` (a pure computation core plus the snapshot
I/O helpers below; no vitest, no app-bundle reach). `generateCorpus`, `toTables`,
`serializeCorpus`, and `serializeManifest` are pure; `writeSnapshot`/`readSnapshot`
are the intentional `node:fs` boundary used by `gen:corpus` and the snapshot test.

## `generateCorpus(seed?: number): Corpus`
- **Input**: optional integer `seed` (default a fixed constant, e.g. `0xORTHO`
  as a number literal). Same seed ⇒ identical `Corpus`.
- **Output**: a `Corpus` (see data-model.md). Pure: no clock, no global state,
  no network.
- **Guarantees**:
  - Deterministic across runs/machines (SC-001).
  - Every `Dimension` in the coverage matrix is represented (SC-002).
  - Every transaction's shares reconcile to its amount (SC-003).
  - Scenario count in the low hundreds (SC-007).

## `toTables(corpus: Corpus): CorpusTables`
- Flattens scenarios into `Record<tableName, Row[]>` matching Supabase table
  shapes, in a stable order. Consumed by the in-memory client and the seeder.
- No row references dangle (referential integrity rule 2).

## `serializeCorpus(corpus: Corpus): string`
- Canonical, byte-stable string: recursively key-sorted, `JSON.stringify(_, null,
  2) + '\n'`. Equal `Corpus` ⇒ equal string (SC-001, FR-002).

## `serializeManifest(corpus: Corpus): string`
- Canonical, byte-stable serialization of the corpus **manifest** — per-scenario
  label, display currency, dimensions, row counts, and a SHA-256 of the scenario,
  plus a whole-corpus hash — **not** the full `serializeCorpus` output. The
  committed snapshot is this manifest, so a generator change surfaces as a small,
  reviewable diff instead of a 5k-line one.

## `writeSnapshot(corpus: Corpus, path?: string): void` / `readSnapshot(path?): string`
- Snapshot I/O (`node:fs`) for `gen:corpus` and the regression test. `writeSnapshot`
  persists `serializeManifest(corpus)`; the test asserts it equals `readSnapshot()`.
  Default path: `web/test/corpus/__snapshots__/corpus.snapshot.json`.

## `coverageOf(corpus: Corpus): Record<Dimension, string[]>`
- Maps each coverage dimension to the labels of scenarios covering it. Used by the
  completeness test (SC-002). A dimension mapping to `[]` is a coverage failure.

## `DIMENSIONS: readonly Dimension[]`
- The authoritative list the completeness test iterates. Adding a dimension here
  without a covering scenario fails the suite by design.

## Split / currency reuse (FR-005, FR-013 — contract-level constraint)
- Shares are produced **only** via `computeShares` / `orderedOwnerIds` /
  `evenShares` from `web/lib/splits.ts`.
- Currency display is exercised **only** via `web/lib/finance/money.ts` +
  `web/lib/finance/currency.ts`.
- The generator MUST NOT contain its own split, rounding, minor-unit, or
  owner-ordering arithmetic. (Enforced by review + a test that constructs a
  known leftover-cent case and checks it against `computeShares` directly.)

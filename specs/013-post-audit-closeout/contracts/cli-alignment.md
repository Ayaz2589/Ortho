# Contract: CLI Alignment to Shared Semantics

All changes live under `web/scripts/import/` (+ `web/lib/types.ts`); locked by red-first Vitest
suites in `web/test/import/` using the existing mock-builder pattern. No iOS involvement.

## A1. `tx list` filtering (FR-010, SC-005)

- Server query narrows by **date window only** (shared `monthBounds` semantics, half-open) and
  household scope; all other criteria evaluate in-process through the apps'
  `filterTransactions(txs, criteria, ctx)` (`web/lib/transactionFilters.ts`).
- Non-admin scope = **household-wide**: resolve the operator's household via `db/lookups.ts
  resolveHousehold` and query rows for its members, matching app behavior (replacing
  `created_by = userId`, `db/transactions.ts:30`).
- New/changed flags: `--query` (free text), `--owner <name>` (resolved to ids, repeatable),
  `--category`/`--source` accept comma/multi values (OR), `--kind` unchanged.
- Row cap: default limit stays 200 but truncation is **explicit**: when the fetched set hits the
  limit, output ends with `showing first N — pass LIMIT= to raise` (FR-010's "explicit and
  user-visible"; SC-005 excludes silent truncation).
- `engine/filters.ts` maps flags → `FilterCriteria`; its `TxFilter`/`monthRange` remain only for
  the date window; contract test: for a shared scenario table (query/multi-category/owner/kind ×
  dataset), CLI output ids === `filterTransactions` output ids.

## A2. Write compensation (FR-011)

`db/persist.ts persist()`: on shares-insert failure, delete the just-inserted parent
(`transactions.delete().eq('id', tx.id)`) before throwing — mirroring `store.tsx
addTransaction`. If the compensating delete itself fails, the thrown error reports both
failures and the orphaned id. Test: share-failure injection → parent delete observed → error
still thrown; delete-failure injection → combined error message.

## A3. Split tolerance (FR-012)

`engine/split.ts validateCustomSplit` delegates the sum check to shared `validateSplit`
(`web/lib/splits.ts`, ±0.5 tolerance), keeping its `{ ok, error }` return shape and its
owner-coverage/negative checks. Test: 99.8% and 100.4% accepted; 99.4% rejected; message intact.

## A4. Category derivation (FR-013)

`web/lib/types.ts` exports `const CATEGORY_LIST = [...] as const` with
`type TransactionCategory = (typeof CATEGORY_LIST)[number]` — union and list cannot drift.
`engine/filters.ts:5-8` and `cli.ts:21-24` import it; hardcoded copies deleted. Test: CLI list
identity with the type module (plus tsc structural guarantee).

## A5. `--admin` documentation (FR-014)

No code change. PARITY.md CLI section rewritten: `--admin` is **by-design** — service-role key,
RLS bypassed, `created_by` attributed by statement-holder name-matching; constraints (key never
in CI/commits, live-data caution, `DRY_RUN=1` habit) stated. The other CLI rows (filtering,
atomic write, split tolerance, category duplication) flip to resolved with this feature's
reference.

# Phase 0 Research: Transaction CRUD make commands

All Technical Context items resolved; no open NEEDS CLARIFICATION. Decisions:

## D1 — One entrypoint, subcommand dispatch
- **Decision**: A single `web/scripts/import/tx.ts` reads `argv[2]` as the subcommand (`list|add|edit|rm`) and dispatches. Make targets call `npx tsx scripts/import/tx.ts <sub> …`.
- **Rationale**: All four share auth (`makeClient`), env loading, readline, and error/exit handling; one file avoids duplicating that. Leaves the 004 `cli.ts`/`ingest` untouched.
- **Alternatives**: four separate scripts (more duplication); extending `cli.ts` (would bloat the import flow).

## D2 — List query building
- **Decision**: `parseFilters(argv)` → a pure `TxFilter` object. `listTransactions(supabase, userId, filter, admin)` builds the Supabase query: `.from('transactions').select('*')`; in non-admin mode `.eq('created_by', userId)`; apply `category/source/scope/kind` via `.eq`, the month window via `.gte('date', startISO).lt('date', endISO)`, `.order('date', { ascending: false })`, and `.limit(filter.limit ?? 200)`. The pure `TxFilter` (incl. month→range) is unit-tested; the query call is exercised with a mock.
- **Rationale**: Keeps the testable logic (parse + range) pure and separate from the I/O. `created_by` scoping matches RLS and the spec's access model.

## D3 — MONTH → date range
- **Decision**: `monthRange('2026-05')` → `{ startISO: '2026-05-01T00:00:00.000Z', endISO: '2026-06-01T00:00:00.000Z' }`, a **half-open** `[start, end)` window; filter is `date >= start AND date < end`. December rolls to next year (`2025-12` → end `2026-01-01`).
- **Rationale**: Half-open ranges avoid month-boundary double counting (same convention as the aggregates RPCs). Deterministic, no clock.

## D4 — Validators (reuse, don't duplicate)
- **Decision**: `validateAmount(str)` → cents via `parseAmountToCents` (must be > 0). `validateCategory(str)` → must be in the 11-value `TransactionCategory` enum. `parseDay('YYYY-MM-DD')` → noon-UTC ISO (`…T12:00:00.000Z`), the same timezone-stable convention as 004's date handling; default = today at noon UTC (today injected for tests). All pure.
- **Rationale**: Mirrors the web `TxForm` validation (amount > 0, merchant non-empty, category in enum) so CLI rows match app rows. Noon-UTC keeps day-grouping correct in both apps.

## D5 — Update parity with the web store
- **Decision**: `updateOne(supabase, tx)` = `.from('transactions').update(txRecord(tx)).eq('id', tx.id)`, then rewrite shares exactly like `writeShares`: delete all `transaction_shares` for the id, and if `scope==='shared'` insert one row per owner with `effectiveSplits` percentages. Personal → shares deleted, none inserted.
- **Rationale**: Byte-for-byte the same as `web/lib/store.tsx` `updateTransaction`, so an edited row is indistinguishable from an app edit; handles personal↔shared transitions correctly.

## D6 — Delete
- **Decision**: `deleteOne(supabase, id)` = `.from('transactions').delete().eq('id', id)`. `transaction_shares` rows are removed by the `on delete cascade` FK (per the schema). `tx-rm` shows the row, supports `DRY_RUN=1` (no write), and requires a `y/N` confirm otherwise.
- **Rationale**: Matches `web/lib/store.tsx` `deleteTransaction`; the cascade means no manual share cleanup.

## D7 — Access & "not found"
- **Decision**: `getOne(supabase, id)` = `.select('*').eq('id', id).maybeSingle()`. In sign-in mode RLS only returns rows the operator can see (their personal rows + shared rows in their household); a hidden/absent id yields `null` → "not found", no change. `ADMIN=1` (service role) bypasses RLS to act on any row.
- **Rationale**: Satisfies FR-017/FR-019 and SC-006 without extra ownership checks in the CLI — RLS is the boundary.

## D8 — Table renderer
- **Decision**: `renderTable(rows)` → a fixed-width, money-aligned table: short id (first 8 of the uuid), `YYYY-MM-DD` date, merchant (padded/truncated), amount right-aligned via `formatMoney` (income `+`, expense Unicode `−`), category, scope, source. `renderDetail(tx)` → a labelled single-row view for add/edit/rm previews. Pure (string in, string out).
- **Rationale**: Principle IV (money reads as money, tabular). Pure → snapshot-testable without a terminal.

## D9 — Interactivity & safety
- **Decision**: `readline/promises`. `tx-add` prompts for any missing required field (merchant, amount) and confirms before write; `tx-edit` shows current values and edits field-by-field then confirms; `tx-rm` confirms `y/N` (or `DRY_RUN=1`). Reuses 004's owner-picker + `validateCustomSplit` for shared scope. Abort writes nothing.
- **Rationale**: FR-009/012/015; consistent UX with `ingest`.

## D10 — No new dependencies
- **Decision**: Everything is built from existing deps + Node built-ins. `txRecord`/`shareRows` are imported from `db/persist.ts`.

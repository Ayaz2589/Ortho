# Implementation Plan: Transaction CRUD make commands (CLI)

**Branch**: `004-bank-statement-import` (continues the CLI work) | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-transaction-crud-cli/spec.md`

## Summary

Add `make tx-list / tx-add / tx-edit / tx-rm` on top of the spec-004 import CLI, giving the operator read/create/update/delete over their Supabase transactions from the terminal. Everything reuses 004's infrastructure — email-OTP/admin auth (`db/client.ts`), user/household lookups (`db/lookups.ts`), the `Transaction` type (`web/lib/types.ts`), `effectiveSplits` (`web/lib/format.ts`), `formatMoney`/`parseAmountToCents`, and the write shapes (`txRecord`/`shareRows` in `db/persist.ts`) that mirror `web/lib/store.tsx`. New code is a small CRUD entrypoint plus pure, testable helpers (filter/month-range builder, validators, table renderer) and thin DB read/list/create/update/delete functions that reproduce the web store's `update`/`writeShares`/`delete` exactly. Runs and tests under the existing `web/` tsx + vitest toolchain.

## Technical Context

**Language/Version**: TypeScript 5 on Node (via `tsx`); tests need Node ≥ 20.19 (vitest 4 / `require(ESM)`).

**Primary Dependencies**: `@supabase/supabase-js` (existing). Node built-in `readline/promises` for prompts. Reuse `web/lib/{types,format,finance/money}` and `scripts/import/{db,engine}` from 004. No new dependencies.

**Storage**: Supabase Postgres — `public.transactions` (CRUD) and `public.transaction_shares` (rewritten on shared edits, cascade-deleted). Read-only `users`/`households`/`household_members`.

**Testing**: Vitest (existing `web/` setup; `npm test`). Deterministic unit tests for filters/month-range, validators, payload shapes (mocked client), and the table renderer.

**Target Platform**: Local interactive terminal (single operator).

**Project Type**: CLI subcommands inside the `web/` package, orchestrated by root `Makefile` targets (continues 004's `scripts/import/`).

**Performance Goals**: Interactive; a list of a user's transactions returns well under a second. No throughput target.

**Constraints**: Money is integer USD cents; dates timezone-stable (noon). No write without validation + explicit confirmation. Normal mode scoped to the operator's own rows (RLS); `ADMIN=1` acts on any.

**Scale/Scope**: One operator, hundreds of transactions. ~6 new small modules + tests; 4 new make targets.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle VI — Test-Driven & Regression-Safe (NON-NEGOTIABLE)**: BINDING. Filter/month-range logic, amount/date/category validators, split math reuse, and update/delete payload shapes are developed test-first and locked by deterministic tests (inject dates, mock the data layer). ✅
- **Principle IV — Money Formatting**: APPLIES to `tx-list` output and previews — amounts via the shared `formatMoney` (`$87.42`, income `+`, cost Unicode `−`, never abbreviated, tabular alignment). ✅
- **Stack — USD cents + Supabase**: APPLIES. All amounts integer cents; writes mirror the web store's `txRecord`/`writeShares`/`delete` exactly so CLI rows are indistinguishable from app rows. ✅
- **Principles I, II, III, V (web design system / a11y)**: N/A — CLI only, no UI surface.

**Result**: PASS. No deviations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-transaction-crud-cli/
├── plan.md  spec.md  research.md  data-model.md  quickstart.md
├── contracts/{cli.md, db.md}
└── checklists/requirements.md
```

### Source Code (repository root)

```text
Makefile                              # EXTEND — add tx-list / tx-add / tx-edit / tx-rm targets

web/scripts/import/                   # continues the 004 CLI dir
├── tx.ts                             # NEW — CRUD entrypoint: subcommand dispatch (list|add|edit|rm)
├── engine/
│   ├── filters.ts                    # NEW — parse+validate list filters; MONTH→[start,end); pure
│   ├── validate.ts                   # NEW — amount→cents, category-in-enum, date parse (pure, reuse money.ts)
│   └── render.ts                     # NEW — money-aligned table + single-row detail (uses formatMoney)
├── db/
│   └── transactions.ts               # NEW — getOne / list(filters) / createOne / updateOne / deleteOne
│                                     #        (reuses txRecord/shareRows from persist.ts; mirrors store)
└── (existing 004) cli.ts, db/{client,lookups,persist}.ts, engine/*, profiles/*

web/test/import/                      # continues the 004 test dir
└── filters.test.ts  validate.test.ts  render.test.ts  transactions.test.ts   # NEW
```

**Structure Decision**: Stays in `web/scripts/import/` (the 004 decision: keep the CLI in `web/` for transaction-model parity + one `npm test`). A new `tx.ts` entrypoint dispatches the four subcommands so the existing `ingest`/`cli.ts` is untouched. Pure helpers live in `engine/`; the only new DB surface is `db/transactions.ts`, which imports `txRecord`/`shareRows` from `db/persist.ts` (already exported) and reproduces `web/lib/store.tsx` `updateTransaction`/`deleteTransaction` semantics.

## Architecture & Flow

```
make tx-list MONTH=2026-05 CATEGORY=dining
  └─ tx.ts list
      1. parseFilters(argv)            → {start,end,category,source,scope,kind,limit}  [engine/filters]
      2. makeClient (OTP/admin)        → {supabase, userId}                            [db/client]
      3. listTransactions(filters)     → Transaction[] (created_by=you, newest first)  [db/transactions]
      4. renderTable(rows)             → money-aligned table                           [engine/render]

make tx-add MERCHANT='Coffee' AMOUNT='4.50'
  └─ tx.ts add → validate (money/category/date) → prompt missing → [shared? pick owners+split]
      → confirm → createOne (insert txRecord + shareRows)                              [db/transactions]

make tx-edit ID=<uuid>
  └─ tx.ts edit → getOne → render detail → interactive field edits → validate
      → confirm → updateOne (update txRecord by id; rewrite transaction_shares)        [db/transactions]

make tx-rm ID=<uuid> [DRY_RUN=1]
  └─ tx.ts rm → getOne → render detail → (DRY_RUN: stop) → confirm y/N → deleteOne     [db/transactions]
```

Shared with 004: `makeClient` (auth + exit-code-5 on failure), `resolveHousehold`/`listUsers` (owner picker for shared), `effectiveSplits` + `validateCustomSplit` (split), `parseAmountToCents`/`formatMoney` (money), `die()`/readline patterns.

## Phasing (maps to user stories)

- **P1 (US1 list)** — `filters.ts` + `render.ts` + `db/transactions.listTransactions` + `tx.ts list`. Read-only; fully testable (filter/range/render pure; list payload mocked). **MVP.**
- **P2 (US2 add)** — `validate.ts` + `createOne` + `tx.ts add` (incl. shared owners/split, reusing 004 helpers).
- **P2 (US3 edit)** — `getOne` + `updateOne` (mirror store update + writeShares) + `tx.ts edit`.
- **P3 (US4 rm)** — `deleteOne` + `tx.ts rm` (confirm + DRY_RUN).

## Complexity Tracking

No constitution violations. (No rows.)

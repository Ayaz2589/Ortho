# Implementation Plan: Ledger Atomic Persistence

**Branch**: `feat/ledger-atomic-persistence` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-ledger-atomic-persistence/spec.md`

## Summary

Replace the two-step transaction+shares write (parent insert → shares insert, with client-side compensating rollback) with a single Postgres RPC (`upsert_transaction`) that commits both writes atomically. The RPC enforces the sum invariant and non-empty-shares rule inline, so the database rejects any write that would produce an unreconciled ledger row. The web store's `addTransaction`/`updateTransaction` and the import CLI's `persist.ts` are both updated to call the RPC, removing all client-side rollback code.

## Technical Context

**Language/Version**: TypeScript 5 + SQL (PL/pgSQL)

**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`, Vitest 4

**Storage**: PostgreSQL via Supabase; two tables: `public.transactions` and `public.transaction_shares`

**Testing**: Vitest 4 (`cd web && npm test`); existing parity suites + new integration tests against the local Supabase stack

**Target Platform**: Supabase-hosted Postgres + Next.js web app + Node.js CLI

**Project Type**: Web application + import CLI

**Performance Goals**: RPC latency must be indistinguishable from the current two-step write; no extra round-trips

**Constraints**: Must not break existing RLS policies; must work in both authenticated user-role (web) and service-role (CLI `--admin` mode); must not corrupt existing historical data

**Scale/Scope**: One RPC, two callers (web store, CLI persist), one migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| VI. Test-Driven & Regression-Safe | New behavior (atomic write, sum constraint) described by tests before implementation | ✅ PASS — quickstart.md defines failing-test-first scenarios |
| VI. Golden vectors | No finance math changes; split computation (`splits.ts`) is unchanged — no vector regen needed | ✅ PASS |
| Stack (Additional Constraints) | Uses only Supabase Postgres + existing `@supabase/supabase-js` RPC pattern (as in aggregates migration) | ✅ PASS |
| I–V (UI/design) | No UI changes; error surfacing uses existing `setError` path | ✅ PASS |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/027-ledger-atomic-persistence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── upsert_transaction.md   # RPC contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
supabase/migrations/
└── 20260718120000_upsert_transaction_atomic.sql   # new migration

web/lib/
└── store.tsx            # addTransaction + updateTransaction — replace two-step write

web/scripts/import/db/
└── persist.ts           # persist() — replace two-step write

web/test/
└── ledger-atomic.test.tsx  # store/CLI unit tests (mock Supabase) — assert the
                            # RPC is called with the right p_tx/p_shares payload
                            # and that optimistic state rolls back on RPC error

supabase/tests/
└── upsert_transaction_authz.sql  # SQL authorization+validation regression run
                            # against the live local Postgres (the layer the
                            # mock-based vitest suites cannot reach): anon is
                            # denied, sum/empty/null shares rejected, cross-
                            # household overwrite blocked, service-role import ok
```

**Structure Decision**: Entirely additive. One migration, two changed callers, one new test file.

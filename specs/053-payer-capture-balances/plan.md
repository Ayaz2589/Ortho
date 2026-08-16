# Implementation Plan: Payer Capture & Household Balances

**Branch**: `feat/050-053-household-wiring` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

Two halves, in order. **Capture**: give every ingest path a payer, so `paid_by` stops being a
manual-entry-only field. **Compute**: rebuild who-owes-whom as an N-person pairwise matrix — the
thing spec 043 removed because the old viewer-anchored function was wrong for three or more people —
and surface it with an exact-cents settle-up.

The nine historical `member-balance.json` vector cases are restored as the regression lock for the
expense and transfer rules, extended with income and three-person cases.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Deno (the sync edge function)

**Primary Dependencies**: none added

**Storage**: none added — `paid_by` and the `transfer` kind already exist

**Testing**: Vitest — unit, property, and restored golden vectors

**Constraints**: integer cents only; settle-up must never round-trip through display currency;
balances span all transactions regardless of the active time scope.

## Constitution Check

| Principle | Status |
|---|---|
| I — Tokens only | Pass. Balances render in existing card/row styles; **never red** — a debt is sand, not alarm. |
| II — Calm over dense | Pass. One list of pairs plus an all-settled state; no matrix grid. |
| IV — Plainspoken & money | Pass. "Amir owes Priya $84." Exact integer cents through settle-up. |
| VI — Test-driven & regression-safe | Pass. Historical vectors restored before the engine is rewritten. |

No violations.

## Design

### Part 1 — payer capture

| Path | Change |
|---|---|
| In-app CSV | `CsvDraft` gains `paidById`; a payer control beside the existing owner picker; `useCsvImport` persists it. |
| Scan | `scanInference` already copies owners from the matched prior transaction — extend it to copy `paid_by` too, falling back to the default owner. |
| CLI import | `scripts/import/db/persist.ts` resolves a payer from the import context instead of `?? null`. |
| Bank sync | `simplefin-sync` sets `paid_by` to the connection's `defaultPersonId` (the account's owning person). |

Income keeps a null payer everywhere (FR-006).

### Part 2 — the balance engine — `web/lib/finance/balances.ts` (new)

```ts
/** Net integer cents between an ordered pair. Positive ⇒ `b` owes `a`. */
export function balanceBetween(a: string, b: string, txs: Transaction[]): number

/** Every ordered pair. `matrix[a][b] === -matrix[b][a]`. */
export function allPairBalances(personIds: string[], txs: Transaction[]): Map<string, Map<string, number>>

/** Non-zero pairs, deduplicated to one row per pair, creditor-first, stable order. */
export function outstandingBalances(personIds: string[], txs: Transaction[]): PairBalance[]
```

Rules, integer cents, no rounding:

| Case | Effect |
|---|---|
| Expense, `paid_by === a` | `+= shares[b]` — b owes a their share |
| Expense, `paid_by === b` | `−= shares[a]` |
| Expense, payer is neither | no effect (the classic third-party case) |
| **Income**, `paid_by === a` (recipient) | `−= shares[b]` — a owes b their share (new, FR-011) |
| Transfer a→b | `+= amount` |
| Transfer b→a | `−= amount` |
| `paid_by == null` | **no effect** (FR-012) — historical rows cannot invent debts |

`outstandingBalances` takes the person roster from **everyone referenced anywhere in the ledger**,
not just active people, so a removed member's debt stays visible and settle-able (FR-015).

### Part 3 — surface

A `household-balances` widget (`WidgetDefinition` in the existing registry, toggled per browser in
Settings → Widgets) rather than a bespoke dashboard insert — matching how every surface has been
added since spec 034. Rows read "{A} owes {B} {amount}", with a settle-up action that pre-fills a
transfer carrying the **exact integer balance**, never a display-currency round trip.

## Project Structure

```text
web/lib/finance/balances.ts                    # new engine
web/lib/csv/csvImportModels.ts                 # paidById on the draft
web/lib/csv/useCsvImport.ts                    # persist payer
web/lib/scan/scanInference.ts                  # carry payer forward
web/scripts/import/db/persist.ts               # resolve payer
supabase/functions/simplefin-sync/index.ts     # payer from account owner
web/components/widgets/bodies/HouseholdBalancesBody.tsx
web/lib/widgets/registry.tsx                   # register widget
shared/test-vectors/member-balance.json        # restored + extended

web/test/finance/balances.test.ts
web/test/member-balance.parity.test.ts         # restored
```

## Test Strategy (TDD order)

1. **Restore the historical vector** from `c70acef^` and its parity suite — nine cases covering the
   worked example, reverse payer, payer-not-owner, settle to zero, partial and over reimbursement,
   multi-expense net, third-member isolation, transfer-only. These pin the rules the rewrite must
   preserve.
2. **New cases**: income balance effects; a three-person matrix; a null-payer ledger producing
   nothing.
3. **Property**: antisymmetry `balance(a,b) === −balance(b,a)` over randomized ledgers; and settling
   the displayed amount always reaches exactly zero.
4. **Capture tests** per ingest path.
5. **Currency**: settle-up prefill preserves exact cents across all seven display currencies (the
   spec-043 B9 regression, restored).

# Implementation Plan: Simplified Households & Flexible Splits

**Branch**: `007-household-splits` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-household-splits/spec.md`

## Summary

Collapse the household model from a two-axis system (personal/shared **scope** × two
identity spaces: auth users + device-only local users) into **one household ledger** of
**name-only people**, and add **flexible splits** (by percentage or by value) whose source of
truth is **cents per owner**. Every transaction belongs to the household and is attributed to
one or more **people**; per-owner shares always sum to the exact amount. The split math is a
pure, golden-vector-locked function shared by web (TypeScript) and iOS (Swift); the DB schema,
RLS, dashboard rollups, transaction forms, detail views, filters, and household settings are
simplified to match. A one-time migration backfills existing data.

Technical approach (from research):
- Introduce **`household_people`** — name-only people scoped to a household, optionally linked
  to an auth user. Transaction ownership/splits reference **people**, not auth users.
- **`transaction_shares`** becomes `(transaction_id, person_id, amount_cents)`; every
  transaction materializes one share row per owner summing to `amount_cents`. Drop `percent`.
- **`transactions`**: drop `scope` and the `scope_matches_household` constraint; make
  `household_id` NOT NULL.
- A pure **`computeShares(amountCents, owners, split)` → cents-per-owner** function, with a
  deterministic leftover-cent rule, locked by `shared/test-vectors/transaction-splits.json`.
- Remove the **scope** dimension from `filterTransactions` and regenerate
  `transaction-filters.json` so both clients stay in lockstep.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js 16 (web); Swift 5.9 / SwiftUI, iOS 17+
(iOS). Postgres (Supabase) for storage.

**Primary Dependencies**: Supabase (Postgres + RLS + PostgREST RPC); Vitest + Testing Library
(web tests); XCTest (iOS). Shared golden vectors under `shared/test-vectors/`.

**Storage**: Postgres. Money in integer USD cents (`bigint`). New table `household_people`;
altered `transactions` + `transaction_shares`; updated RLS + aggregate RPCs.

**Testing**: `cd web && npm test` (Vitest unit + parity + component); iOS XCTest (parity,
verified in Xcode). Money/split math is test-first and golden-vector-locked (Constitution VI).

**Target Platform**: iOS app + responsive web (compact 0–639 / medium 640–1023 / expanded
1024+).

**Project Type**: Cross-platform mobile + web over a shared Supabase backend, with a shared
test-vector parity mechanism.

**Performance Goals**: Interactive form/dashboard; client-side filtering + split computation
over the already-loaded transaction set (hundreds of rows). No new latency budget.

**Constraints**: Per-owner shares MUST sum to the transaction amount to the cent; identical
inputs MUST yield identical shares on both platforms; date logic deterministic. The migration
is one-time and backfills existing rows (early/personal data; loss-free re-attribution).

**Scale/Scope**: Small household (1–6 people); a few hundred transactions. Touches the schema,
both clients' transaction form/detail/filters/dashboard, and household settings.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Split editor + people list reuse existing
  tokens/components (Segmented/Seg, owner chips, Drawer, money formatting). No new palette.
- **II. Calm Over Dense** — PASS. The change is a net *reduction* in UI (removes the scope
  toggle/filter); the split editor is a compact, opt-in surface shown only for multi-owner
  transactions. No shadows on inset cards; hairlines.
- **III. Right Form Factor Per Canvas** — PASS. iOS bottom sheets; web centered modal /
  right drawer. No new affordances.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Money stays `$50.00`, tabular, never
  abbreviated; income keeps `+`. Split copy is plainspoken ("Split by % / by amount").
- **V. Accessible & Interaction-Complete** — PASS. Split inputs are labelled numeric fields;
  method toggle is a real segmented control; ≥44px touch targets; focus-visible rings; reduced
  motion respected. Per-person reconciliation message is non-alarmist.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS by design. The split function
  is a pure module developed test-first, golden-vector-locked across platforms; the filter
  vectors are regenerated; dashboard per-person math is unit-tested; the migration's cent math
  is covered. No money math ships without coverage.

**Additional constraints** — Supabase storage, USD cents, responsive contract, and the four
preserved destinations all hold. No violations; **Complexity Tracking not required**.

## Project Structure

### Documentation (this feature)

```text
specs/007-household-splits/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (people model, split rule, migration, RLS)
├── data-model.md        # Phase 1 — entities + schema + migration steps
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── split-function.md  # computeShares contract + vector cases
│   ├── schema.md          # DB migration contract (tables, RLS, RPCs)
│   └── ui.md              # Per-canvas UI contract (form, detail, dashboard, household)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 2026MMDDHHMMSS_household_people_and_value_splits.sql   # new: people table, shares→cents,
                                                           # drop scope, RLS + RPC rewrite

web/
├── lib/
│   ├── splits.ts            # NEW pure computeShares + validation (source of truth)
│   ├── types.ts             # Person, Transaction (owners=person ids, shares cents); drop scope
│   ├── store.tsx            # one member list; people CRUD; shares as cents; drop personalShares
│   ├── transactionFilters.ts# remove the scope dimension
│   ├── useTransactionFilters.ts / format.ts  # drop scope; effectiveSplits→cents
│   └── personalShares.ts    # DELETE (device-only path removed)
├── components/
│   ├── web/TxForm.tsx       # remove scope toggle; one owner pool; split editor (%/value)
│   ├── web/FilterPanel.tsx / ActiveFilterChips.tsx  # drop scope
│   ├── transactions/TransactionDetailBody.tsx       # per-owner cents shares
│   └── settings/HouseholdDrawer.tsx + app/(app)/settings/household  # simple people list
├── components/dashboard/PerOwnerBreakdownCard.tsx    # per-person from cents shares
├── scripts/gen-vectors.ts   # emit transaction-splits.json; regen transaction-filters.json
└── test/                    # splits unit+parity, split-editor UI, dashboard, filter updates

iOS/Ortho-iOS/
├── Models/                  # Person; Transaction owners=Person.ID + cents shares; drop scope
├── Features/Transactions/   # AddTransactionSheet (split %/value), TransactionDetailSheet,
│                            # FilterSheet + TransactionsView + TransactionFilters (drop scope)
├── Features/Settings/       # HouseholdView + AddUserSheet → unified people list
├── Features/Dashboard/      # PerOwnerBreakdownCard from cents shares
├── App/AppState.swift       # one member list; people CRUD; drop personalShares/local-user split
└── Ortho-iOSTests/          # TransactionSplitParityTests; updated filter parity

shared/test-vectors/
├── transaction-splits.json  # NEW golden vectors
└── transaction-filters.json # regenerated without scope
```

**Structure Decision**: Existing cross-platform layout. The new pure logic lives in
`web/lib/splits.ts` (TS source of truth) mirrored by a Swift `TransactionSplits.swift`; both
assert against `shared/test-vectors/transaction-splits.json` exactly as mortgage/insights/
filters do. The schema change is a single new Supabase migration.

## Complexity Tracking

> No Constitution violations — this feature *removes* complexity. Section intentionally empty.

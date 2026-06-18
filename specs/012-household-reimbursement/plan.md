# Implementation Plan: Household reimbursement & settle-up

**Branch**: `012-household-reimbursement` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-household-reimbursement/spec.md`

## Summary

Make "one member fronts the bills, the other reimburses their share" first-class on both iOS (canonical) and web (mirror). Three pieces: (1) record **who paid** each expense (`paid_by`, default = creator); (2) derive a **net balance** between members from shares + who-paid minus reimbursements (new pure, golden-vectored logic mirrored TS↔Swift); (3) record a **reimbursement** as a new `transfer` kind that reduces the balance and is excluded from every spend/income/budget/insight/per-owner aggregate. One additive Supabase migration adds `paid_by` and the `transfer` enum members. PARITY.md gains a capability row.

## Technical Context

**Language/Version**: TypeScript (web — Next.js 16 + React 19 + Tailwind v4); Swift / SwiftUI (iOS, canonical); SQL (Supabase / Postgres 15).

**Primary Dependencies**: None new. Reuses the existing transaction create/update path (web `store.tsx` addTransaction/txRecord/writeShares; iOS `AppState`/`TransactionsAPI`), the shared add/edit form (web `TxForm.tsx`; iOS `AddTransactionSheet`), member pickers (`householdMembers` / `household_people`), the cents invariant + `orderedOwnerIds`.

**Storage**: Supabase. **One additive, reversible migration**: add `paid_by uuid references household_people(id)` to `transactions` (nullable; backfilled to the creator's person for existing expenses); `alter type transaction_kind add value if not exists 'transfer'`; `alter type transaction_category add value if not exists 'transfer'`. Reuse the existing member-scoped RLS on `transactions`. (Postgres note: the `ADD VALUE`s are idempotent and are **not referenced within the same migration** — the backfill uses `created_by` only — so they commit cleanly before any runtime use.)

**Testing**: web Vitest, iOS XCTest, shared golden vectors (`shared/test-vectors/*.json` via `web/scripts/gen-vectors.ts`, asserted by both suites). Run web under Node ≥ 22 (`~/.nvm/.../v22.22.0`) with the Bash sandbox disabled for `vitest`/`gen:vectors` (tsx/vitest IPC). Reference data is injected, never the real clock.

**Target Platform**: iOS app + responsive web; one Supabase backend.

**Project Type**: Cross-surface mobile + web over one backend; pure finance logic mirrored TS↔Swift and locked by golden vectors.

**Performance Goals**: Balance is an O(transactions) reduction computed in memory on already-loaded data; no new per-frame cost.

**Constraints**: Design tokens only; **loss/owing is never shown in red** (Constitution II/IV) — "you owe" uses neutral/text, not destructive; semantic accessible controls; money is USD cents converted at render; the balance math is integer-cents only (no new rounding) but is still vectored per Constitution VI.

**Scale/Scope**: 2 surfaces; 1 migration; 1 new vectored pure module (`balances`); `paid_by` threaded through the model/form/persistence/rehydrate on both surfaces; a new `transfer` direction in the shared form; a balance display + "Settle up" action; an audit that every spend/income aggregate excludes `transfer`; 1 new vector file; 1 PARITY.md row; new web + iOS tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Balance line + Settle-up button + payer/transfer pickers reuse existing tokens and form/list components; no new palette.
- **II. Calm Over Dense (NON-NEGOTIABLE)** — PASS, with care: the owed amount is money-as-headline and plainspoken; **"you owe X" must not be red** (loss is never red) — use `--text`/`--accent`, reserving `--positive` only where money is genuinely incoming. No shadows on inline chrome.
- **III. Right Form Factor Per Canvas** — PASS. Reuses the per-canvas add/edit shell (drawer/modal on web, sheet on iOS) and the transactions section; additive.
- **IV. Plainspoken Voice & Money Formatting** — PASS. "Tasnuva owes you $50" / "Settled"; tabular, unabbreviated, Unicode minus where a signed value is shown.
- **V. Accessible & Interaction-Complete** — PASS. Payer picker, from/to pickers, and Settle-up are real semantic controls, keyboard-reachable, ≥40px (≥44 touch), focus-visible.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS. The balance computation is new pure cents/relationship logic → mirrored TS↔Swift and locked by a **new golden-vector block**, written test-first; the "transfers bypass `computeShares`/`validateSplit`" invariant is asserted so the existing split vectors aren't widened.
- **Additional Constraints** — PASS. No new dependencies; additive/reversible migration; parity of the four destinations preserved. Inherits the known atomic-write gap (a transfer is a parent+1-share write; web rolls back, iOS doesn't — unchanged, noted).

**Result: GATE PASS — no violations; no Complexity Tracking entry required.**

## Project Structure

### Documentation (this feature)

```text
specs/012-household-reimbursement/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/reimbursement.md   # data shape, balance fn signature, vector schema, UI contract
└── tasks.md                     # /speckit-tasks (next)
```

### Source Code (files this feature touches)

```text
supabase/migrations/
└── 20260618120000_member_reimbursement.sql   # NEW — paid_by column + backfill; 'transfer' kind + category

shared/test-vectors/
└── member-balance.json            # NEW — balanceBetween golden vectors

web/
├── lib/types.ts                   # TransactionKind + 'transfer'; TransactionCategory + 'transfer'; Transaction.paid_by
├── lib/balances.ts                # NEW — pure balanceBetween(viewer, other, txns) (vectored)
├── lib/store.tsx                  # persist + rehydrate paid_by; carry transfer rows; balance selector; audit kind guards
├── lib/transactionFilters.ts      # 'transfer' learns into kind filter/labels
├── components/web/TxForm.tsx      # paid_by picker (expense) + 'Transfer' direction (from→to + amount)
├── components/transactions/ + components/web/TransactionsDesktop.tsx + app/(app)/transactions/page.tsx
│                                  # balance line + "Settle up" action; render transfer rows + paid_by in detail
├── scripts/gen-vectors.ts         # emit member-balance.json
└── test/**                        # NEW balance parity + unit, form, aggregate-exclusion tests

iOS/Ortho-iOS/
├── Models/Transaction.swift (+ TransactionKind/TransactionCategory)  # 'transfer' + paidBy
├── <new> Balances.swift           # mirror balanceBetween
├── App/AppState.swift             # persist/rehydrate paidBy; transfer rows; balance; audit kind guards
├── Features/Transactions/AddTransactionSheet.swift  # paid_by picker + Transfer mode
├── Features/Transactions/* (TransactionsView, TransactionDetailSheet, TransactionRow)  # balance + Settle up + transfer rendering
├── Services/TransactionsAPI.swift # paid_by in create/update payloads
└── Ortho-iOSTests/**              # NEW balance parity + unit

PARITY.md                          # + "Member reimbursement / settle-up" row; taxonomy/filtering notes; header bump
```

**Structure decision**: Reuse the existing transaction pipeline. **Add exactly one column (`paid_by`)** and represent a reimbursement by *reusing the existing share machinery* (see research D2): a `transfer` row stores `paid_by = sender`, `owner_ids = [recipient]`, `shares = { recipient: amount }` (so the shares-sum invariant still holds) — no `from/to` columns, no change to `computeShares`. The balance is a new pure module, not stored.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: reimbursement is a new `transfer` kind excluded from all aggregates (D1); represent it by reusing `paid_by`(sender) + one-owner share(recipient) so only one new column is needed and the share-sum invariant is preserved (D2); `paid_by` defaults to the creator and backfills to the creator's person (D3); the balance is integer-cents `balanceBetween(viewer, other)` over expenses (shares+paid_by) and transfers, golden-vectored (D4); the migration adds the enum values idempotently without using them in-migration (D5); owing is never shown in red (D6).

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md): the `paid_by` field, the `transfer` row shape (reusing owner/shares), the derived `MemberBalance`, and the migration outline.
- [contracts/reimbursement.md](./contracts/reimbursement.md): `balanceBetween` signature + semantics, the `member-balance.json` vector schema, the transfer row data contract, and the UI contract (payer picker, Transfer direction, balance line, Settle-up).
- [quickstart.md](./quickstart.md): apply the migration, regenerate vectors, run both suites, and the manual worked-example walkthrough.

Re-evaluate Constitution Check after design: **still PASS** — additive migration + token-based UI + vector-locked pure logic; no new deps; the only watch-item is "owing is not red," captured as a constraint.

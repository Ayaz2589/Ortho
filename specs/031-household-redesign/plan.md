# Implementation Plan: Household Feature Redesign

**Branch**: `feat/household-redesign` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-household-redesign/spec.md`

---

## Summary

Close the UX and logic gaps in the existing household system without touching the schema. The data model (`household_people`, `transaction_shares`, `upsert_transaction` RPC, `paid_by` / `owner_ids` / `shares`) is complete and correct. The gaps are:
- **Logic**: income excluded from balance calculations; `balanceBetween` is viewer-anchored (breaks for 3+ people)
- **UX**: no plain-language ownership picker; no dashboard balance widget; no solo-mode guard on the balance widget

Several tasks from the plan are already implemented (noted below). Build TDD-first: golden vectors before logic changes, React Testing Library tests before component changes.

---

## Technical Context

**Language/Version**: TypeScript 5.x + React 19

**Primary Dependencies**: Next.js 16.2.9 (App Router, `output: 'export'`), Tailwind v4, Supabase (data layer), Vitest + React Testing Library (tests)

**Storage**: Supabase — no schema changes in this feature. All tables already support N-person households.

**Testing**: Vitest (`cd web && npm test`). Golden vectors in `shared/test-vectors/member-balance.json`, consumed by `web/test/member-balance.parity.test.ts`. Component tests use `@testing-library/react`.

**Target Platform**: Web (responsive, 3 breakpoints: 0–639 compact, 640–1023 medium, 1024+ expanded) + Capacitor iOS shell

**Project Type**: Web application (Next.js static export → Capacitor iOS)

**Performance Goals**: Standard interactive — no new network calls, all balance math is in-memory over the existing transaction store.

**Constraints**: `output: 'export'` means no server components with dynamic data; no parallel routes (@slot). All new components must be `'use client'` and read from the `useApp()` store.

**Scale/Scope**: Household size is typically 1–4 members; balance math is O(n²) over transaction list which is bounded to the active household's ledger (~100s of transactions).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. One Design System, Tokens Only | All new UI must use `var(--token)` only — no hardcoded colors. Balance amounts are neutral text (never red per Constitution). | ✅ Required |
| II. Calm Over Dense | Balance widget: inset card, hairline rules, no shadows, no gradients. Nudge chip uses `var(--chip-bg)`. "Settle up" uses `var(--accent)`. | ✅ Required |
| III. Right Form Factor Per Canvas | Widget appears on both mobile dashboard and desktop grid. Ownership picker is the same component on both surfaces. | ✅ Required |
| IV. Plainspoken Voice | "Settle up", "All settled", "You owe / owes you" — no jargon. Income labels: "Received by [person]". | ✅ Required |
| V. Accessible & Interaction-Complete | All new buttons are `<button type="button">`, all selects are `<select>` with `aria-label`. Hit targets ≥ 40px. | ✅ Required |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | Every logic change (`balances.ts`) gets a golden vector BEFORE the code change. Every new component gets a behavior test. `npm test` must be green at every step. | ✅ Non-negotiable |

**No violations.** No Complexity Tracking entry needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/031-household-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── balance-functions.md  # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── balances.ts                      # extend: income branch + allPairBalances + simplifyDebts
│   └── splitMemory.ts                   # NEW: getLastSplitForMerchant
├── components/
│   ├── transactions/
│   │   └── BalanceSummary.tsx           # update: add isSolo guard
│   ├── web/
│   │   ├── HouseholdBalancesWidget.tsx  # NEW: dashboard balance widget
│   │   ├── DashboardDesktop.tsx         # update: add HouseholdBalancesWidget
│   │   └── TxForm.tsx                   # update: ownership type picker, income labels
│   └── settings/
│       └── HouseholdDrawer.tsx          # minor: empty-state copy refinement
├── app/(app)/
│   ├── dashboard/page.tsx               # update: add HouseholdBalancesWidget (mobile)
│   └── settings/household/page.tsx      # update: settle-up threshold input (T008)
└── test/
    ├── member-balance.parity.test.ts    # update: income + 3-person cases (extends existing)
    ├── household-balances-widget.test.tsx # NEW: widget behavior tests
    └── split-memory.test.ts             # NEW: splitMemory unit tests

shared/
└── test-vectors/
    └── member-balance.json              # update: new income + 3-person vectors
```

**Structure Decision**: Single-project web app. All changes are under `web/` and `shared/`. No new packages, no new routes (the widget is embedded in existing dashboard pages).

---

## Pre-implementation notes: What's already done

Audit of the current codebase found that several tasks are **already implemented**:

| Task | Status | Evidence |
|------|--------|----------|
| T001 — Solo mode guard on TxForm | ✅ Done | `TxForm.tsx:494` — `const showOwners = form.members.length > 1` gates the owner/payer UI |
| T001 — Solo mode guard on BalanceSummary | ✅ Done implicitly | `BalanceSummary.tsx` returns null when `rows.length === 0`; a solo user has no counterparties |
| T002 — Local member onboarding copy | ✅ Done | `HouseholdDrawer.tsx:163` — "People you add can own and split transactions — no account needed." `HouseholdPage.tsx:63-65` — matching copy |
| T004 — Split preset buttons | ✅ Done | `TxForm.tsx:601-604` — Even / % / $ Seg control already implemented |

Tasks remaining: **T001 partial** (balance widget solo guard, not yet in widget because widget doesn't exist), **T003, T005, T006, T007, T008, T009, T010, T011**.

---

## Phase 0: Research

*See [research.md](./research.md) for full findings. Summary:*

1. **Income balance direction**: Income where `paid_by = A` and `owner_ids = [A, B]` means A received money on behalf of both; B is owed their share by A. The sign is identical to an expense where A paid — `net += shares[other]` when `paid_by === viewer`. The single code change: add an `else if (t.kind === 'income')` branch in `balanceBetween` that mirrors the expense branch.

2. **N-person balance matrix**: Double-loop over all ordered pairs of `people`, calling `balanceBetween(a.id, b.id, transactions)`. The matrix is antisymmetric: `[a][b] === -[b][a]`. For display: iterate people in stable order; for each pair where `index(a) < index(b)`, show once.

3. **Debt simplification**: Min-cost flow / "Splitwise algorithm" — convert the matrix to a net-balance array, greedily match the largest creditor to the largest debtor. O(n²) for small n (≤ 10 household members). No library needed; implement as a pure function.

4. **Ownership type picker placement**: Replaces the raw "Owners" chips + "Paid by" select with a 3-mode segmented control ("Just me" / "We each paid" / "[Person] paid"). The existing form state (`owners`, `paidBy`) is unchanged — the picker is a pure presentation layer that writes to those same values. No new store state.

5. **Recurring split memory**: Store as a lookup by exact merchant string. Source of truth: `transactions` array from the store — find the most recent non-solo (`owner_ids.length > 1`) transaction for the given merchant. No new persistence needed; computed on-demand when the merchant field changes.

6. **`balanceBetween` sign convention for income**: Confirmed by reading `balances.ts` — positive means `other owes viewer`. An income received by `viewer` where `other` is an owner means `other owes viewer their share` → `net += shares[other]`. An income received by `other` where `viewer` is an owner means `viewer owes other their share` → `net -= shares[viewer]`. Same sign rule as expenses.

---

## Phase 1: Design & Contracts

*See [data-model.md](./data-model.md) and [contracts/balance-functions.md](./contracts/balance-functions.md) for full details.*

### Key Design Decisions

**D1 — `balanceBetween` income branch**: Add `else if (t.kind === 'income')` block after the existing `if (t.kind === 'expense')` block, with identical sign logic. The income `paid_by` is the recipient (not a spender); the math is the same.

**D2 — `allPairBalances` returns a flat array, not a nested Map**: A `PairBalance[]` array (`{ a, b, netCents }` where `a < b` lexicographically) is simpler to render and iterate than a nested Map. The widget sorts and renders this directly.

**D3 — `HouseholdBalancesWidget` reuses `BalanceSummary` patterns**: Same token usage (`var(--chip-bg)`, `var(--accent)`, `text-text-2`), same "Settle up" prefill pattern (`onSettle(TransferPrefill)`). Not a wrapper around `BalanceSummary` — a new component that calls `allPairBalances` directly.

**D4 — Ownership type picker is a new sub-component, not a rewrite of TxForm**: A `OwnershipModePicker` component rendered inside `TxFormFields`, visible only when `showOwners`. It writes to `owners` / `paidBy` via existing form handlers. The existing raw split editor stays hidden behind it (revealed only in advanced/custom scenarios).

**D5 — Split memory is computed in a new `web/lib/splitMemory.ts`**: Pure function over the transaction array — no store mutation, no new persistence. The hook `useLastSplitForMerchant(merchant, transactions, householdMembers)` is called in `useTxForm` when `merchant` changes.

**D6 — Settlement threshold stored in household store**: The `currentHousehold` object gains an optional `settle_threshold_cents` field. Since this is UI-only state, it is stored in `localStorage` keyed by `household_id` to avoid a schema change. A helper `useSettleThreshold()` reads/writes it.

### New golden vectors (summary)

Income vectors added to `shared/test-vectors/member-balance.json`:
1. Income received by viewer, split even → `+shares[other]`
2. Income received by other, split even → `-shares[viewer]`
3. Income with single owner (just me) → `0`
4. Mixed: income + expense → net combines correctly

3-person vector added to `member-balance.parity.test.ts` (inline, not in the JSON — the JSON test is `balanceBetween` only; `allPairBalances` gets its own test file).

---

## Complexity Tracking

No constitution violations. No entry needed.

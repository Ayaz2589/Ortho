# Research: Simplified Households & Flexible Splits

Phase 0 decisions. Four make-or-break choices were resolved with the user before specifying
(remove scope; one unified people list; cents-per-owner source of truth; backfill existing
data, drop scope column). This document records the *technical* decisions that follow.

## D1 — Name-only people: a `household_people` table (not reusing `users`)

**Decision**: Introduce `household_people (id, household_id, name, initial, color_key,
linked_user_id?, sort_order, created_at)`. Transaction ownership and splits reference
`household_people.id`. The account holder is a person row with `linked_user_id = auth uid`;
people you add by name have `linked_user_id = null`.

**Rationale**: The new model says "people don't need accounts" and "one unified member list."
`public.users.id` is FK'd to `auth.users(id)`, and RLS keys off `auth.uid()`, so name-only
people cannot be `users` rows without breaking auth. A dedicated people table keeps auth
untouched, lets non-account people own/split transactions and persist server-side (so the
dashboard's cents shares are real data, not device-only), and gives one list everywhere. It
also absorbs today's device-only `LocalUser` concept — local users become ordinary people
rows on first run after the update.

**Alternatives considered**:
- *Relax `users` to allow non-auth rows* — pollutes the auth-backed profile table, complicates
  every RLS policy and the peers-select policy; rejected.
- *Keep added people device-only (today's LocalUser)* — re-introduces the on-device shares /
  rehydration path we are explicitly deleting, and their cent shares couldn't persist;
  rejected.

## D2 — `transaction_shares` stores cents per person; every owner is materialized

**Decision**: `transaction_shares (transaction_id, person_id, amount_cents, primary key
(transaction_id, person_id))`. Drop `user_id` and `percent`. Every transaction materializes
**one row per owner** (including single-owner = full amount); the rows sum to the
transaction's `amount_cents`. Percentage is **derived for display** as `round(share/amount*100)`,
never stored.

**Rationale**: Cents-per-owner is the user-chosen source of truth and makes the dashboard exact
(sum of cents = total, zero drift). Materializing single-owner rows means owners and shares are
always read uniformly from `transaction_shares` — no "nil means even / no rows means creator"
special cases (the current code has several). A DB `CHECK`/trigger that shares sum to the
amount is desirable but deferred to the client/RPC layer for v1 (matches the existing
percent-sum approach), with a verification query in quickstart.

**Alternatives**: keep `percent` and add `amount_cents` (redundant, two sources of truth that
can disagree — rejected); store only percent and convert value entry (loses exact cents on
uneven amounts, violates SC-001 — rejected).

## D3 — `computeShares` rule: floor by target, distribute leftover cents in owner order

**Decision**: A pure `computeShares(amountCents, orderedOwners, split)` returning cents per
owner that always sums to `amountCents`. Modes: `even`, `percent`, `value`.
- **single owner** → full amount, any mode.
- **even / percent**: target_i = `amount * pct_i / 100` (pct = 100/n for even). `base_i =
  floor(target_i)`; `leftover = amount − Σ base_i`; distribute `leftover` cents **one per
  owner in list order**, cycling if needed (cycling never triggers for valid input). So
  $100.01 even/2 → 50.01, 50.00; $10.00 even/3 → 3.34, 3.33, 3.33.
- **value**: returns the entered cents as-is (validated to sum to amount).

**Rationale**: The user specified "leftover remainder cent(s) assigned deterministically, in
owner order." Floor-then-distribute-in-order is the simplest rule matching that, is fully
deterministic, trivially identical in TS and Swift (integer math only — no Decimal rounding
divergence), and unifies even + percent. Cycling keeps the function *total* (always sums to
amount) even for slightly-invalid percents, while the form still blocks invalid saves (D4).

**Alternatives**: largest-remainder/Hamilton (fairer spread but the spec asked for owner-order;
and ties need an order tiebreak anyway — rejected for simplicity); banker's rounding per share
(can miss the total by a cent — rejected).

## D4 — Validation is separate from computation

**Decision**: `validateSplit(amountCents, owners, split)` returns ok/why-not, used by the form
to gate saving: percent must total 100 within tolerance (±0.5, matching today's iOS tolerance);
value must total `amountCents` exactly. `computeShares` itself is total and never throws.

**Rationale**: Keeps the math pure and the UI responsible for messaging (Constitution IV/V:
non-alarmist). Mirrors the existing `splitIsValid` tolerance on iOS.

## D5 — Drop scope from the filter parity function; regenerate vectors

**Decision**: Remove the `scope` field and branch from `filterTransactions` /
`FilterCriteria` / `activeFilterCount` on both platforms; remove the scope segmented control,
the scope filter chip, and the scope option list. Regenerate
`shared/test-vectors/transaction-filters.json` from the updated `gen-vectors.ts` so both
suites re-lock without scope.

**Rationale**: Scope no longer exists; the golden-vector mechanism must reflect that or the
iOS XCTest and web Vitest parity tests would assert a dead dimension. Search + category + kind
+ source + owner + month remain.

## D6 — RLS & aggregate RPCs simplify to household membership

**Decision**: Rewrite `transactions` and `transaction_shares` RLS to drop the personal/shared
branches — visibility/write = "member of the transaction's household" (creator or household
owner for update/delete). Update `household_owner_spend` (and siblings if affected) to sum
`transaction_shares.amount_cents` per `person_id` instead of weighting by `percent`, dropping
the no-rows-means-creator branch (rows are always materialized).

**Rationale**: With scope gone and household_id NOT NULL, the policies collapse to the
membership checks that already exist via `is_household_member`/`is_household_owner`. Per-person
rollups become a plain `sum(amount_cents)` — simpler and exact.

**Open note for plan review**: the aggregate RPCs key on `user_id`; they move to `person_id`.
The dashboard already computes per-person client-side, so the RPCs are not on the critical path
and can be updated alongside or in a follow-up — flagged in tasks.

## D7 — Migration: one new Supabase migration, loss-free backfill

**Decision**: A single forward migration (early/personal data, user approved backfill):
1. `create table household_people …`; backfill a person per existing `household_members` row
   (`linked_user_id = user_id`, name/initial/color from `users`).
2. `transaction_shares`: add `person_id`, `amount_cents`; backfill existing percent rows to
   `amount_cents = computeShares-equivalent(round)` mapped to the linked person; create a
   full-amount person row for every transaction with no share rows (personal + single-owner
   shared); then drop `user_id`, `percent`; set `person_id`, `amount_cents` NOT NULL; new PK.
3. `transactions`: backfill `household_id` for personal rows to the creator's household; drop
   `scope` + `scope_matches_household`; set `household_id` NOT NULL.
4. Drop the `transaction_scope` enum; rewrite RLS; update RPCs (D6).
5. Client-side: on first post-update load, fold any device-stored local users into
   `household_people` and drop the local personal-shares store.

**Rationale**: Every user has exactly one household (bootstrap guarantees it), so "creator's
household" and "linked person" are well-defined for backfill. Doing it in one migration keeps
the schema coherent at every committed state.

**Risk/mitigation**: This is the riskiest piece. Mitigation: the cent-backfill reuses the same
rounding rule as `computeShares` (covered by vectors); a quickstart verification query asserts
`Σ shares = amount` for every transaction post-migration; the migration is reviewed before
apply. Because data is personal/early, a reset is an acceptable fallback.

## D8 — Reuse, don't reinvent (UI)

**Decision**: Web reuses `Segmented`/`Seg` (split-method toggle), the existing owner chips, the
shared `Drawer`, money formatting, and `SectionLabel`. iOS reuses the segmented pill, owner
chips (`OwnerChipView`), `SearchField`, and sheet patterns. The split editor is the only net-new
surface; the people list reuses the existing settings rows.

**Rationale**: Constitution I/II/III — same product, native affordances, no new components where
existing ones fit.

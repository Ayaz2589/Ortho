# Phase 0 Research: Household reimbursement & settle-up

The interpretation and the load-bearing modeling choices were settled with the user during an extended brainstorming dialogue and grounded by a 3-surface code exploration. This records the decisions.

## D1 — What "transfer money to another member" means

- **Decision**: It is **reimbursement / settle-up** — record who *paid* an expense, derive a running who-owes-whom balance, and let a member settle it. The settle entry is a new `transfer` transaction kind, **excluded** from all spend/income/budget/insight/per-owner aggregates.
- **Rationale**: The user's real workflow ("I pay all the bills, she reimburses her share at month-end"). Counting a reimbursement as the sender's expense + recipient's income would double-inflate household expense AND income for money that never leaves the household and would pollute budgets/categories/per-owner — confirmed against the aggregation guards (all `kind === 'expense'`/`'income'`). A distinct `transfer` kind is excluded for free.
- **Alternatives**: (a bare "transfer entry" with no balance — rejected: solves nothing without who-paid); (full Splitwise — rejected as out of scope: a household needs one net balance, not debt graphs/simplification/multi-currency); (reassign an expense's owners — already exists in the edit form).

## D2 — Representing a reimbursement (minimal schema)

- **Decision**: Reuse the existing share machinery. A `transfer` row stores `paid_by = sender` (the ower paying back), `owner_ids = [recipient]` (the payer being reimbursed), `shares = { recipient: amount_cents }`, `amount_cents = amount`, `category = 'transfer'`. So the only NEW column is `paid_by`; the shares-sum invariant (`shares` sum to `amount_cents`) still holds; `computeShares`/`validateSplit` are untouched and never run for transfers.
- **Rationale**: One column instead of three (`from/to` columns avoided). `paid_by` reads uniformly as "who paid the money out" — the payer for an expense, the sender for a transfer — and `owner_ids` carries the counterpart. Rehydrate folds shares→owner_ids exactly as today.
- **Alternatives**: dedicated `from_person_id`/`to_person_id` columns (more explicit but 2 extra columns + the share machinery would need a transfer carve-out); a separate `transfers` table (cleanest separation but new RLS, new list-merge, more surface) — rejected for v1.
- **Caveat captured**: the share-less rehydrate fallback ("creator owns the full amount") must be made **transfer-aware** so a transfer is never misread as a creator-owned expense.

## D3 — Who-paid field + backfill

- **Decision**: `paid_by` (a `household_people` id) on each expense, **defaulting to the creating member**; existing expenses backfill `paid_by` = the household person whose `linked_user_id = created_by`. `paid_by` nullable (legacy rows whose creator has no linked person, and income, stay null and simply don't contribute to any balance).
- **Rationale**: The common case ("I enter and pay everything") needs zero extra steps; correctness is preserved for the rare time the other member paid. `created_by` is the author, not the payer, so a dedicated field is required — but it's a fine *default*.

## D4 — The balance math (pure, vectored)

- **Decision**: `balanceBetween(viewer, other, transactions) → signed cents` (positive ⇒ *other owes viewer*):
  - For each **expense** with payer `P` and `shares`: if `P == viewer` add `shares[other]` (other owes you their share); if `P == other` subtract `shares[viewer]` (you owe them your share).
  - For each **transfer** with sender `F = paid_by` and recipient `R = the single owner`, amount `A`: if `F == other && R == viewer` subtract `A` (they paid you back); if `F == viewer && R == other` add `A` (you paid them, reducing your debt).
  - Mirrored TS↔Swift, locked by `member-balance.json`.
- **Rationale**: Integer-cents add/subtract over already-computed shares — deterministic, no new rounding. Per-other-member net (2 people → one number); generalizes to pairwise. Still vectored per Constitution VI (money/relationship logic).
- **Alternatives**: a stored balance/settlements table (rejected — derive it, single source of truth, no drift); per-pair N×N matrix UI (rejected — show net per other member).

## D5 — Migration sequencing

- **Decision**: One migration `20260618120000_member_reimbursement.sql`: `alter type transaction_kind add value if not exists 'transfer'`; `alter type transaction_category add value if not exists 'transfer'`; `alter table transactions add column paid_by uuid references household_people(id)`; backfill expenses' `paid_by` from `created_by` via `household_people.linked_user_id`. RLS unchanged (transfers are ordinary `transactions` rows, member-scoped).
- **Rationale**: Mirrors the existing `add value if not exists` precedent. The new enum values are **not referenced inside this migration** (the backfill uses `created_by` only), so Postgres' "new enum value unusable in the same transaction" rule isn't hit. Additive + reversible (drop column / values unused).

## D6 — Presentation rule

- **Decision**: Owing is **never red** (Constitution II/IV: loss/cost is never red). "Tasnuva owes you $X" and "You owe Tasnuva $X" use neutral `--text`/`--accent`; `--positive` is not used to flag a debt. "Settled" for zero. A "Settle up" button pre-fills a reimbursement for the owed amount, editable.

## Open items

None. No NEEDS CLARIFICATION remain.

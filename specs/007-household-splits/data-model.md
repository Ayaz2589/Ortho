# Data Model: Simplified Households & Flexible Splits

All money is integer USD cents (`bigint`). Owners are **people**, not auth users.

## Entities

### Household (unchanged shape)
- `id`, `owner_id` (auth user), `name`, `created_at`.
- One active household per account (multi-household switching out of scope).

### Person — `household_people` (NEW)
A name-only member of a household. Replaces both "household member (auth user) as owner" and
the device-only "LocalUser".

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid pk | owner reference used by `transaction_shares` |
| `household_id` | uuid → households | the household this person belongs to |
| `name` | text | display name (e.g. "Maya") |
| `initial` | text | avatar initial |
| `color_key` | text | palette key (closed palette) |
| `linked_user_id` | uuid → users, **nullable** | set for the account holder (their auth uid); null for name-only people |
| `sort_order` | int | display/owner-order (drives deterministic leftover-cent placement at the UI level) |
| `created_at` | timestamptz | |

Rules:
- A household has ≥1 person (the account holder's linked person).
- `linked_user_id` is unique per household when present (one person per real account).
- Deleting a person is allowed; existing `transaction_shares` referencing it are retained
  (the person row is **soft-kept**, i.e. removal hides it from pickers but the row persists so
  history renders). *Implementation note:* model "remove" as a `removed_at`/active flag rather
  than a hard delete, so `transaction_shares.person_id` FK never dangles (FR-004).

### Transaction (modified)
| Field | Change |
|-------|--------|
| `scope` | **REMOVED** (and the `transaction_scope` enum dropped) |
| `household_id` | now **NOT NULL** (every transaction belongs to the household) |
| `scope_matches_household` constraint | **REMOVED** |
| everything else | unchanged: `id, merchant, category, kind, amount_cents, source, date, created_by, created_at, updated_at` |

Client representation: `owner_ids` and the per-owner split are **derived from
`transaction_shares`** (no `scope`; no `splits` percent map). On the client a transaction
carries `owners: PersonId[]` (ordered) and `shares: Record<PersonId, cents>`.

### Owner Share — `transaction_shares` (modified)
| Field | Change |
|-------|--------|
| `user_id` | **REMOVED** |
| `percent` | **REMOVED** |
| `person_id` | **NEW** uuid → household_people |
| `amount_cents` | **NEW** bigint, `>= 0` |
| primary key | `(transaction_id, person_id)` |

Rules:
- Every transaction has **one row per owner**, including single-owner (full amount).
- `Σ amount_cents over a transaction = transactions.amount_cents` (enforced client/RPC-side in
  v1; verified by quickstart query).
- Percentage shown in UI is derived: `round(amount_cents / transaction.amount_cents * 100)`.

## Relationships

```
households 1───* household_people          (household_id)
households 1───* transactions              (household_id, NOT NULL)
transactions 1──* transaction_shares       (transaction_id, ON DELETE CASCADE)
household_people 1──* transaction_shares   (person_id, RESTRICT / soft-remove)
users 1──0..1 household_people             (linked_user_id, nullable)
```

## Split state & validation (client)

A transaction's split is edited as `{ method, owners, perOwner }`:
- `method`: `even | percent | value`.
- `owners`: ordered `PersonId[]` (length ≥ 1).
- `perOwner`: for `percent` → percentage per owner; for `value` → cents per owner; for `even`
  → none.

Derived via `computeShares` (see `contracts/split-function.md`) → `Record<PersonId, cents>`
summing to the amount. `validateSplit` gates saving:
- `even`: always valid (≥1 owner).
- `percent`: Σ percents = 100 ±0.5 tolerance.
- `value`: Σ cents = amount exactly.

State transitions:
- Add an owner → method resets to `even` (re-balance) unless the user is mid-edit of a custom
  split; reducing to one owner → that owner gets the full amount (method irrelevant).
- Editing the transaction amount → `percent`/`even` re-derive cents; `value` is re-validated
  and flagged if it no longer sums (FR-012, edge cases).

## Migration (forward, one file)

See `contracts/schema.md` for the SQL contract. Ordered steps:
1. Create `household_people`; backfill one person per `household_members` row (linked to the
   user, copying `name/initial/color_key`); set `sort_order` by join order.
2. `transaction_shares`: add `person_id`, `amount_cents`. Backfill —
   - rows that exist (shared, percent): `person_id` = person with `linked_user_id = user_id`;
     `amount_cents` = round(`transactions.amount_cents * percent/100`) with per-transaction
     remainder corrected so the rows sum to the amount.
   - transactions with **no** share rows: insert one row, `person_id` = creator's person,
     `amount_cents` = `transactions.amount_cents`.
   Then drop `user_id`, `percent`; set `person_id`, `amount_cents` NOT NULL; new PK
   `(transaction_id, person_id)`.
3. `transactions`: backfill `household_id` for null (personal) rows = creator's household; drop
   `scope` + `scope_matches_household`; set `household_id` NOT NULL.
4. Drop `transaction_scope` enum; rewrite `transactions` + `transaction_shares` RLS without
   scope branches; update aggregate RPCs to sum `amount_cents` per `person_id`.
5. Client one-time: fold device-stored local users into `household_people`; delete the local
   personal-shares store.

Post-migration invariant (quickstart-verified): for every transaction,
`Σ transaction_shares.amount_cents = transactions.amount_cents`, and every transaction has
`household_id NOT NULL` and ≥1 share row.

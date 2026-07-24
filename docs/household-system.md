# Household System

**Scope:** How Ortho models household identity, membership, people, transaction
ownership, and the member-balance / settle-up subsystem. Written after a
full code audit + test run on 2026-07-24.

Read alongside `docs/supabase.md` (RLS/RPCs) and `docs/web.md` §3 (store bootstrap).

---

## 1. What a household is

A household is Ortho's root data container. Every piece of financial data —
transactions, budgets, goals, properties, banks — belongs to a household, not a
user. The app is designed for two people sharing finances from one place, so
everything flows through this container rather than per-user silos.

---

## 2. Data model (4 tables)

| Table | Role |
|---|---|
| `households` | The container: `id`, `owner_id`, `name`. One per household. |
| `household_members` | Auth-linked memberships: which `users` belong to this household. Has `role` (`owner` / `member`). |
| `household_people` | **The real transaction owners** — name-only people who can own splits. The account holder gets one; so does every added partner or dependent. `linked_user_id` is NULL for name-only people. |
| `transaction_shares` | `(transaction_id, person_id, amount_cents)` — one row per owner; values must sum to the transaction total (enforced in SQL by `upsert_transaction`). |

**The key design decision:** transactions are owned by `household_people` rows,
not `users`. A person added without an Ortho account can fully own and split
transactions — no sign-up required. The account holder has BOTH a `users` row
(their auth identity) AND a `household_people` row linked via `linked_user_id`.

### Unique constraint
`household_people` has `unique (household_id, linked_user_id)` — prevents
duplicate person rows for the same auth user in the same household.

---

## 3. Bootstrap sequence

On every sign-in, `runBootstrap()` in `lib/store.tsx`:

1. `auth.getUser()` → redirect to sign-in if no session
2. Look up `household_members` for this user → **fail loud** (`orThrow`). A
   swallowed error here would silently create a duplicate household and detach
   the user from all their data.
3. If no membership: create new `households` + `household_members` rows
4. `ensureAccountPersonAndFoldLegacy()`:
   - Creates the account holder's `household_people` row if absent
   - One-time migration: folds legacy `localStorage['localUsers']` name-only
     people into `household_people` (wrapped in `try/catch` — never takes down
     bootstrap)
5. `loadAll()` — 17 parallel reads: household_people, transactions, shares,
   budgets, goals, banks, tags, and more

**Fail-loud vs fail-open split:** the 11 core reads use `orThrow`; the 6 newer
additive reads (goals, linked banks, tags) treat missing-table errors
(`PGRST205`/`42P01`) as empty — the deploy-before-migrate window where Vercel
ships `main` before migrations apply.

---

## 4. People vs Users

```
store.people         → ALL household_people rows (including removed)
store.activePeople   → people where removed_at IS NULL, sorted by sort_order
store.householdMembers → activePeople.map(personToUser) — User-shaped for display
store.currentPersonId → the Person whose linked_user_id = currentUserId
```

`resolveUser(id)` falls back to `{ name: 'Removed', initial: '·', color_key: 'sand' }`
for a deleted person — old balances and transaction displays stay readable even
after someone is removed from the household.

---

## 5. People CRUD (Settings → Household)

All mutations are **optimistic**: the UI updates instantly, the async write
follows, and rolls back on error.

| Action | Store function | Notes |
|---|---|---|
| Add person | `addPerson(name, colorKey)` | `initial = name[0].toUpperCase()`, `linked_user_id = null` |
| Rename | `renamePerson(id, name)` | Recomputes `initial` from new name |
| Recolor | `setPersonColor(id, colorKey)` | Separate write from rename |
| Soft-remove | `removePerson(id)` | Sets `removed_at`; row kept; existing transaction history preserved |
| Rename household | `updateHouseholdName(name)` | Updates `households.name` |

### Constraints (UI-layer only, not enforced by RLS)

- The account holder (`isCurrentPerson`) cannot be removed — checked in
  `HouseholdDrawer.tsx`
- The last remaining person cannot be removed — `householdMembers.length > 1`
  guard in `HouseholdDrawer.tsx`

---

## 6. Transaction splits and ownership

Each transaction carries:

- `owner_ids` — ordered list of person IDs who share responsibility for the spend
- `shares` — `Record<personId, cents>` where values sum to `amount_cents`
- `paid_by` — who physically fronted the money (payer for expenses; sender for
  transfers/reimbursements)

Splits are computed by `lib/splits.ts` and written atomically via the
`upsert_transaction` RPC (migration `20260718120002`) — parent row and all share
rows commit together or not at all. The pre-027 two-step client write is gone.

`effectiveShares(tx)` in `lib/format.ts` falls back to an even split when share
rows are absent (defensive only — persisted transactions always carry materialized
shares since migration `20260616120000`).

---

## 7. Balance and settle-up system

### The formula — `lib/balances.ts`

```ts
balanceBetween(viewer, other, transactions): number
// positive → other owes viewer
// negative → viewer owes other
// 0        → settled
```

- **Expense, viewer paid:** `net += other.share` (other owes their portion)
- **Expense, other paid:** `net -= viewer.share` (viewer owes their portion)
- **Transfer `other→viewer`:** `net -= amount_cents` (other reimbursed viewer)
- **Transfer `viewer→other`:** `net += amount_cents` (viewer paid other back)
- **Income:** no effect on balances
- **Third-party transactions:** no effect on the viewer↔other pair

Balances are computed over **all transactions ever** (no month scope). Integer
cents only — no rounding.

### `BalanceSummary` component

Rendered on the Transactions page. Finds all counterparties who appear anywhere
in the ledger — including removed members — so an outstanding balance with
someone who has left is still visible and settle-able. Filters to non-zero rows,
sorts alphabetically. Never shows red (Constitution rule: loss/cost is never red).

### Settle-up (B9 fix)

The "Settle up" button prefills a `transfer` transaction with `{ from, to, amountCents }`
where `amountCents` is the **exact integer balance**, not a display-currency
round-trip. This is critical: if the amount were run through `centsToDisplay` →
`displayToCents` at a non-USD rate, a cent could be lost (e.g. 11¢ × GBP 0.78 →
"£0.09" → 12¢ on re-parse — leaving the pair perpetually unsettled).

---

## 8. RLS policies

```sql
-- Any household member can read and write their own household's people
household_people_select → is_household_member(household_id)
household_people_write  → for ALL: is_household_member(household_id)

-- Transactions: insert requires membership; update/delete requires
-- authorship OR household ownership
transactions_insert → created_by = auth.uid() AND is_household_member
transactions_update/delete → created_by = auth.uid() OR is_household_owner

-- Shares follow the parent transaction's authorship rules
transaction_shares_write → follows parent transaction creator/owner
```

**Security fix (migration 20260717160000):** The original `household_members`
INSERT policy had a privilege-escalation gap — any authenticated user who knew a
victim's `household_id` (not a secret: they travel in URLs and screenshots) could
self-insert as an `owner` of that household. Fixed by gating the self-insert
branch on `is_household_record_owner(household_id)` (a SECURITY DEFINER helper
that reads `households.owner_id` directly, bypassing the chicken-and-egg RLS
that would hide the just-created household row).

---

## 9. What is NOT in the household system

### No invite flow (deliberate deferral)

The schema has a fully-implemented `accept_invite` SECURITY DEFINER RPC and a
`pending_invites` table with RLS. The bootstrap code is written to handle a
second auth user finding a membership row. But there is no UI to create or accept
invites.

**Effect:** the "partner" in a household is a name-only `household_people` entry.
They cannot sign in with their own Ortho account and see the shared household.
Both people currently share one login. The schema is ready for multi-user
households — the invite UI is the missing piece.

### No multi-household

Bootstrap takes `membership[0].household_id` — a user is in exactly one
household. No merge, transfer, or secondary-household path exists.

### No server-side last-person guard

The `household_people_write` policy is `for all` — any household member can
DELETE any person row via the API, including the account holder's own row. The
"cannot remove self / must keep one person" constraint is UI-only
(`HouseholdDrawer.tsx`). A direct API DELETE of the account holder's person row
would leave `currentPersonId` empty, disabling settle-up and transaction
ownership.

---

## 10. Test coverage

| Test file | What it covers |
|---|---|
| `test/member-balance.parity.test.ts` | 9 golden-vector cases against `shared/test-vectors/member-balance.json`: worked example, reverse payer, payer-not-owner, settle to zero, partial reimburse, over-reimburse sign flip, multi-expense net, third-member isolation, transfer-only |
| `test/balance-summary.test.tsx` | 3 component cases: "X owes you", "you owe X", hides when settled |
| `test/web/settle-up-currency.test.tsx` | B9 regression: exact cents preserved through non-USD display currency |

All 191 test files pass as of 2026-07-24 (`npm test`). TypeScript clean
(`npx tsc --noEmit` exits 0).

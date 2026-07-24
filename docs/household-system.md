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

---

## 11. Next Steps — Household Feature Redesign

Written 2026-07-24 after auditing the existing system against the product vision and market
research in `docs/research/`. Read alongside `docs/research/finance-habits-budgeting-apps.md`
(§4 couples-splitting reality) and `docs/research/product-fit-analysis.md` (§3 code audit).

---

### 11.1 Product vision

A user does **not** need to be in a household. The app works as a solo budgeting tool. Household
features are opt-in — a user can add "local members" (a roommate, a partner, a family member who
doesn't have an Ortho account) and then assign transaction ownership and splits among those people.

Core behaviors once household members exist:

| Transaction ownership mode | `paid_by` | `owner_ids` | Balance effect |
|---|---|---|---|
| **Just me** | self | [self] | none |
| **We each paid our share** | null / each | [multiple] | none (each paid their portion) |
| **I paid for everyone** | self | [self + others] | others owe self their shares |
| **They paid for everyone** | other | [self + other] | self owes other their share |
| **Shared income (received by one)** | recipient | [recipient + others] | others are owed their shares |
| **Shared income (received jointly)** | null | [multiple] | none or per individual shares |
| **Settlement** | payer | [payee] | zeroes out existing balance |

The existing `paid_by` + `owner_ids` + `shares` data model already encodes all of these. The
missing pieces are:
1. UX clarity (a "payment mode" selector that hides the underlying model complexity)
2. Income balance effects (currently excluded from `balanceBetween`)
3. N-person pairwise balance matrix (current `balanceBetween` is viewer-anchored, breaks for 3+)
4. A dashboard balance widget

---

### 11.2 Gap analysis — what exists vs what to build

| Feature | Status | Notes |
|---|---|---|
| Solo mode (no household required) | 🟡 Needs UX change | Bootstrap always creates a household; `activePeople.length === 1` guard needed in split UI |
| Local members (no Ortho account) | ✅ Exists | `household_people` with `linked_user_id = null` already supports this; needs clearer onboarding copy |
| Transaction ownership type UI | ❌ Needs new UI | Maps onto existing `paid_by` + `owner_ids` — UX wrapper only, no schema change |
| Flexible splits (equal / pct / amount) | ✅ Exists | `shares Record<personId, cents>` — needs preset buttons in transaction form |
| One-paid-for-everyone → balance | ✅ Exists | `paid_by ≠ owner_ids` logic in `balanceBetween` is already correct |
| Income balance effects | ❌ Missing | `balanceBetween` (`lib/balances.ts`) skips income with an explicit `continue` |
| N-person pairwise balance matrix (3+) | ❌ Missing | Current function is viewer-anchored; `what Amir owes Fatima is invisible to Carol` |
| Balance debt simplification | ❌ Missing (optional) | For 3+ people: collapse A→B + B→C into A→C |
| Dashboard balance widget | 🟡 Partial | `BalanceSummary` lives on Transactions page only; needs to become a dashboard widget |
| Settle-up for income balances | ❌ Missing | Automatic once income balance effects land (same prefill flow) |

---

### 11.3 Technical changes required

#### A. Solo mode

No schema changes. Guard on `activePeople.length > 1` (already available in store):

- `AddTransactionForm` / `EditTransactionForm`: hide "split with" and "who paid" sections when solo
- `BalanceSummary` and balance widget: render nothing when solo
- Settings → Household: surface "Add a person" as the entry point, not a prerequisite

#### B. Income balance effects

Current exclusion in `lib/balances.ts`:

```ts
// current — income excluded entirely
if (tx.type === 'income') continue;
```

New logic: income follows the same `paid_by` / `owner_ids` / `shares` formula as expenses, but
with inverted sign semantics. When someone **receives** income that is designated shared:

- **Recipient is `paid_by`:** non-recipient owners are owed their share → `net += other.share`
  from the viewer's perspective toward the recipient
- Mechanically identical to the existing expense path — the sign inversion is already handled by
  the `paid_by === viewer` vs `paid_by === other` branches in `balanceBetween`

The fix is removing the `if (tx.type === 'income') continue` guard and testing the income vectors
(add new golden vectors to `test/member-balance.parity.test.ts`).

#### C. N-person pairwise balance matrix

Current `balanceBetween(viewer, other, transactions)` is asymmetric and viewer-scoped. For 3+
people, add:

```ts
// lib/balances.ts
allPairBalances(
  people: Person[],
  transactions: Transaction[],
  shares: Shares
): Map<personId, Map<personId, number>>
// [a][b] = amount B owes A (positive) or A owes B (negative)
```

This is a double loop over `people × people`, calling `balanceBetween` for each ordered pair. The
matrix is symmetric by sign (`[a][b] === -[b][a]`). Used by the balance widget to enumerate all
outstanding pairs.

#### D. Balance debt simplification (optional, recommended for 3+ households)

For 3+ person households, multi-hop debts can be collapsed. If Alice owes Bob $30 and Bob owes
Carol $20, the net is Alice→Carol $20 + Alice→Bob $10. Implement as a pure function over the
balance matrix (Splitwise's published "Debts Made Simple" algorithm). Reduces the number of
settle-up transfers the household needs to complete.

This is non-trivial to explain in the UI but materially reduces friction in shared households.
Gate it behind `activePeople.length >= 3` and show a "Simplified" toggle.

#### E. Dashboard balance widget (`HouseholdBalancesWidget`)

- Replaces / mirrors `BalanceSummary` on the dashboard Overview
- Shows each non-zero pairwise balance as a row: `{name} owes you $X` / `You owe {name} $X`
- "Settle up" button per pair — prefills a transfer transaction (B9 fix intact)
- "All settled" empty state when all balances are zero
- Hidden when solo or no household members
- Show total net position at the top ("You are owed $X net" / "You owe $X net")

#### F. Transaction ownership type UX

Add a mode selector to transaction forms — three modes that wrap the existing model:

| Mode label (UI) | `paid_by` | `owner_ids` |
|---|---|---|
| Just me | self | [self] |
| Split — we each paid | null | [selected people] |
| [Person] paid for everyone | selected payer | [all selected] |

"Split — we each paid" hides the balance implication; "paid for everyone" makes it explicit that
a balance will be created. Income transactions get the same selector with language flipped
("received by" instead of "paid by").

No schema changes. Fully maps onto the existing `paid_by` + `owner_ids` + `shares` fields.

---

### 11.4 Research-backed enhancements (not in the original ask — recommended additions)

From `docs/research/finance-habits-budgeting-apps.md` §4 and `docs/research/product-fit-analysis.md`:

1. **Split presets** — Research: ~46% of couples actually split 50/50; ~38% proportional-to-income
   (YouGov UK, Census SIPP). One-tap "Equal split" button is the single highest-frequency
   affordance in the split UI. Proportional-to-income requires per-person income to be set (a
   future settings field).

2. **Settle-up threshold nudge** — Research synthesis: shared-expense settle-up is episodic;
   balances accumulate until a manual threshold (~$100–300, around payday). A configurable nudge
   ("You're owed $145 — settle up?") on the balance widget surfaces what the dashboard otherwise
   buries. Low build cost, high perceived attentiveness.

3. **Settlement history** — Show a filtered view of past transfer/settle-up transactions within
   the balance widget. Answers "when did we last settle?" and builds trust in the running balance
   number. Already exists in the transaction ledger; just needs a filtered view.

4. **Balance debt simplification** — See §11.3.D. NYC's target households are 2–4 adults
   (`docs/research/nyc-market-language-analysis.md` §8: ~10% of immigrant families in overcrowded
   shared households). For 3-person households this is a tangible quality-of-life win.

5. **Recurring split memory** — For recurring merchants (Netflix, rent, Con Ed), remember and
   suggest the previous split configuration. Research: ~10–15 recurring charges/month are the
   minority of transaction *count* but a large share of *value*
   (`docs/research/finance-habits-budgeting-apps.md` §5). Reducing friction on the most common
   shared expenses reduces abandonment.

6. **Cash payment tracking** — Research: ~24% of payments for households under $25k are cash
   (FDIC 2023; `docs/research/product-fit-analysis.md` §4.3). The current model assumes a tracked
   payment. For balance purposes, "Alex paid cash for groceries — split 50/50" should create the
   same balance as a card payment. Ensure the transaction form's "who paid" flow works for
   cash-payer designation.

---

### 11.5 What NOT to change

- The `household_people` / `transaction_shares` schema — solid, don't restructure
- The atomic `upsert_transaction` RPC — keep as-is; extend only if income balance effects require
  a DB-level constraint change (unlikely — the share-sum check is amount-agnostic)
- Soft-delete on `household_people` — critical for balance history with removed members (§7 note:
  `BalanceSummary` already finds and shows removed-member balances correctly)
- The B9 settle-up fix (exact integer cents through `amountCents`, not display currency) — keep
- `paid_by` + `owner_ids` + `shares` transaction model — clarify the UX, not the model
- No invite flow decision (§9) — still a deliberate deferral; local members remain name-only

---

### 11.6 Implementation order (recommended phases)

**Phase 1 — UX only, no logic changes, no schema changes**

1. Solo mode guard: hide split/balance UI when `activePeople.length === 1`
2. Onboarding copy: "Add a roommate or family member — they don't need an Ortho account"
3. Transaction ownership type selector (wraps existing `paid_by` + `owner_ids` UX)
4. Split preset buttons: "Equal" one-tap, manual percentage/amount

**Phase 2 — New logic, no schema changes**

5. Income balance effects: remove income exclusion in `lib/balances.ts`; add income vectors to
   `test/member-balance.parity.test.ts`
6. N-person pairwise balance matrix: `allPairBalances` in `lib/balances.ts`
7. Dashboard balance widget: `HouseholdBalancesWidget` using the matrix
8. Settle-up for income balances: automatic once Phase 2.5 lands (same prefill flow)

**Phase 3 — Research-backed enhancements**

9. Settle-up threshold nudge (configurable in Settings)
10. Settlement history view (filtered ledger inside the balance widget)
11. Balance debt simplification for 3+ person households
12. Recurring split memory (suggest previous split for known recurring merchants)

---

### 11.7 Open questions flagged by research

- **Balance visibility in multi-person households**: Should Carol see Alice and Bob's balance with
  each other? Today `balanceBetween` is viewer-scoped so Carol cannot. Full transparency aids trust
  in shared households but may feel invasive. Decide before shipping the balance matrix.

- **Private transactions**: `transactions.scope` was dropped in spec 007. In multigenerational or
  mixed-income households, not every expense should be visible to all members. This is a non-goal
  for now but will come up once households have 3+ members.

- **Household-level vs per-person budgets**: The budget engine currently models a merged wallet
  (`lib/finance/budgets.ts` has zero references to `owner_ids`). As households grow to 3+ people,
  "who is over budget" becomes ambiguous. This is deferred but the architecture has a seam here.

- **Income split UI language**: "Received by" vs "Who earned it" vs "Who gets credit" — the right
  framing for income splits needs a user test, not a design assumption.

---

## 12. Spec 031 — Household Redesign (shipped 2026-07-24)

All gaps identified in §11.2 were addressed in **spec 031** (`specs/031-household-redesign/`).

### What shipped

| Gap | Resolution |
|---|---|
| Income balance effects | `balanceBetween` now handles income via same `paid_by`/`owner_ids` path — income golden vectors added to balance parity tests |
| N-person pairwise balance matrix | `allPairBalances(people, transactions)` in `lib/balances.ts` — `O(n²)` double loop over all pairs |
| Balance debt simplification | `simplifyDebts(pairs, people)` in `lib/balances.ts` — collapses A→B+B→C into A→C for 3+ people |
| Dashboard balance widget | `HouseholdBalancesWidget` component — shows per-pair balances with settle-up deep-link, threshold nudge, settlement history, and simplified toggle |
| Transaction ownership type UI | `OwnershipModePicker` Seg in `TxFormFields` — "Just me" / "We each paid" / "[Name] paid" modes, income-aware labels |
| Recurring split memory | `getLastSplitForMerchant` in `lib/splitMemory.ts` — suggests prior multi-person split for repeat merchants with a dismissable chip |
| Settle-up threshold settings | `useSettleThreshold` hook + settings input at `settings/household/page.tsx` |
| Settlement history panel | Per-pair history of past transfers in `HouseholdBalancesWidget` |

### What remains open (deferred to future specs)

- Balance visibility transparency (Carol seeing Alice↔Bob balance): deferred pending UX decision
- Private/scoped transactions: non-goal until 3+ member households are common
- Per-person budget attribution: architecture seam exists, deferred
- Income split UI copy: needs user testing

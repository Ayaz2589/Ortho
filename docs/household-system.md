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

### Ownership defaults (spec 050)

A **new** expense/income transaction defaults to **every active person**, split evenly, whenever the
household has more than one and the per-device `ortho.sharedByDefault` preference is on (it is by
default). Before spec 050 every ingest path defaulted to the single logged-in person, so a
multi-adult household produced a ledger indistinguishable from a solo one. Editing or copying an
existing transaction never applies the default — a default must not re-attribute recorded money.
`resolveDefaultOwnerIds()` in `lib/defaultOwner.ts` is the single rule, shared by the form and CSV
import.

### Unique constraint
`household_people` has `unique (household_id, linked_user_id)` — prevents
duplicate person rows for the same auth user in the same household.

### Deposit accounts (spec 033)
`deposit_accounts` is a household-scoped roster (name-only rows) that mirrors
`cards`. It replaces the old hardcoded `INCOME_SOURCES` constant (now removed):
the income "Deposit to" dropdown is populated from these user-configured
accounts, managed in Settings → Deposit Accounts. It loads **fail-open** in
`loadAll` as `store.depositAccounts`. The chosen account is stored as the income
transaction's `source` (a plain string name — no transactions schema change) and
has **no effect on balance math** (income has no balance effect — see §7).

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
5. `loadAll()` — 18 parallel reads: household_people, transactions, shares,
   budgets, goals, banks, tags, deposit accounts, and more

**Fail-loud vs fail-open split:** the 11 core reads use `orThrow`; the 7 newer
additive reads (goals, goal_contributions, linked banks, tags, transaction_tags
join, deposit_accounts) treat missing-table errors (`PGRST205`/`42P01`) as empty
— the deploy-before-migrate window where Vercel ships `main` before migrations
apply.

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

### Split math surface

The split calculators live in `lib/splits.ts`:

- Three methods — **even**, **percent**, **value** — via `computeShares`,
  validated by `validateSplit` (percent totals must land within
  `PERCENT_TOLERANCE = 0.5` of 100). `seedSplit` derives editable UI seed values
  from stored cents.
- **Deterministic leftover-cent policy** (spec 027 / B4): shares are allocated in
  a canonical owner order via `orderedOwnerIds`, so the lexically-first owner
  bears any leftover cent regardless of entry/storage order. Mirrored by iOS and
  locked by shared test vectors.

UI-seeding helpers in `lib/splitFields.ts` (`evenPercentStrings`,
`evenValueStrings`, `rebalancePercents`) format those values for the form inputs.

`resolveDefaultOwnerId` (`lib/defaultOwner.ts`) picks the default owner/payer for
a new or imported transaction — current person → first household member → auth
user — shared by `TxForm` and CSV import so hand-entered and imported rows resolve
the same way.

---

## 7. Balance and settle-up system

### The formula — `lib/finance/balances.ts` (rebuilt in spec 053)

> **History.** Spec 043 deleted this feature because the original `balanceBetween` was
> **viewer-anchored**: in a three-adult household what one roommate owed another was invisible to
> the third. Spec 053 rebuilt it for N people. The nine golden-vector cases are unchanged and the
> regenerated JSON is byte-identical, so the pairwise rules below are exactly as they always were.

```ts
balanceBetween(a, b, transactions): number   // positive ⇒ b owes a
allPairBalances(personIds, transactions)     // every ordered pair; antisymmetric
outstandingBalances(personIds, transactions) // non-zero pairs, creditor-first
peopleInLedger(transactions)                 // roster from the LEDGER, not the active list
```

- **Expense, viewer paid:** `net += other.share` (other owes their portion)
- **Expense, other paid:** `net -= viewer.share` (viewer owes their portion)
- **Transfer `other→viewer`:** `net -= amount_cents` (other reimbursed viewer)
- **Transfer `viewer→other`:** `net += amount_cents` (viewer paid other back)
- **Income (spec 053):** the mirror of the expense case — a recipient of co-owned income owes
  each co-owner their share
- **No payer:** contributes nothing. Historical rows predate payer capture, and inventing a payer
  for them would fabricate debts
- **Third-party transactions:** no effect on the viewer↔other pair

Balances are computed over **all transactions ever** (no month scope). Integer
cents only — no rounding.

### `HouseholdBalancesBody` widget (spec 053)

A default-off widget in the dashboard registry. Shows **every** non-zero pair to **every**
member — including pairs the viewer is not part of, which is the whole point of the N-person
rebuild. The roster comes from `peopleInLedger`, so a removed member's outstanding balance stays
visible and settle-able. Balances span the entire ledger and deliberately ignore the dashboard's
time scope — a debt does not expire at month end. Never red.

### Settle-up

⚠️ **Not currently wired.** The one-tap prefill (`TransferPrefill`/`initialTransfer`/`openSettle`/
the `transfer` URL param) was removed in spec 043 and has not been rebuilt — spec 053 FR-014 is
deferred. Settling today means recording a Transfer on the New form manually; the balance list
recomputes correctly once you do.

When it returns, the **B9 rule still applies**: prefill the **exact integer balance**, never a
display-currency round trip. If the amount were run through `centsToDisplay` → `displayToCents` at
a non-USD rate a cent could be lost (11¢ × GBP 0.78 → "£0.09" → 12¢ on re-parse), leaving the pair
perpetually unsettled.

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

All 233 test files pass (`npm test`). TypeScript clean
(`npx tsc --noEmit` exits 0).

---

## 11. Next Steps — Household Feature Redesign

> **STATUS 2026-08-16.** This section was written 2026-07-24 and its code references describe the
> tree as it was then — in particular `lib/balances.ts`, which spec 043 deleted and spec 053 rebuilt
> at `lib/finance/balances.ts`. Shipped since: **§11.3.B** income balance effects, **§11.3.C** the
> N-person matrix and **§11.3.E** the balance widget (all spec 053); **§11.6 Phase 1** shared-by-
> default ownership and split presets (spec 050); the person-scoped engines that §11.7's
> budget question anticipated (spec 051), and **per-person budget LIMITS** answering it outright
> (spec 054 — §11.7). Still open: solo-mode UX polish, debt simplification,
> the settle-up prefill, settlement history, recurring split memory, and the invite flow.

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
| Income balance effects | ✅ Shipped (spec 053) | `balanceBetween` (`lib/balances.ts`) only branches on `expense`/transfer, so income matches neither and has no balance effect |
| N-person pairwise balance matrix (3+) | ✅ Shipped (spec 053) | Current function is viewer-anchored; `what Amir owes Fatima is invisible to Carol` |
| Balance debt simplification | ❌ Missing (optional) | For 3+ people: collapse A→B + B→C into A→C |
| Dashboard balance widget | ✅ Shipped (spec 053) | `BalanceSummary` lives on Transactions page only; needs to become a dashboard widget |
| Settle-up for income balances | ❌ Missing | Automatic once income balance effects land (same prefill flow) |

---

### 11.3 Technical changes required

#### A. Solo mode

No schema changes. Guard on `activePeople.length > 1` (already available in store):

- `AddTransactionForm` / `EditTransactionForm`: hide "split with" and "who paid" sections when solo
- `BalanceSummary` and balance widget: render nothing when solo
- Settings → Household: surface "Add a person" as the entry point, not a prerequisite

#### B. Income balance effects — ✅ shipped in spec 053

Current behavior in `lib/balances.ts`: the loop branches only on
`t.kind === 'expense'` and `else if (isTransfer(t))`. There is **no explicit
income guard** — income (`t.kind === 'income'`) simply matches neither branch, so
it contributes nothing to the net:

```ts
// current — only expense and transfer are handled; income matches neither
if (t.kind === 'expense') {
  // payer-owes logic on t.shares
} else if (isTransfer(t)) {
  // reimbursement logic on t.amount_cents
}
// income falls through → no balance effect
```

New logic: income follows the same `paid_by` / `owner_ids` / `shares` formula as expenses, but
with inverted sign semantics. When someone **receives** income that is designated shared:

- **Recipient is `paid_by`:** non-recipient owners are owed their share → `net += other.share`
  from the viewer's perspective toward the recipient
- Mechanically identical to the existing expense path — the sign inversion is already handled by
  the `paid_by === viewer` vs `paid_by === other` branches in `balanceBetween`

The fix is **adding** a new `t.kind === 'income'` branch (not deleting a guard — there is none)
and testing the income vectors (add new golden vectors to `test/member-balance.parity.test.ts`).

#### C. N-person pairwise balance matrix — ✅ shipped in spec 053

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

#### E. Dashboard balance widget — ✅ shipped in spec 053 as `HouseholdBalancesBody`

> **Note (spec 034):** the dashboard is now a toggleable widget system — the old
> "Overview | Reports" modes are gone. A future `HouseholdBalancesWidget` would be
> a `WidgetDefinition` registered in `lib/widgets/registry.tsx` (toggled per-browser
> in Settings → Widgets), not a bespoke insert into an Overview view.

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
   (`docs/research/market-analysis/nyc-market-language-analysis.md` §8: ~10% of immigrant families in overcrowded
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

5. Income balance effects: add a `t.kind === 'income'` branch in `lib/balances.ts`; add income
   vectors to `test/member-balance.parity.test.ts`
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

- **Household-level vs per-person budgets**: ANSWERED by specs 051 + 054. Spec 051 narrowed the
  **spend measured against** a budget; spec 054 gave the LIMIT the same owner — `budgets.person_id`
  (null = the household's), selected by `scopeBudgets` and enforced by
  `unique nulls not distinct (household_id, category, person_id)`. Person scope never falls back to
  the household limit, so "who is over budget" is now answerable per person. What remains deferred
  is the **pooling model** — automatically dividing one household allowance into per-person shares
  is the same unvalidated question spec 050 left open, and 054 deliberately does not answer it.

- **Income split UI language**: "Received by" vs "Who earned it" vs "Who gets credit" — the right
  framing for income splits needs a user test, not a design assumption.

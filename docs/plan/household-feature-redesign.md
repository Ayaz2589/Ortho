> **STATUS 2026-08-16.** Income balance effects, the N-person pairwise matrix and the dashboard
> balance widget shipped in **spec 053**; the engine now lives at `web/lib/finance/balances.ts`
> (not `web/lib/balances.ts` — spec 043 deleted the original and 053 rebuilt it). Shared-by-default
> ownership shipped in **spec 050**. Debt simplification and the settle-up prefill remain open.

# Household Feature Redesign — Implementation Plan

**Written:** 2026-07-24
**Status:** Planning — ready to implement
**Motivation:** The household system's data model is already correct for everything described
below. The gaps are in logic and UX: income transactions are excluded from balances, the
balance function is viewer-anchored (breaks for 3+ people), there is no "just me" solo mode,
and there is no transaction ownership UX that surfaces the `paid_by` / `owner_ids` model in
plain language. This plan closes all of those gaps without touching the schema.

**Primary reference:** `docs/household-system.md` — especially §6 (splits), §7 (balances),
and the new §11 (next steps / gap analysis written alongside this plan).

**Stage environment:** The stage database is fully seeded with a realistic demo household
(spec 030). **Use the stage environment to confirm every hypothesis** about balance
calculations, income effects, and widget display before calling a task done. Log into
stage with the env-gated auto-login, navigate to the feature, and verify visually that the
data matches the expected math. Unit tests verify correctness; stage verifies that the
feature looks and feels right with realistic data.

---

## 1. What already exists — do not rebuild

| What | Where | Notes |
|---|---|---|
| Per-person splits | `web/lib/splits.ts` | N-person, deterministic to the cent, vector-locked |
| Pairwise balance calc | `web/lib/balances.ts` — `balanceBetween()` | Correct for two people; viewer-anchored |
| Atomic transaction write | `supabase/functions/upsert_transaction/` | Parent row + all share rows commit together |
| `paid_by` / `owner_ids` / `shares` model | `web/lib/store.tsx`, `web/types/` | All the data is already there |
| `BalanceSummary` component | `web/components/web/BalanceSummary.tsx` | Exists on Transactions page; needs to become a widget too |
| Settle-up prefill | B9 fix in `web/components/web/BalanceSummary.tsx` | Passes exact integer cents — keep as-is |
| Local members (no Ortho account) | `household_people` with `linked_user_id = null` | Schema already supports it |
| Soft-delete on people | `household_people.removed_at` | Preserves balance history with removed members |
| `activePeople` / `resolveUser()` | `web/lib/store.tsx` | Already handles removed-member display |

---

## 2. What needs to be built

### Phase 1 — UX wrappers, zero logic changes

**T001 — Solo mode guard**

When `store.activePeople.length === 1`, hide all household split/balance UI. There is nothing
to split with nobody else.

Files to change:
- `web/components/web/AddTransactionForm.tsx` (or equivalent) — hide "split with" and "who paid" sections
- `web/components/web/BalanceSummary.tsx` — render null when solo
- Settings → Household page — surface "Add a person" as an entry point, not a prerequisite

Guard: `const isSolo = store.activePeople.length === 1`

No new store state needed.

---

**T002 — Local member onboarding copy**

The Settings → Household page currently does not explain that added people don't need an
Ortho account. Update the empty state and the "Add person" flow to say:

> "Add a roommate or family member — they don't need an Ortho account."

Files to change:
- `web/components/web/HouseholdDrawer.tsx` (or the Settings household section) — empty state copy
- i18n catalogs: add key to all 5 language files (`web/lib/i18n/locales/*.ts`) — use
  `t('add_local_member_hint')` or equivalent

---

**T003 — Transaction ownership type selector**

The transaction form currently has a split editor but no plain-language selector for *how*
the transaction is shared. Add a mode picker that wraps the existing `paid_by` + `owner_ids`
model in three options:

| Mode label | `paid_by` written | `owner_ids` written |
|---|---|---|
| **Just me** | `currentPersonId` | `[currentPersonId]` |
| **We each paid our share** | null (or omitted) | [all selected people] |
| **[Person] paid for everyone** | selected payer | [all selected people] |

The picker should appear only when `!isSolo` (T001 guard). When "Just me" is selected, the
owner/split section collapses entirely. When "Someone paid for everyone" is selected, a
"Who paid?" person picker appears.

Income transactions get the same picker with inverted language:
- "Just me" → "I received this"
- "We each received our share" → (rare; no payer)
- "[Person] received it for us" → `paid_by = recipient`, others are owed their share

Files to change:
- `web/components/web/AddTransactionForm.tsx`
- `web/components/web/EditTransactionForm.tsx`
- No store changes; just maps to existing `paid_by` / `owner_ids` on submission

---

**T004 — Split preset buttons**

The split editor currently requires manual amount entry. Add one-tap presets:

- **Equal** — divides `amountCents` evenly among `owner_ids`, remainder goes to the first person
  (matches existing `lib/splits.ts` even-split logic)
- **Percentage** — opens a percentage input per person; amounts auto-compute
- **Exact** — the current manual entry mode

Research basis: ~46% of couples split 50/50 in practice (YouGov UK, Census SIPP 2023).
Equal is the single most-used split method — it should be one tap.

Files to change:
- `web/components/web/SplitEditor.tsx` (or equivalent split UI component)
- No logic changes — just calls existing `lib/splits.ts` functions

Hypothesis to confirm on stage: add a shared expense with two household members and "Equal"
preset → verify both share rows sum to the transaction total and display correctly.

---

### Phase 2 — New logic, no schema changes

**T005 — Income balance effects**

**The single most important logic gap.** Currently `lib/balances.ts` excludes income:

```ts
// lib/balances.ts — current
if (tx.type === 'income') continue;   // ← REMOVE THIS
```

Income with `paid_by` (the recipient) and multiple `owner_ids` should create balances exactly
like an expense does. The formula is already correct for expenses — the income exclusion is a
single guard to remove. When Alice receives $1,000 and it's split 50/50, Bob is owed $500 and
Alice holds that balance until settlement.

Steps:
1. Remove the `if (tx.type === 'income') continue` guard in `balanceBetween()`
2. Add income golden vectors to `test/member-balance.parity.test.ts`:
   - Income received by viewer, split evenly → positive balance (other owes viewer)
   - Income received by other, split evenly → negative balance (viewer owes other)
   - Income with "just me" (owner_ids = [recipient]) → no balance effect (same as before)
   - Partial income split → balances reflect shares
3. Run `npm run gen:vectors` if the vector generation script covers balances; otherwise
   add vectors manually to `shared/test-vectors/member-balance.json`
4. Confirm on stage: log an income transaction marked as "received by" one household member
   with a 50/50 split → verify the BalanceSummary shows the correct balance

Files to change:
- `web/lib/balances.ts`
- `test/member-balance.parity.test.ts`
- `shared/test-vectors/member-balance.json` (if vectors are generated from here)

---

**T006 — N-person pairwise balance matrix**

`balanceBetween(viewer, other, transactions)` is viewer-anchored and called per-pair.
For households with 3+ people, this is called in a loop but each pair is still computed
from the viewer's perspective, meaning person C cannot see the A↔B balance.

Add a new exported function:

```ts
// web/lib/balances.ts
export function allPairBalances(
  people: Person[],
  transactions: Transaction[],
  shares: ShareMap   // the shares from the store
): Map<string, Map<string, number>>
// [personA.id][personB.id] = positive → B owes A; negative → A owes B
// Invariant: [a][b] === -[b][a]
```

Implementation: double loop over `people × people`, calling `balanceBetween` for each ordered
pair. The result is a symmetric matrix used by the balance widget (T007).

The existing `balanceSummary` component can be left as-is (it still calls `balanceBetween`
for the two-person case from the viewer's perspective). `allPairBalances` is used by the new
dashboard widget only.

Files to change:
- `web/lib/balances.ts` — add `allPairBalances`
- `test/member-balance.parity.test.ts` — add 3-person test cases

Hypothesis to confirm on stage: with 3 household members where A paid for B and C, and B
paid for A, verify the matrix reflects the correct net balances for all three pairs.

---

**T007 — Dashboard balance widget (`HouseholdBalancesWidget`)**

A new widget on the Overview/Dashboard that shows all outstanding balances and lets the user
settle up directly from the dashboard. Currently `BalanceSummary` only lives on the
Transactions page.

Behaviour:
- Calls `allPairBalances()` (T006) to get the full balance matrix
- Renders each non-zero pair as a row: `{name} owes you $X` / `You owe {name} $X`
- Shows total net position at the top: `You are owed $X net` / `You owe $X net`
- "Settle up →" per row — prefills a transfer transaction (same as existing BalanceSummary
  "Settle up" button; the B9 exact-cents fix stays intact)
- Empty state: `"All settled"` when all balances are zero
- Hidden when `isSolo` (T001 guard)
- Hidden when no outstanding balances exist

Widget placement: add to `web/components/web/DashboardDesktop.tsx` and the mobile dashboard
page. Follow the existing widget sizing convention.

Files to create:
- `web/components/web/HouseholdBalancesWidget.tsx`

Files to change:
- `web/components/web/DashboardDesktop.tsx` — add widget
- `web/app/(app)/dashboard/page.tsx` (mobile) — add widget

Hypothesis to confirm on stage: the demo household has outstanding balances. Verify the
widget shows them correctly and that "Settle up" prefills the correct amount.

---

### Phase 3 — Research-backed enhancements

These are not in the original ask but are strongly supported by the research in
`docs/research/`. Implement after Phase 1–2 is stable.

**T008 — Settle-up threshold nudge**

Research basis (`docs/research/finance-habits-budgeting-apps.md` §4.4): shared expenses
accumulate until a manual threshold — synthesised as ~$100–300. A nudge surfaces the
outstanding balance before the user has to hunt for it.

When any pairwise balance exceeds a configurable threshold (default: $100), show a nudge
on the balance widget: `"You're owed $145 from Alex — settle up?"` The threshold should be
configurable in Settings → Household.

Files to create/change:
- `web/components/web/HouseholdBalancesWidget.tsx` — add nudge state
- Settings household section — threshold input

---

**T009 — Settlement history**

Show a filtered log of past settle-up (transfer) transactions within the balance widget,
accessible via a "History →" link. Answers "when did we last settle?" and builds trust in
the running balance number.

This is already in the transaction ledger — just needs a filtered view:
`transactions.filter(tx => tx.type === 'transfer' && tx.owner_ids includes both members)`

Files to change:
- `web/components/web/HouseholdBalancesWidget.tsx` — add history panel / drawer

---

**T010 — Balance debt simplification (3+ households)**

For 3-person+ households, multi-hop debts can be collapsed. If Alice owes Bob $30 and Bob
owes Carol $20, the net is: Alice→Carol $20, Alice→Bob $10. This minimises the number of
settle-up transfers the household needs to complete.

Reference: Splitwise's published "Debts Made Simple" algorithm.

Implement as a pure function over the balance matrix from T006:

```ts
// web/lib/balances.ts
export function simplifyDebts(
  matrix: Map<string, Map<string, number>>
): Array<{ from: string; to: string; amountCents: number }>
```

Show a "Simplified" view toggle on the balance widget (only visible when
`activePeople.length >= 3`). The toggle is off by default — do not change the default
balance display.

Files to change:
- `web/lib/balances.ts` — add `simplifyDebts`
- `web/components/web/HouseholdBalancesWidget.tsx` — add simplified view toggle

---

**T011 — Recurring split memory**

For recurring merchants (Netflix, rent, Con Edison), suggest the previous split
configuration when a new transaction from the same merchant is added.

Research basis: ~10–15 recurring charges/month are the minority of transaction count but a
large share of value (`docs/research/finance-habits-budgeting-apps.md` §5). Reducing
friction on the most common shared expenses reduces abandonment.

Implementation: on transaction form open, look up the most recent transaction with the same
`merchant` field. If it had a multi-person split, pre-populate `owner_ids` and `shares` with
those values and show a chip: `"Split like last time (50/50)"` that the user can dismiss.

Files to change:
- `web/lib/store.tsx` or a new `web/lib/splitMemory.ts` — `getLastSplitForMerchant(merchant)`
- `web/components/web/AddTransactionForm.tsx` — apply suggestion on merchant change

---

## 3. Things NOT to change

| What | Why |
|---|---|
| `household_people` / `transaction_shares` schema | Solid, N-person-capable, battle-tested |
| `upsert_transaction` RPC | Atomic write; share-sum enforced at DB level |
| Soft-delete on `household_people` | Balance history preserved for removed members |
| B9 settle-up fix (exact integer cents) | Never run settle-up amounts through display currency conversion |
| `paid_by` + `owner_ids` + `shares` model | This IS the data model — clarify the UX, not the schema |
| No invite flow (two-user shared household) | Deliberate deferral — schema is ready; UI is not |
| Income excluded from `insights.ts` | Budget/spending analytics are out of scope here; only `balances.ts` changes |

---

## 4. Files to read before starting

Read these before writing any code. They contain the invariants you must not break.

```
docs/household-system.md           — full system audit including §11 this plan references
web/lib/balances.ts                — balanceBetween() — the core formula, pay attention to sign
web/lib/splits.ts                  — split computation (even/pct/amount)
test/member-balance.parity.test.ts — golden vectors; your new tests go here
shared/test-vectors/member-balance.json — the vectors themselves
web/components/web/BalanceSummary.tsx  — existing settle-up component; reuse its patterns
web/lib/store.tsx                  — activePeople, currentPersonId, shares loading
web/types/index.ts (or equivalent) — Transaction, Person, Share types
docs/research/finance-habits-budgeting-apps.md §4 — couples-splitting reality
```

---

## 5. Testing strategy

### Unit tests (required for every task)
- All new `lib/balances.ts` functions: add golden vectors to `test/member-balance.parity.test.ts`
- Income balance effects (T005): minimum 4 new vectors (see T005 above)
- `allPairBalances` (T006): 3-person golden case
- `simplifyDebts` (T010): multi-hop collapse case
- `getLastSplitForMerchant` (T011): returns correct previous split

Run: `cd web && npm test`

### TypeScript check
Run: `cd web && npx tsc --noEmit`
This must exit 0 before the task is done.

### Stage hypothesis confirmation (required for T003–T007)
The stage database has a fully seeded demo household. Use it to visually confirm each
hypothesis before marking a task complete:

1. Log into stage via the env-gated auto-login (`NEXT_PUBLIC_APP_ENV=stage`)
2. Navigate to the feature being tested
3. Confirm the display matches the expected math — balances, splits, widget totals
4. For income balance effects (T005): add a test income transaction via the UI; verify
   the balance widget reflects it correctly
5. For the balance widget (T007): verify all seeded household balances appear and settle-up
   prefills the correct amount

### Regression check
After completing all tasks, run the full test suite and confirm:
- All 191 test files still pass (they were all green at spec-030 baseline)
- No new TypeScript errors
- The existing `BalanceSummary` on the Transactions page still works correctly (it should
  be untouched — the new widget is additive)

---

## 6. Open questions (decide before implementing)

1. **Balance visibility in 3+ households**: Should household member Carol see the A↔B balance,
   or only her own pairs? Full visibility aids trust in shared households but may feel invasive.
   Today `balanceBetween` is viewer-scoped — the matrix (T006) will expose all pairs.
   Recommend: show all pairs to all members (Splitwise model) and note it in the UX.

2. **Income split UI language**: "Received by" vs "Who earned it" vs "Who gets credit" — the
   right framing for income split ownership needs a user-test, not a design assumption. Use
   "Received by [person]" as the default and adjust after stage testing.

3. **Settle-up threshold default**: Research synthesis suggests $100–300. Start with $100 as
   the default. Make it configurable in Settings → Household.

4. **Recurring split memory scope**: Match on `merchant` exact string, or fuzzy? Exact is safer
   and simpler — start there.

---

## 7. Implementation order (recommended)

Work in this order to de-risk early and ship incremental value:

| # | Task | Phase | Why this order |
|---|---|---|---|
| T001 | Solo mode guard | 1 | Gate everything else behind this first |
| T002 | Local member onboarding copy | 1 | Zero logic; quick win |
| T003 | Transaction ownership type selector | 1 | UX clarity before logic changes |
| T004 | Split preset buttons | 1 | Completes the split UX |
| T005 | Income balance effects | 2 | Core logic gap; well-bounded |
| T006 | N-person balance matrix | 2 | Required by T007 |
| T007 | Dashboard balance widget | 2 | Highest user-visible impact |
| T008 | Settle-up threshold nudge | 3 | Low risk, high utility |
| T009 | Settlement history | 3 | Low risk, reuses existing data |
| T010 | Debt simplification | 3 | Only useful for 3+ households |
| T011 | Recurring split memory | 3 | Nice-to-have; last |

Phase 1 can be shipped as a PR independently of Phase 2. Phase 3 tasks can each be their
own PR. Phase 2 tasks are interdependent (T006 → T007) and should ship together.

---

## 8. Out of scope

| Not building | Why |
|---|---|
| Multi-user households (invite flow) | Deliberate deferral — schema is ready; land Phase 1–2 first and validate with local members |
| Budget engine per-person splits | `lib/finance/budgets.ts` models a merged wallet; that's a separate, larger project |
| Private transactions between household members | `transactions.scope` was dropped in spec 007; remains a non-goal |
| Household-level vs per-person budget views | Deferred pending validation that 3+ person households actually use the budget features |
| Balance notifications / push | No push notification infrastructure exists yet |

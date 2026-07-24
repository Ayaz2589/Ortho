# Quickstart: Household Feature Redesign

**Feature**: 031-household-redesign  
**Date**: 2026-07-24

---

## Prerequisites

- Node.js installed (`cd web && npm install` if not done)
- Stage environment credentials (env-gated auto-login via `NEXT_PUBLIC_APP_ENV=stage`)
- A household with ≥ 2 members (or use the spec-030 seeded demo household on stage)

---

## Run tests (the gate for every task)

```bash
cd web && npm test
```

All 191+ tests must pass before and after every task. TypeScript must also compile clean:

```bash
cd web && npx tsc --noEmit
```

---

## Validation scenarios by task

### T005 — Income balance effects

**Unit test validation** (before writing code):
1. Add 4 new vectors to `shared/test-vectors/member-balance.json` — income cases
2. Run `cd web && npm test` — the new tests will FAIL (red phase)
3. Edit `web/lib/balances.ts` — add the income branch
4. Run `cd web && npm test` — all tests pass (green phase)

**Stage validation** (after code is green):
1. Log into stage
2. Add an income transaction: $1,000, mark recipient as one household member, split 50/50
3. Navigate to Transactions page → verify `BalanceSummary` shows the other member owes the recipient $500
4. Navigate to Dashboard → verify `HouseholdBalancesWidget` shows the same balance

---

### T006 — N-person balance matrix

**Unit test validation**:
1. Add inline test to `web/test/member-balance.parity.test.ts` — 3-person case for `allPairBalances`
2. Run `npm test` — FAIL
3. Implement `allPairBalances` in `web/lib/balances.ts`
4. Run `npm test` — PASS

**Stage validation**:
1. On stage (which has a 2-person seeded household), add a third local member
2. Add shared expenses between all three pairs
3. Navigate to Dashboard → verify the balance widget shows 3 rows (one per pair)

---

### T007 — Dashboard balance widget

**Component test validation** (`web/test/household-balances-widget.test.tsx`):
- Renders with outstanding balances: shows each pair row
- Solo mode: widget is not rendered
- All settled: widget renders "All settled" or is hidden
- "Settle up" click calls `onSettle` with the correct prefill

**Stage validation**:
1. Log into stage
2. Dashboard → verify `HouseholdBalancesWidget` appears with seeded balances
3. Tap "Settle up" → verify transfer form opens pre-filled with exact integer cents
4. Verify the widget is not visible on a solo account

---

### T003 — Transaction ownership type picker

**Component test validation** (extend `web/test/tx-form-parity.test.tsx` or new file):
- "Just me" selected → `owners` array contains only `currentPersonId`, payer section hidden
- "[Person] paid for everyone" → payer dropdown visible
- Income transaction → labels use income language

**Stage validation**:
1. Add a new expense on stage with 2 household members
2. Verify the ownership mode picker appears (not raw owner chips)
3. Select each mode in turn, verify the form reflects the correct state
4. Save and verify the transaction stored the correct `paid_by` / `owner_ids`

---

### T008 — Settle-up threshold nudge

**Stage validation**:
1. Go to Settings → Household → verify threshold input exists (default $100)
2. With an outstanding balance > $100: verify nudge appears on the balance widget row
3. Change threshold to $500: verify nudge disappears for a $200 balance
4. Settle up: verify nudge disappears

---

### T009 — Settlement history

**Stage validation**:
1. Log 2 settle-up transfers between two members on stage
2. On the balance widget, tap "History →"
3. Verify only settle-up (transfer) transactions between those two members appear
4. Verify the list is in chronological order

---

### T010 — Debt simplification

**Unit test validation** (`web/test/member-balance.parity.test.ts` inline):
- 3-person multi-hop: A owes B $30, B owes C $20 → simplified: A→C $20, A→B $10
- Already-minimal: A owes B $50, B owes C $50 → simplified: A→B $50, A→C $50 (can't simplify further if no net between B and C... actually that would be A→C $50, A→B $50 or A→C $100 if B is netted out — need to verify)

**Stage validation**:
1. With 3+ members on stage and multi-hop debts
2. Toggle "Simplified" on the balance widget
3. Verify fewer rows appear and all obligations are preserved

---

### T011 — Recurring split memory

**Unit test validation** (`web/test/split-memory.test.ts`):
- Known merchant, prior split → returns the split
- Unknown merchant → returns null
- Solo prior transaction → returns null

**Stage validation**:
1. Log "Netflix" twice as a 50/50 split
2. Open new transaction, type "Netflix" in the merchant field
3. Verify split pre-fills with 50/50 and suggestion chip appears
4. Dismiss chip → verify split clears
5. Type a new merchant → verify no suggestion

---

## Regression check (after all tasks complete)

```bash
cd web && npm test          # all tests pass
cd web && npx tsc --noEmit  # zero type errors
```

Then on stage:
- Transactions page: `BalanceSummary` component still renders (not broken by widget addition)
- Settle-up from Transactions page: still pre-fills exact cents (B9 fix intact)
- CSV import flow: unaffected
- Settings → Household: existing member list, rename, remove all still work

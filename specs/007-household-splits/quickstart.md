# Quickstart: Simplified Households & Flexible Splits

Validation scenarios proving the feature end-to-end. References `contracts/` + `data-model.md`;
no implementation code here.

## Prerequisites

- Node ≥ 20.19 for web tests: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`.
- If Vitest complains about the darwin rolldown binary:
  `cd web && npm install --no-save @rolldown/binding-darwin-arm64@1.0.3`.
- iOS: open `iOS/Ortho-iOS.xcodeproj` in Xcode; ensure `transaction-splits.json` and the
  regenerated `transaction-filters.json` are in the test target's *Copy Bundle Resources*.

## 1. Split math is locked (both platforms)

- Regenerate vectors: `cd web && npm run gen:vectors` (writes
  `shared/test-vectors/transaction-splits.json` + refreshed `transaction-filters.json`).
- Web: `cd web && npm test` — `splits` unit + `*.parity` suites green.
- iOS: run `TransactionSplitParityTests` + the updated filter parity test in Xcode — green.
- **Expected**: every vector's per-owner cents sum to the amount; identical results both
  platforms (SC-001, SC-005).

## 2. Flexible split in the transaction form (US1)

Run web (`cd web && npm run dev`) or iOS in the simulator.
1. New expense, amount **$100.00**, pick **two** people → editor shows **Even**: $50.00 each.
2. Switch to **By %**, enter 70 / 30 → shows $70.00 / $30.00; Save enabled.
3. Enter 70 / 25 → Save **disabled**, "Percentages must total 100%".
4. Switch to **By amount**, enter $60 / $40 → Save enabled; $55 / $40 → disabled, "Amounts
   must add up to $100.00".
5. Amount **$100.01**, Even, two owners → $50.01 / $50.00.
6. Remove one owner → editor hides, remaining owner has the full amount; re-add → back to even.
- **Expected**: matches `contracts/split-function.md` cases; saved shares persist as cents.

## 3. Detail + dashboard reflect exact shares (US1/US2)

1. Open the $100 / 70-30 transaction's detail → "Maya — $70.00 (70%)", "Jordan — $30.00 (30%)".
2. Open the dashboard per-person breakdown for the period → Maya $70.00, Jordan $30.00.
3. Sum the per-person amounts → equals the household's total spend for the period exactly.
- **Expected**: zero drift (SC-001/SC-003).

## 4. Simplified people management (US3)

1. Settings → Household: add "Jordan" → appears in the owner picker immediately.
2. Rename Jordan → "Jo"; confirm pickers + past transactions show "Jo".
3. Remove Jo → no longer selectable for new transactions; an existing transaction owned by Jo
   still renders Jo's name and share.
- **Expected**: name-only people, no accounts/invitations (SC-007, FR-004).

## 5. Scope is gone everywhere (SC-004)

- Transactions list: no All/Shared/Personal control; Filters sheet/panel has no Scope section;
  no scope active-filter chip.
- Transaction form: no Personal/Shared toggle.
- Verify on both phone and web.

## 6. Migration integrity (FR-016, post-apply)

After applying the migration to a copy of existing data, run the verification query:
- Every transaction has `household_id NOT NULL` and ≥1 share row.
- For every transaction, `Σ transaction_shares.amount_cents = transactions.amount_cents`.
- Each prior single-participant transaction is owned (full amount) by its creator's person;
  prior multi-participant splits preserved as cents.
- **Expected**: 100% of pre-existing transactions visible and correctly attributed.

## Full gate

`cd web && npx tsc --noEmit && npm test` green (splits unit+parity, split-editor UI, dashboard,
updated filter tests; `lib/` coverage at threshold) + iOS builds and the parity tests pass in
Xcode.

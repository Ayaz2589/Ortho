# Tasks: Payer Capture & Household Balances

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Status**: ✅ complete

## US1 — who paid is recorded however money gets in (P1)

- [x] T001 `CsvDraftRow.paidById`, seeded from the importing person; null for income.
- [x] T002 Payer section in the row popover (`role="menuitemradio"`), hidden for income and
      for one-person households; threaded through the list and the flow.
- [x] T003 `useCsvImport` persists the payer on commit.
- [x] T004 Scan carries the payer forward from the matched merchant history
      (`MerchantHistory.paidBy` → `ParsedCandidate.paidByGuess` → the form).
- [x] T005 CLI `toTransaction` resolves a payer from the import context.
- [x] T006 `simplefin` payload sets `paid_by` to the account's owning person; income stays null.
- [x] T007 `npm run sync:functions` — the byte-locked edge-function copy regenerated.
- [x] T008 Tests per path, incl. income-has-no-payer on both sync and the CSV popover.

## US2 — everyone sees every balance (P1)

- [x] T009 **Restore the golden vector first** — `member-balance.json` and its parity suite
      recovered from `c70acef^` as the regression lock.
- [x] T010 `web/lib/finance/balances.ts` — `balanceBetween`, `allPairBalances` (antisymmetric by
      construction), `outstandingBalances`, `peopleInLedger`, `netPositionFor`.
- [x] T011 All nine historical cases pass against the rebuild.
- [x] T012 Generator block restored; regenerated JSON is **byte-identical** to the pre-deletion file.
- [x] T013 Roster comes from the LEDGER, so a removed member's debt stays settle-able.
- [x] T014 Null-payer rows contribute nothing — historical rows cannot invent debts.
- [x] T015 `HouseholdBalancesBody` widget registered default-off; never red; ignores the time scope.
- [x] T016 Tests: three-person pairs, a pair the viewer is not part of, over-repayment flips,
      all-settled, largest-first ordering, 60-round randomized antisymmetry property.

## US3 — shared income is owed too (P3)

- [x] T017 Income balance rule — the recipient owes co-owners their share.
- [x] T018 Tests: co-owned income creates a debt; solely-owned income creates none; a transfer
      settles it the same way it settles an expense.

## Cross-cutting

- [x] T019 i18n ×5 — "{0} owes {1}", "All settled up.", the widget title/description, the
      solo prompt.
- [x] T020 `shared/test-vectors/README.md` entry restored.
- [x] T021 `tsc --noEmit` clean; full suite green; vectors regenerate with no diff.

## Deferred (documented in spec Assumptions)

- Debt simplification (A→B→C collapsed to A→C) — a separate explainable-UI problem.
- A settle-up action on the widget: the exact-cents transfer prefill plumbing was removed in
  spec 043 and rebuilding it is its own change; the Transfer kind on the New form already
  records a settlement today.

# Quickstart & Validation: Dashboard & Household Refinements

Automated tests are the source of truth (Constitution VI); the manual steps confirm the calm cross-canvas
presentation a headless suite can't screenshot.

## Prerequisites

- `cd web && npm install` (already installed).
- A household with ≥ 2 members and some transactions, including at least one split expense and one transfer,
  to exercise the personal summary.

## Automated validation

```bash
cd web && npx tsc --noEmit   # run UNPIPED — must be clean
cd web && npm test           # full suite green
```

Feature-focused runs while iterating:

```bash
cd web && npx vitest run test/finance/personSummary.test.ts
cd web && npx vitest run test/dashboard/member-summary.test.tsx
cd web && npx vitest run test/widgets/savings-trends.test.tsx
cd web && npx vitest run test/web/tx-form-transfer.test.tsx
cd web && npx vitest run test/i18n
```

Expected: all green. The balances tests (`test/balance-summary.test.tsx`,
`test/web/settle-up-currency.test.tsx`) are deleted; `balanceBetween` cases are removed from the finance
tests while the transfer-exclusion tests stay.

## Manual validation (in-browser)

> No browser in a Linux sandbox — do these on a real device/desktop before merge.

**Story 1 — balances gone, transfers still work:**
1. Open Transactions (desktop and mobile) → confirm the "Balances / who owes whom" card is gone.
2. New transaction → choose **Transfer** → pick a sender and a different recipient + an amount → save →
   confirm a transfer is recorded and does NOT change income/expense totals.
3. Try Transfer with sender = recipient or amount 0 → save is blocked.

**Story 2 — individual member view:**
4. Dashboard → the person selector shows **Everyone** and no personal row; the household net hero shows
   household totals.
5. Pick a member → a personal summary row appears: Income, Expenses (their split share only), Transfers
   (received − sent), Net (= income − expenses + received − sent), for the active period.
6. Change the month/range → the personal row recomputes; the household hero is unchanged.
7. Switch back to **Everyone** → the personal row disappears; the hero is unchanged.
8. Confirm no negative figure is red.

**Story 3 — savings last-month comparison:**
9. Put the dashboard in single-month view → savings-trend widget shows the selected month's savings AND last
   month's as a comparison.
10. Select the earliest month with data → widget shows a calm "no comparison" indication (not a wrong 0%).
11. Switch to a multi-month range → the comparison is gone; the per-month view is unchanged.

## Adding this to the household later (reference)

- Per-person aggregation is pure (`personSummary`) and reused by the member summary; a future per-person
  widget could call the same function.
</content>

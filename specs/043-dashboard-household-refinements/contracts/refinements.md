# Contracts: Dashboard & Household Refinements

No network/API surface. Contracts are the internal pure-function API plus the UI/behavior contracts the
tests assert (Constitution VI).

## Module: `web/lib/finance/personSummary.ts`

| Function | Signature | Contract |
| --- | --- | --- |
| `personSummary` | `(transactions: Transaction[], personId: string, start: Date, end: Date) => PersonSummary` | Pure. Returns the person's income, expense-share, transfers received/sent, and net over `[start, end)`. Reuses `effectiveShares` for income/expense shares and `transferParties`/`isTransfer` for transfers. All integer cents. Non-mutating. |

**Property contracts** (asserted in `test/finance/personSummary.test.ts`):
1. Window is half-open `[start, end)` — a tx exactly at `end` is excluded, at `start` included.
2. `expenses` counts only `effectiveShares(tx)[personId]`, never the full `amount_cents`, for splits.
3. **Share conservation**: summing `personSummary(txs, m, …).expenses` over all members `m` of a single
   expense equals that expense's `amount_cents`.
4. Transfers: `to === personId` adds to `transfersReceived`; `from === personId` adds to `transfersSent`;
   neither → no contribution.
5. `net === income − expenses + transfersReceived − transfersSent`.
6. Empty/no-activity person → all zeros (no throw).

## Component: `web/components/dashboard/MemberSummary.tsx`

Mounted on the dashboard between `NetSummaryHero` and `WidgetBoard`.

**Behavior contract** (asserted in `test/dashboard/member-summary.test.tsx`):
1. **Default Everyone**: on first render the selector shows "Everyone" and NO personal summary row is
   present.
2. **Lists active members**: the selector offers each active (non-removed) household member; removed members
   are not offered.
3. **Select member → personal row**: choosing a member renders a personal summary showing their income,
   expenses, transfers, and net, computed via `personSummary(...)` over the shared scope `interval`.
4. **Split share**: for a split expense, the member's expenses reflect only their share (not the full
   amount).
5. **Net transfers**: the transfers figure equals received − sent for the member.
6. **Net**: displays income − expenses + received − sent.
7. **Scope reactive**: changing the dashboard period recomputes the personal summary (reads
   `useDashboardScopeContext().interval`).
8. **Back to Everyone**: selecting "Everyone" removes the personal row; the household hero is unaffected.
9. **Calm**: negative net renders via sign/position, never red (`--text`, not a red token).

## Component: `web/components/widgets/bodies/SavingsTrendsBody.tsx` (edit)

Asserted in `test/widgets/savings-trends.test.tsx`:
1. **Single-month comparison**: when `isSpecificMonth` is true, the widget shows the selected month's
   savings rate AND the previous month's savings rate labelled as a comparison.
2. **No prior data**: when the previous month has no data / doesn't exist, a calm "no comparison" indication
   shows instead of a misleading value.
3. **Range unchanged**: when `isSpecificMonth` is false, the last-month comparison is NOT shown and the
   existing per-month bars/headline are unchanged.

## Form: `web/components/web/TxForm.tsx` (Transfer option preserved)

Asserted in `test/web/tx-form-transfer.test.tsx`:
1. **Transfer selectable**: in the New form (not editing) the kind toggle offers "Transfer" alongside
   Expense/Income.
2. **Records a transfer**: selecting Transfer, choosing a sender (from) and a distinct recipient (to) and a
   positive amount, and saving, produces a `kind: 'transfer'` transaction with `paid_by = from` and
   `owner_ids = [to]`.
3. **Validity**: a transfer cannot be saved with from === to or a non-positive amount.
4. **No settle-up dependency**: this works with no `initialTransfer` prefill (the prefill is removed).

## Removal contracts

Asserted by deletion + `grep` + the shell/desktop tests:
1. **No balances card**: `BalanceSummary` renders nowhere; `grep` for `BalanceSummary`/`balanceBetween`
   returns no production references.
2. **Transactions views unchanged otherwise**: `TransactionsDesktop`/`transactions/page` still render the
   ledger, filters, and form without the balances card or `openSettle`.
3. **Transfers still excluded from totals**: existing transfer-exclusion tests remain green (a transfer
   counts as neither income nor expense).

## i18n contract: `test/i18n/*`

- Every added key (`Everyone`, `Transfers`, `Net`, personal-view chrome, savings `Last month` / no-comparison
  label) is present in bn/es/ja/zh/ko with matching `{n}` placeholder arity.
- Removed balances keys are dropped from the guard list (and catalogs).
</content>

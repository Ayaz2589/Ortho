# Research & Decisions: Dashboard & Household Refinements

Grounded in a direct read of the current code. No external research needed.

## D1 — Removing the "balances" feature: exact footprint, and transfers survive on their own

- **Decision**: Delete `web/components/transactions/BalanceSummary.tsx` (the "who owes whom" card) and
  `web/lib/balances.ts` (`balanceBetween`). Remove their render sites and the **settle-up prefill** plumbing
  (`TransferPrefill` type, `initialTransfer` prop threading, the `transfer` URL param in
  `lib/formPageIntent.ts`, `openSettle`/`settlePrefill` in `TransactionsDesktop.tsx` and
  `app/(app)/transactions/page.tsx`, and the settle-up title/label branches in `TxFormPageClient.tsx`).
- **Key finding**: the New-transaction form **already offers "Transfer" as a selectable kind**. In
  `TxForm.tsx` the segmented control's options are `directionOptions = editing ? … : ['expense','income',
  'transfer']` (line 315-319) and the label map renders `t('Transfer')` (line 611). The `initialTransfer`
  prefill was only a *shortcut* that pre-filled From/To/amount for settle-up — **not** the only way to make
  a transfer. So the spec's "add a Transfer option" (FR-004) is **already satisfied**; the work is to
  **preserve** it while removing the prefill, and to lock it with a test (nothing new to build for creation).
- **Rationale**: Removing only the broken aggregation + its card, plus the now-orphaned settle-up shortcut,
  is the minimal surgical change. Verified `balanceBetween`/`BalanceSummary` have no production callers other
  than the two render sites (`ScanInterstitial.tsx` only mentions `BalanceSummary` in a comment).
- **Alternatives considered**: Keep `balanceBetween` "just in case" — it's dead once the card is gone and
  the spec says remove the balances computation; delete it. Add a *new* Transfer option — unnecessary, one
  already exists; adding a second entry point would be redundant.

## D2 — Transfer validity (FR-005)

- **Decision**: The Transfer branch already enforces its own submit validity (distinct From/To + positive
  amount) in `TxForm`'s transfer path. Preserve it and pin it with a test (pick Transfer → From ≠ To,
  positive amount → saves a `kind: 'transfer'` transaction with `paid_by = from`, `owner_ids = [to]`).
- **Rationale**: Reuse the existing, tested transfer submit logic rather than re-deriving validity.

## D3 — Per-person aggregation: one pure module, reuse `effectiveShares`

- **Decision**: New pure module `web/lib/finance/personSummary.ts`:
  ```ts
  export interface PersonSummary {
    income: number            // cents attributed to the person (their share of income tx)
    expenses: number          // cents = Σ their share of expense splits (via effectiveShares)
    transfersReceived: number // cents received as transfers
    transfersSent: number     // cents sent as transfers
    net: number               // income − expenses + transfersReceived − transfersSent
  }
  export function personSummary(
    transactions: Transaction[], personId: string, start: Date, end: Date
  ): PersonSummary
  ```
  Expenses reuse `effectiveShares(tx)[personId]` (the golden-locked split math — same as the store's
  `spentBy`). Income sums `effectiveShares(tx)[personId]` over income tx the person owns. Transfers use
  `isTransfer` + `transferParties(tx)` (`{from,to}`): received when `to === personId`, sent when `from ===
  personId`, by full `amount_cents` (transfers have no split).
- **Rationale**: A single pure function keeps the money math unit-/property-testable in isolation
  (Constitution VI) and the component a thin presenter. Reusing `effectiveShares` guarantees SC-003 (each
  member's expense share sums to the transaction total — no double-count, no lost cents) without
  reimplementing split math.
- **Alternatives considered**: Add `incomeBy`/`transfersSentBy`/`transfersReceivedBy` accessors to the store
  (mirrors `spentBy`) — spreads the math across the store and is harder to property-test as a unit; a single
  pure module is cleaner and the component can call it directly with `transactions` + the scope interval.
  (The existing `spentBy` stays for its other callers; `personSummary` computes expenses the same way.)

## D4 — Member selector placement: dashboard page, not a widget

- **Decision**: Add a person selector + personal summary as a new `web/components/dashboard/MemberSummary.tsx`
  mounted on `app/(app)/dashboard/page.tsx` between `NetSummaryHero` and `WidgetBoard`. Default "Everyone" →
  renders nothing; a selected member → renders the personal summary row. Local React state
  (`useState<string | null>`), not persisted. Reads the shared `useDashboardScopeContext().interval` so it
  tracks the same month/range as the hero and widgets.
- **Rationale**: The product decision was explicit — "not a card"; a header-level selector + a summary row
  is the right form factor (matches `NetSummaryHero` living baked into the page, not in the board). Reusing
  the shared scope avoids a second period control. Styling mirrors `NetSummaryHero` (token-only, never red).
- **Alternatives considered**: A grid widget (rejected — user said not a card); a global member-scope
  context affecting every widget (rejected — larger blast radius; the summary row is self-contained and the
  household hero must stay intact per FR-012).

## D5 — Savings-trend single-month comparison

- **Decision**: In `SavingsTrendsBody`, read `isSpecificMonth` + `selectedMonth` + `availableMonths` from
  `useDashboardScopeContext()`. When `isSpecificMonth`, compute the previous calendar month's savings rate
  from the same `transactions` (reuse the existing bucketing + `savingsRate`) and render it as a comparison
  next to the selected month's rate. When the previous month has no data / doesn't exist, show a calm "no
  comparison" affordance (not a 0% that reads as "saved nothing"). In range view, behavior is unchanged.
- **Rationale**: The widget already computes per-month buckets and reuses `savingsRate`; extending it to a
  prior-month bucket is a small, local change. "Previous calendar month" is derived directly from
  `selectedMonth` (`YYYY-MM` minus one month); `availableMonths` tells us whether that month has data.
- **Alternatives considered**: A brand-new comparison widget (overkill); server aggregate fetch (the widget
  is deliberately client-computed like the others).

## Cross-cutting: i18n

- **Add** keys: personal-summary labels (`Everyone`, `Transfers`, `Net`, plus any person-view chrome),
  savings comparison (`Last month`, `No comparison yet` or similar). `Income`/`Expenses`/`Transfer`/`From`/
  `To` already exist — reuse, don't duplicate.
- **Remove** balances-only keys (`Balances`, `Settle up`, `{0} owes you`, `You owe {0}`, `Settled with {0}`)
  from all five catalogs, and drop them from the i18n guard test list.
- A new/updated i18n guard test asserts every added key exists across bn/es/ja/zh/ko with matching
  placeholder arity.
</content>

# Tasks: Dashboard & Household Refinements

**Feature dir**: `specs/043-dashboard-household-refinements/` | **Branch**: `feat/043-dashboard-household-refinements`
**Inputs**: plan.md, spec.md, research.md, data-model.md, contracts/refinements.md, quickstart.md
**Approach**: TDD (Constitution VI) — every behavior gets a failing test before the code that satisfies it.
Money math (`personSummary`) is developed test-first and reuses the golden-locked `effectiveShares`.

**Path conventions**: web app under `web/`; commands run from `web/`.

---

## Phase 1: Setup

- [X] T001 Create test dirs if missing: `web/test/finance/`, `web/test/dashboard/` (source dirs
      `web/lib/finance/`, `web/components/dashboard/` already exist). No new deps.

---

## Phase 2: Foundational (blocking prerequisite for US2)

The pure per-person aggregation underpins the individual-member view. Test-first.

- [X] T002 [P] Write failing unit + property tests in `web/test/finance/personSummary.test.ts` for
      `personSummary(transactions, personId, start, end)`: (a) window is half-open `[start,end)`; (b) expenses
      count only `effectiveShares(tx)[personId]` for split expenses the person owns; (c) share-conservation —
      summing every member's `.expenses` for one split equals the tx `amount_cents`; (d) income sums the
      person's income shares; (e) transfers: `to===person`→received, `from===person`→sent, else 0;
      (f) `net === income − expenses + received − sent`; (g) no-activity person → all zeros, no throw.
- [X] T003 Implement `web/lib/finance/personSummary.ts` (`PersonSummary` interface + `personSummary(...)`),
      reusing `effectiveShares` (from `@/lib/format`) and `isTransfer`/`transferParties` (from
      `@/lib/transaction`). Integer cents; pure; non-mutating. Make T002 pass.

**Checkpoint**: `npx vitest run test/finance/personSummary.test.ts` green.

---

## Phase 3: User Story 1 — Retire balances; keep transfers (Priority: P1) 🎯 MVP

**Goal**: The "who owes whom" balances card + `balanceBetween` are gone everywhere; the settle-up prefill
plumbing is removed; the New form's existing "Transfer" option still records transfers.

**Independent test**: No balances card anywhere; New form → Transfer → from≠to + positive amount → records a
`kind:'transfer'` tx excluded from income/expense totals.

- [X] T004 [US1] Write `web/test/web/tx-form-transfer.test.tsx`: in the New form (not editing) the kind
      toggle offers "Transfer"; selecting Transfer + a sender + a distinct recipient + a positive amount and
      saving calls the save path with `kind:'transfer'`, `paid_by=from`, `owner_ids=[to]`; save is blocked
      when from===to or amount≤0. (No `initialTransfer` prop.) Fails only if the removal breaks the option.
- [X] T005 [US1] Delete `web/components/transactions/BalanceSummary.tsx`, `web/lib/balances.ts`, and the tests
      `web/test/balance-summary.test.tsx` + `web/test/web/settle-up-currency.test.tsx`.
- [X] T006 [US1] Remove the balances render + settle plumbing in `web/components/web/TransactionsDesktop.tsx`
      (drop `BalanceSummary` import + render, `settlePrefill` state, `openSettle`, all `setSettlePrefill`
      calls, and the settle-based title/saveLabel/`initialTransfer` on the form).
- [X] T007 [US1] Remove the balances render + settle plumbing in `web/app/(app)/transactions/page.tsx` (drop
      `BalanceSummary` import + render, `TransferPrefill` import, `openSettle`).
- [X] T008 [US1] Drop the settle-up prefill from the form stack: remove `TransferPrefill` +
      `initialTransfer` threading from `web/components/web/TxForm.tsx` and `web/components/web/TxFormPageClient.tsx`,
      and the settle title/saveLabel branches; keep the `'transfer'` direction option
      (`directionOptions=['expense','income','transfer']`) and the whole transfer form branch intact.
- [X] T009 [US1] Drop the `transfer` param: simplify `TxNewParams` + `parseTxNewParams` in
      `web/lib/formPageIntent.ts`, and remove `initialTransfer={params.transfer}` in
      `web/app/(app)/transactions/new/page.tsx`.
- [X] T010 [US1] Prune balance-only cases from the finance tests: remove `balanceBetween` cases from
      `web/test/finance-properties.test.ts` / `web/test/finance-goldens.test.ts` and any dedicated
      `web/test/member-balance.parity.test.ts`; KEEP `web/test/transfer-exclusion.test.ts` (transfers count as
      neither income nor expense). Make T004 pass and the suite compile.

**Checkpoint**: `grep -rn "BalanceSummary\|balanceBetween\|TransferPrefill\|initialTransfer" web/{app,components,lib}`
returns nothing; `npx vitest run test/web/tx-form-transfer.test.tsx test/transfer-exclusion.test.ts` green.

---

## Phase 4: User Story 2 — Dashboard individual-member view (Priority: P1)

**Goal**: A person selector (default "Everyone") on the dashboard; picking a member shows a personal summary
row (income / split-share expenses / net transfers / net) for the shared scope; the household hero is
untouched.

**Independent test**: Pick a member → personal row with correct figures via `personSummary`; back to
"Everyone" → row gone, hero unchanged.

- [X] T011 [US2] Write `web/test/dashboard/member-summary.test.tsx` (jsdom; mock `useApp` with people +
      transactions and `useDashboardScopeContext` interval): default "Everyone" → no personal row; selecting a
      member → row shows income/expenses(split share)/transfers(received−sent)/net; changing interval
      recomputes; back to "Everyone" → row gone; removed members not offered; negative net not red.
- [X] T012 [US2] Implement `web/components/dashboard/MemberSummary.tsx`: a labelled person `<select>` (default
      "Everyone", lists active members) + a personal summary row computed via `personSummary(transactions,
      personId, interval.start, interval.end)`; token-only styling mirroring `NetSummaryHero`, never red.
      `null` selection renders no row. Make T011 pass.
- [X] T013 [US2] Mount `<MemberSummary />` on `web/app/(app)/dashboard/page.tsx` between `NetSummaryHero` and
      `WidgetBoard` (inside `DashboardScopeProvider`); confirm the hero remains always-shown and unchanged.

**Checkpoint**: `npx vitest run test/dashboard/member-summary.test.tsx` green; dashboard renders hero +
selector + board.

---

## Phase 5: User Story 3 — Savings-trend last-month comparison (Priority: P2)

**Goal**: Single-month savings-trend view also shows last month's savings rate; range view unchanged; calm
"no comparison" when no prior month.

**Independent test**: single-month → shows selected + previous month's rate; earliest month → "no
comparison"; range → comparison absent, existing bars unchanged.

- [X] T014 [US3] Extend `web/test/widgets/savings-trends.test.tsx`: with `isSpecificMonth` true + a prior
      month of data, the widget shows the selected month's rate AND last month's as a comparison; earliest
      month (no prior data) → calm "no comparison" indication; `isSpecificMonth` false → no comparison and the
      existing headline/bars unchanged.
- [X] T015 [US3] Update `web/components/widgets/bodies/SavingsTrendsBody.tsx`: read `isSpecificMonth`,
      `selectedMonth`, `availableMonths` from `useDashboardScopeContext()`; when single-month, bucket the
      previous calendar month from `transactions` and compute its `savingsRate`; render the comparison (or a
      calm no-comparison affordance when the prior month isn't in `availableMonths`). Range view path
      unchanged. Make T014 pass.

**Checkpoint**: `npx vitest run test/widgets/savings-trends.test.tsx` green.

---

## Phase 6: Polish & Cross-Cutting

- [X] T016 [P] Add `web/test/i18n/refinements-i18n.test.ts` (mirror the spec-042 i18n guard): every new key
      (`Everyone`, `Transfers`, `Net`, personal-view chrome, savings `Last month` / no-comparison label) is
      present in bn/es/ja/zh/ko with matching `{n}` placeholder arity. Reused keys
      (`Income`/`Expenses`/`Transfer`/`From`/`To`) are not re-added.
- [X] T017 [US1] Add the new translations to `web/lib/i18n/{bn,es,ja,zh,ko}.ts` and REMOVE the balances-only
      keys (`Balances`, `Settle up`, `{0} owes you`, `You owe {0}`, `Settled with {0}`) from all five; drop
      those removed keys from any i18n guard list. Make T016 pass.
- [X] T018 Run the full gate: `npx tsc --noEmit` (UNPIPED — must be clean) then `npm test` (full suite green).
- [X] T019 [P] Verify no stale refs: `grep -rn "BalanceSummary\|balanceBetween\|TransferPrefill\|initialTransfer\|Settle up\|owes you" web/{app,components,lib,test}` returns only intended hits.
- [ ] T020 [P] Manual cross-canvas confirm per `quickstart.md` (balances gone, Transfer records, member view
      math + never-red, savings comparison) — in a real browser before merge (no browser in sandbox).

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T003, blocks US2)**.
- **US1 (T004–T010)** is independent of the foundational module — it's a removal + preserve-transfer; can run
  in parallel with Phase 2 except they share i18n/test files touched in Polish.
- **US2 (T011–T013)** depends on `personSummary` (Phase 2).
- **US3 (T014–T015)** is independent of US1/US2.
- **Polish (T016–T020)** after the stories; i18n add/remove (T017) depends on US1 removals + US2/US3 new keys.

## Parallel Opportunities

- T002 (personSummary tests) ∥ US1 removal tasks (different files).
- US3 (T014–T015) ∥ US1/US2 (savings widget is separate from balances/member view).
- T016 (i18n test) ∥ T019 (grep verify).

## MVP Scope

**US1 (Phase 3)** — retiring the broken balances feature while preserving transfer creation — is the most
urgent slice and stands alone. US2 (member view) is the headline new capability; US3 (savings comparison) is
an additive polish.

## Task Count

20 tasks — Setup 1, Foundational 2, US1 7, US2 3, US3 2, Polish 5.
</content>

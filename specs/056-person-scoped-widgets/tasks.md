# Tasks: Person-Scoped Dashboard Widgets

**Input**: Design documents from `/specs/056-person-scoped-widgets/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/widget-scope.md](./contracts/widget-scope.md)

**Tests**: REQUIRED. Constitution VI is non-negotiable — a failing test describes the intended
behavior before the code that satisfies it. Every implementation task below is preceded by the test
task that must be red first.

**Organization**: Grouped by the plan's Phase A–F sequencing, which maps onto the spec's user stories
(Phase C+D = US1 and US3, Phase E = US2). Phases A and B are foundational: they add the axis and wire
it up while leaving the board provably unchanged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task serves (US1, US2, US3); omitted for foundational/polish
- All paths are relative to the repository root

---

## ⚠️ The one rule that governs this whole feature

**Do not edit any existing file under `web/test/widgets/`.** Those suites render widget bodies with
no `MoneyScopeProvider` and no knowledge of a money scope. Their continued, *unmodified* passing is
the enforcement mechanism for C-1/C-2 and the direct evidence for FR-005 and SC-002 — that household
scope is unchanged. If a change to a widget body makes one of them fail, **the body is wrong**; do
not adjust the test to match. The only pre-existing test file this feature may touch is
`web/test/dashboard/member-scope.test.tsx`, and only in Phase E, and only for the renamed string.

Run `git status web/test/widgets/` before committing: it must show only the new files listed below.

---

## Phase A: The people axis (Foundational)

**Purpose**: Add `MoneyScopeContext`. Nothing consumes it yet, so at the end of this phase the entire
board is provably unchanged.

**⚠️ BLOCKING**: Phases C and D cannot begin until this is complete.

- [X] T001 Create `web/test/widgets/money-scope-context.test.tsx` (RED) covering the context contract: (a) `useMoneyScope()` returns `HOUSEHOLD_SCOPE` when rendered with **no provider** and does NOT throw — the C-2 default; (b) inside a `MoneyScopeProvider` it returns exactly the scope passed in; (c) `useScopedTransactions(txs)` returns the **same array reference** it was given under household scope (the C-1 identity, asserted with `toBe`, mirroring `test/scope/moneyScope.test.ts`); (d) under person scope it returns that person's stored shares, drops rows they own no share of, and keeps a transfer they are party to at full amount; (e) the returned array is referentially stable across a re-render when neither `transactions` nor `scope` changed.
- [X] T002 Create `web/lib/widgets/MoneyScopeContext.tsx` exporting `MoneyScopeProvider`, `useMoneyScope` and `useScopedTransactions`, making T001 green. Mirror `DashboardScopeContext.tsx`'s structure and comment style. The provider takes `scope` as a **prop** (it does not own the state — the page does, because the picker and hero need it too). Document in the header **why** the missing-provider default is `HOUSEHOLD_SCOPE` rather than a throw: household is the identity projection, and the default is what keeps the existing widget suites a working regression lock (research D3).
- [X] T003 Verify Phase A is inert: run `cd web && npm test` and confirm every pre-existing suite passes with **zero** files under `web/test/widgets/` modified (`git status --short web/test/widgets/` shows only the new `money-scope-context.test.tsx`).

**Checkpoint**: The axis exists and is tested. No widget behavior has moved.

---

## Phase B: Wire the dashboard page (Foundational)

**Purpose**: The page holds a `MoneyScope` and supplies it to the board. Still no body reads it, so
the board is *still* provably unchanged.

**⚠️ BLOCKING**: Phases C and D depend on this.

- [X] T004 Create `web/test/dashboard/dashboard-money-scope.test.tsx` (RED) rendering `DashboardPage` and asserting: (a) it renders with household scope by default; (b) choosing a member from the picker supplies a person scope to the board (assert via a probe component or by observing a scoped widget's output — not by reaching into internals); (c) a selection naming a person **absent from the current roster** resolves back to household rather than emptying the board (FR-004 / C-10); (d) the scope object handed to the provider is **referentially stable** across re-renders when the selection has not changed (the invariant every downstream memo depends on — data-model §1).
- [X] T005 Modify `web/app/(app)/dashboard/page.tsx`: replace `useState<string | null>(personId)` with `useState<MoneyScope>(HOUSEHOLD_SCOPE)` plus `const scope = resolveScope(rawScope, householdMembers.map((m) => m.id))`, mirroring `app/(app)/planning/page.tsx` exactly. Derive `const personId = scope.kind === 'person' ? scope.personId : null` for `MemberScopePicker` and `NetSummaryHero` (both keep their current prop signatures — `NetSummaryHero` is not touched). The picker's `onChange` allocates the person scope **once** (`id ? personScope(id) : HOUSEHOLD_SCOPE`), never during render. Wrap `<WidgetBoard />` in `<MoneyScopeProvider scope={scope}>`. Update the page's doc comment: the "widget board stays household-wide" paragraph is now false and must be rewritten to describe the board following the selection.
- [X] T006 Verify Phase B is still inert: `cd web && npm test`. Every pre-existing widget suite still passes unmodified; nothing on the board has changed because no body reads the context yet.

**Checkpoint**: The selection reaches the board. Nothing consumes it. The board is unchanged.

---

## Phase C: The five projected bodies (User Story 1 — P1)

**Goal**: Picking a person re-scopes every money-reporting widget to that person's share.

**Independent test**: In a two-person household with one $100 expense split evenly, select one
person; these widgets report $50, not $100. Select Household; they report $100.

Each body is a one-line swap: read `transactions` from `useApp()`, then pass it through
`useScopedTransactions`. **Write the test first for each.** T007 creates the shared suite; T008–T012
add one `describe` block each and can be written in parallel with their implementation partner, but
all five share one file so the file itself is not `[P]`.

- [X] T007 [US1] Create `web/test/widgets/person-scoped-widgets.test.tsx` (RED) with the shared harness: a two-person household fixture (Alice/Bob), a shared 50/50 expense, an unevenly split (70/30) expense, an income with shares, a transfer between the two, and a solo expense Bob owns alone. Render each body inside a `MoneyScopeProvider`. Include a **household-scope control block** asserting each body's output under `HOUSEHOLD_SCOPE` matches its output with no provider at all (C-1/C-2 proven inside the new suite too, not only by the untouched ones).
- [X] T008 [US1] Add the `SpendingPaceBody` block to `web/test/widgets/person-scoped-widgets.test.tsx` (FR-006): under person scope the avg/day and the vs-prior-30 delta derive from that person's expense shares. Then modify `web/components/widgets/bodies/SpendingPaceBody.tsx` to consume `useScopedTransactions`.
- [X] T009 [US1] Add the `TopMerchantsBody` block (FR-007): merchants the person never transacted at are absent; remaining totals and **visit counts** reflect only their transactions. Then modify `web/components/widgets/bodies/TopMerchantsBody.tsx`.
- [X] T010 [US1] Add the `SavingsTrendsBody` block (FR-008): the headline rate, the per-month chart data, **and the previous-month comparison** all derive from the person's shares. Assert the comparison explicitly — `monthTotals(transactions, prev)` is a **second, separate** read of `transactions` in this body, and missing it would put a personal headline beside a household comparison, which is precisely the mixed-subject defect this feature exists to fix. Then modify `web/components/widgets/bodies/SavingsTrendsBody.tsx`, updating **both** call sites.
- [X] T011 [US1] Add the `ActivityBody` block (FR-009): only rows the person is party to, at their share amount, newest first. Assert the owner line shows that person (a consequence of projection setting `owner_ids: [personId]` — data-model §2). Assert it still ignores the time window in both scopes (spec 041 O-2 is unchanged; C-4). Then modify `web/components/widgets/bodies/ActivityBody.tsx`.
- [X] T012 [US1] Add the `BudgetsBody` block (FR-010, FR-011): under person scope, `scopeBudgets(budgets, scope)` yields only that person's limits and `budgetStatusForMonth` is fed the **scoped** transactions, so both halves of "spent X of Y" have one owner. Assert explicitly that a person with **no** budgets gets the empty state and **not** the household's limits — the no-fallback rule is the spec-052 error class and the single most important assertion in this phase. Then modify `web/components/widgets/bodies/BudgetsBody.tsx`, replacing the hardcoded `HOUSEHOLD_SCOPE` with the context scope and removing the now-false comment that says the board carries no whose-money control.
- [X] T013 [US1] Add an exclusions block to `web/test/widgets/person-scoped-widgets.test.tsx` (FR-014 / C-2): rendering `FinancialHealthBody` and `GoalsBody` under a **person-scoped** provider produces output identical to rendering them under household scope. These are the two widgets most likely to be scoped by accident, and this test is what makes the exclusion a checked property rather than an intention. Neither source file is modified.
- [X] T014 [US1] Run `cd web && npm test` and `npx tsc --noEmit`. All pre-existing `web/test/widgets/*.test.tsx` still pass **unmodified**; confirm with `git status --short web/test/widgets/`.

**Checkpoint**: US1 delivered. The board follows the picker. This is the MVP.

---

## Phase D: Balances (User Story 3 — P3)

**Goal**: With a person selected, "Who owes whom" shows only the debts they are party to.

**Independent test**: In a three-person household with a debt between each pair, select one person;
only the two rows naming them remain, at unchanged amounts.

Kept separate from Phase C because its semantics differ — it filters rows rather than projecting
amounts — and that distinct risk deserves its own review.

- [X] T015 [P] [US3] Create `web/test/widgets/household-balances.test.tsx` (RED). No suite exists for this widget today, so cover its **existing** household behavior first (every non-zero pair listed; the "Add someone to your household" prompt below two members; "All settled up." when square) so the new suite is a regression lock for what already works, then add the person-scope cases.
- [X] T016 [US3] Add the person-scope cases to `web/test/widgets/household-balances.test.tsx` (FR-012 / C-6): only rows where the selected person is `fromId` or `toId` survive; **surviving amounts are byte-identical to the household-scope amounts**; a person square with everyone gets "All settled up." rather than a blank card. Add an explicit guard case that would fail if the body were fed projected transactions — a household with a genuine outstanding debt must not report "All settled up." under person scope (research D5: projection deletes the payer↔co-owner relationship a debt is derived from, and the failure is a plausible wrong number rather than a crash).
- [X] T017 [US3] Modify `web/components/widgets/bodies/HouseholdBalancesBody.tsx`: call `useMoneyScope()` (**not** `useScopedTransactions`), keep `outstandingBalances(peopleInLedger(transactions), transactions)` over the **full unprojected ledger**, and filter the resulting rows under person scope. Add a comment stating why this body must never consume projected transactions, so a future one-line "consistency" refactor is warned off.

**Checkpoint**: US3 delivered.

---

## Phase E: Rename "Everyone" → "Household" (User Story 2 — P2)

**Goal**: The dashboard picker's default option reads "Household".

**Independent test**: The dashboard picker's default option reads "Household" in all five languages,
while Planning and the transaction form still read "Everyone".

Independent of A–D; sequenced last because it is the only change to a pre-existing assertion, so it
never obscures a behavioral failure while A–D land.

- [X] T018 [P] [US2] Update `web/test/dashboard/member-scope.test.tsx` (the ONE pre-existing test file this feature may edit) to expect "Household" where it currently expects "Everyone", and update its header comment. This is a copy change, not a behavior change — no assertion about *figures* may be altered in this file.
- [X] T019 [US2] Modify `web/components/dashboard/MemberScopePicker.tsx`: `t('Everyone')` → `t('Household')` at both call sites (the collapsed button and the list option). Move the accessible name with the visible copy so they agree (Constitution V). Update the doc comment, which currently narrates the old "Everyone" wording and the hero-only scope. **Add no i18n key** — `"Household"` already exists in all five catalogs (research D7).
- [X] T020 [P] [US2] Add a guard to `web/test/widgets/dashboard-scope-bar.test.tsx` **or** a new small test asserting the rename did not leak (FR-016 / C-8): `PlanScopeBar` still renders "Everyone", and `TxForm`'s "Who is this for?" control still renders "Everyone". Prefer a new file if the existing one is under `web/test/widgets/` and would otherwise be modified — the no-edit rule wins over file economy.
- [X] T021 [US2] Run `cd web && npm test`. Confirm `test/i18n/catalog-reachability.test.ts` is green: `"Everyone"` still has its Planning and TxForm consumers, and `"Household"` gains one.

**Checkpoint**: US2 delivered. All three user stories complete.

---

## Phase F: Polish & documentation

- [X] T022 [P] Update `docs/web.md`: the dashboard section describes the board as household-wide. Record the two scope axes (time + people), the `MoneyScopeContext` module, the no-provider-is-household default and why, and the two excluded widgets with a pointer to their follow-up.
- [X] T023 [P] Update the active-feature block at the top of `CLAUDE.md` to spec 056, following the established house style: what the defect was, what the fix is, what was deliberately left alone (financial-health, goals, housing/equity, the shortcuts), and the load-bearing decisions (separate context; no-provider default as regression lock; balances never projected).
- [X] T024 Full gate: `cd web && npm test && npx tsc --noEmit`. Verify no golden-vector drift (FR-019) and that `git status --short web/test/widgets/` lists only the two new files (`person-scoped-widgets.test.tsx`, `household-balances.test.tsx`, plus `money-scope-context.test.tsx` from Phase A).
- [ ] T025 Manual validation per [quickstart.md](./quickstart.md) §2 — requires a running dev server and a multi-person household. Confirm at minimum: the rename, the board following the picker, both axes composing, and the two excluded widgets not moving.

---

## Dependencies

```text
Phase A (T001–T003)  ──┐
                       ├──> Phase C (T007–T014)  [US1 — MVP]
Phase B (T004–T006)  ──┤
                       └──> Phase D (T015–T017)  [US3]

Phase E (T018–T021)  [US2 — independent of A–D]

Phase F (T022–T025)  [after all of the above]
```

- **A before B**: B's provider needs the module A creates.
- **A+B before C and D**: bodies cannot read a context that is not supplied.
- **C and D are independent of each other** and could be built in parallel by different people; they
  touch disjoint files.
- **E is fully independent** — it is a copy change with no dependency on the axis.

## Parallel opportunities

- **Within Phase C**: T008–T012 touch five disjoint body files, but all five add blocks to the *same*
  new test file, so parallelize the source edits and serialize the test-file writes. Not marked `[P]`
  for that reason.
- **Phase D and Phase E** can run fully in parallel with each other and with Phase C once A+B land.
- **Phase F**: T022 and T023 are different files — genuinely parallel.

## Implementation strategy

**MVP = Phase A + B + C** (T001–T014). That delivers US1, the actual defect fix: the board follows
the picker. It is shippable on its own — US3 refines a default-off widget and US2 is a word.

**Incremental delivery**: each phase ends at a checkpoint where the suite is green and the app is
coherent. Phases A and B are deliberately *inert* — they end with the board provably unchanged, so if
something breaks during C or D, the axis itself is already exonerated.

**The safety property to keep checking**: the untouched `web/test/widgets/` suites. They are the
cheapest possible proof that household scope did not move, and they only work as a proof while they
stay untouched.

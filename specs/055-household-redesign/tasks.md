# Tasks: Household Feature Redesign

**Input**: Design documents from `specs/031-household-redesign/`

**Branch**: `feat/household-redesign`

**TDD**: All logic tasks require a failing test written FIRST. Tests must be red before implementation begins, green after.

**Format**: `[ID] [P?] [Story] Description`
- **[P]**: Parallelizable (different files, no blocking dependency)
- **[Story]**: User story this task serves

**Pre-implementation note**: US1, US2, US4 are already implemented in the codebase (see `plan.md` §Pre-implementation notes). Phase 1 verifies these; no code changes required for them.

---

## Phase 1: Verification (Already-Completed Stories)

**Purpose**: Confirm US1 (solo guard), US2 (local member copy), US4 (split presets) are already in place before proceeding. Run the baseline test suite.

- [X] T001 Verify solo guard: confirm `web/components/web/TxForm.tsx` line ~494 has `const showOwners = form.members.length > 1` and owner/payer UI is conditionally rendered
- [X] T002 Verify local member copy: confirm `web/components/settings/HouseholdDrawer.tsx` add-mode section has "no account needed" copy and `web/app/(app)/settings/household/page.tsx` has matching copy
- [X] T003 Verify split presets: confirm `web/components/web/TxForm.tsx` split section has Even/Percent/Value Seg control for multi-owner transactions
- [X] T004 Run baseline test suite in `web/` — all existing tests must pass before any code changes: `cd web && npm test`

**Checkpoint**: Baseline green. US1, US2, US4 confirmed. Ready for new implementation.

---

## Phase 2: US5 — Income Balance Effects (Priority: P1)

**Goal**: Income transactions with a `paid_by` recipient and multiple `owner_ids` contribute to household balances using the same formula as expenses.

**Independent Test**: Add 4 golden vectors to `shared/test-vectors/member-balance.json`. Run `cd web && npm test` — new cases pass, existing cases unaffected.

### Tests (write first — must be RED before implementation)

- [X] T005 [US5] Add 4 income golden vectors to `shared/test-vectors/member-balance.json`:
  - "income received by viewer split even — other owes viewer" → expected: `+50000` (viewer=A, paid_by=A, owners=[A,B], amount=100000, shares A:50000 B:50000)
  - "income received by other split even — viewer owes other" → expected: `-50000` (viewer=A, paid_by=B, same split)
  - "income solo (just viewer) — no balance effect" → expected: `0` (viewer=A, paid_by=A, owners=[A], amount=100000)
  - "income + prior expense net" → expected: computed net combining one expense and one income

### Implementation

- [X] T006 [US5] Extend `balanceBetween` in `web/lib/balances.ts` with income branch after the existing expense block:
  - Add `else if (t.kind === 'income')` handling `paid_by` as recipient
  - If `paid_by === viewer`: `net += t.shares[other] ?? 0`
  - If `paid_by === other`: `net -= t.shares[viewer] ?? 0`
  - If `paid_by` is null or `owner_ids.length === 1`: skip (no balance effect)
- [X] T007 [US5] Run `cd web && npm test` — all 4 new income vectors must pass, all existing vectors still pass

**Checkpoint**: Income balance logic green. `balanceBetween` now handles expense + transfer + income.

---

## Phase 3: US6 — N-Person Pairwise Balance Matrix (Priority: P2)

**Goal**: A new `allPairBalances` function computes all household pair balances simultaneously, enabling 3+ member balance display.

**Independent Test**: Inline test for `allPairBalances` passes the 3-person golden case in `web/test/member-balance.parity.test.ts`.

### Tests (write first — must be RED)

- [X] T008 [US6] Add `PairBalance` type and `allPairBalances` import to `web/test/member-balance.parity.test.ts`; add a failing 3-person test case:
  - A pays $150 split 3 ways (A:50, B:50, C:50); B pays $90 split 3 ways (A:30, B:30, C:30)
  - Expected pairs: A↔B netCents=+2000 (B owes A $20), A↔C netCents=+2000, B↔C netCents=+2000
  - Verify antisymmetry: `balanceBetween(a,b,txns) === -balanceBetween(b,a,txns)`

### Implementation

- [X] T009 [US6] Add `PairBalance` interface and `allPairBalances` function to `web/lib/balances.ts`:
  - Interface: `{ a: string; b: string; netCents: number }` — `a < b` lexicographically
  - Double-loop over people, call `balanceBetween(lo.id, hi.id, transactions)` for each ordered pair
  - Exclude zero-balance pairs from result
  - Export both `PairBalance` and `allPairBalances`
- [X] T010 [US6] Run `cd web && npm test` — 3-person test and all prior tests pass

**Checkpoint**: `allPairBalances` green. N-person matrix ready for widget consumption.

---

## Phase 4: US7 — Dashboard Balance Widget (Priority: P1)

**Goal**: `HouseholdBalancesWidget` on the dashboard shows all outstanding balances and "Settle up" shortcuts. Hidden in solo mode and when all balances are zero.

**Independent Test**: Component test in `web/test/household-balances-widget.test.tsx` verifies render with balances, solo hide, all-settled state, and settle-up prefill.

### Tests (write first — must be RED)

- [X] T011 [US7] Create `web/test/household-balances-widget.test.tsx` with failing tests:
  - Renders balance rows when outstanding balances exist (mock `useApp` returning 2-member household with non-zero `allPairBalances`)
  - "Settle up" button calls `onSettle` with exact `{ from, to, amountCents }` matching the balance
  - Hidden when `householdMembers.length <= 1` (solo mode)
  - Shows "All settled" text (or renders null) when all balances are zero
  - Does not render the "Simplified" toggle for 2-person households

### Implementation

- [X] T012 [US7] Create `web/components/web/HouseholdBalancesWidget.tsx`:
  - Props: `onSettle: (p: TransferPrefill) => void`
  - Reads `householdMembers`, `transactions`, `formatMoney`, `resolveUser`, `t` from `useApp()`
  - Returns null when `householdMembers.length <= 1`
  - Calls `allPairBalances(people, transactions)` — returns null when result is empty
  - Renders each pair row: `"[Name] owes you $X"` / `"You owe [Name] $X"` (viewer-relative language using `currentPersonId`)
  - Net position summary line at top: `"You are owed $X net"` / `"You owe $X net"`
  - "Settle up →" button per row calls `onSettle` with exact cents (reuse `TransferPrefill` from `TxForm.tsx`)
  - Constitutionally compliant: `var(--chip-bg)`, `var(--accent)`, hairline rules, no hardcoded colors, never red
  - Section label uses `text-text-2` uppercase tracking pattern matching existing `BalanceSummary`
- [X] T013 [US7] Add `HouseholdBalancesWidget` to `web/components/web/DashboardDesktop.tsx`:
  - Import the widget; place it as `ow-s12` full-width between the Insights/Budget block and Spend-by-category
  - Wire `onSettle` to open the transfer form (same pattern as the existing settle-up in `TransactionsDesktop`)
- [X] T014 [US7] Add `HouseholdBalancesWidget` to mobile `web/app/(app)/dashboard/page.tsx`:
  - Place after `PerOwnerBreakdownCard` in the mobile card stack
  - Wire `onSettle` to open the mobile transaction modal in transfer mode
- [X] T015 [US7] Run `cd web && npm test` — widget tests and all prior tests pass

**Checkpoint**: Dashboard balance widget complete. Outstanding balances visible on dashboard for both mobile and desktop.

---

## Phase 5: US3 — Transaction Ownership Type Picker (Priority: P1)

**Goal**: Plain-language 3-mode picker ("Just me" / "We each paid our share" / "[Person] paid for everyone") replaces the raw owners + paid-by display. Income transactions use inverted language.

**Independent Test**: Behavior tests in `web/test/ownership-picker.test.tsx` verify each mode writes the correct `owners` / `paidBy` values and that income labels differ from expense labels.

### Tests (write first — must be RED)

- [X] T016 [US3] Create `web/test/ownership-picker.test.tsx` with failing tests:
  - "Just me" selected: `owners = [currentPersonId]`, payer section hidden, split section hidden
  - "[Person] paid for everyone" selected: payer dropdown appears, `owners` contains all members, `paidBy` = selected person
  - "We each paid our share": `owners` contains all members, no payer shown
  - Income mode: mode labels read "I received this" / "We each received our share" / "[Person] received it for us"
  - Solo household (1 member): picker is not rendered (falls back to existing behaviour)
  - Mode change resets split to even (calls `resetSplitsToEven`)

### Implementation

- [X] T017 [US3] Add `OwnershipModePicker` inline to `web/components/web/TxForm.tsx`:
  - Add `ownershipMode` state: `'solo' | 'each' | 'payer'`, derived from current `owners`/`paidBy` on init
  - Add `setOwnershipMode(mode)` handler that writes to existing `owners` / `setPaidBy` and calls `resetSplitsToEven`
  - "Just me": set `owners = [currentPersonId]`, `paidBy = currentPersonId`
  - "We each paid our share": set `owners = [all active members]`, keep `paidBy` as current user (or first member)
  - "[Person] paid for everyone": set `owners = [all active members]`, show a payer `MemberSelect` below
  - Render picker as `Seg` (matching existing split/direction pickers) only when `showOwners`
  - Replace the existing raw "Owners" chip row with the picker; raw chips hidden unless in "payer" or "each" mode needing customization
- [X] T018 [US3] Update income ownership language in `web/components/web/TxForm.tsx`:
  - When `isIncome`, relabel: "Just me" → t('I received this'), "We each paid" → t('We each received our share'), "[Person] paid" → t('{0} received it for us', payerName)
  - Set `paid_by` correctly for income: in `submit()`, when `isIncome && ownershipMode === 'payer'`, set `paid_by = paidBy`; for "I received this" / "We each", set `paid_by = currentPersonId` (current behaviour already does this)
- [X] T019 [US3] Run `cd web && npm test` — ownership picker tests and all prior tests pass

**Checkpoint**: Transaction ownership picker complete. Plain-language mode selection available on add/edit transaction form.

---

## Phase 6: US8 — Settle-up Threshold Nudge (Priority: P3)

**Goal**: When a pairwise balance exceeds a configurable threshold (default $100), the balance widget shows a nudge chip on that row. Threshold is configurable in Settings → Household.

**Independent Test**: Add threshold to settings page and verify nudge appears/disappears based on threshold comparison.

### Tests (write first — must be RED)

- [X] T020 [P] [US8] Add threshold nudge tests to `web/test/household-balances-widget.test.tsx`:
  - Balance row at $150, threshold $100: nudge text "You're owed $150 from [Name] — settle up?" visible
  - Balance row at $80, threshold $100: no nudge
  - Threshold change from $100 to $200: nudge for $150 balance disappears

### Implementation

- [X] T021 [P] [US8] Add `useSettleThreshold(householdId: string)` hook (inline in `web/components/web/HouseholdBalancesWidget.tsx` or extracted to `web/lib/useSettleThreshold.ts`):
  - Reads/writes `localStorage` key `ortho:settle_threshold:<householdId>`
  - Default: `10000` (cents = $100)
  - Returns `[thresholdCents, setThresholdCents]`
- [X] T022 [US8] Add nudge chip to each balance row in `web/components/web/HouseholdBalancesWidget.tsx`:
  - When `Math.abs(netCents) >= thresholdCents`, render a nudge line below the balance row
  - Nudge text: `t("You're owed {0} from {1} — settle up?", formatMoney(amt), name)` / `t("You owe {1} {0} — settle up?", ...)`
  - Style: `text-[13px] text-text-2`, same chip-bg pattern as "Settle up" button
- [X] T023 [US8] Add threshold input to `web/app/(app)/settings/household/page.tsx`:
  - `SectionCard` below the members list with label "Settle-up reminder"
  - Numeric input for threshold amount (dollars); stores as cents in localStorage via `useSettleThreshold`
  - Copy: "Show a reminder when a balance exceeds this amount" (text-3)
- [X] T024 [US8] Run `cd web && npm test` — threshold nudge tests and all prior tests pass

**Checkpoint**: Settle-up nudge complete. Configurable threshold visible in Settings → Household.

---

## Phase 7: US9 — Settlement History (Priority: P3)

**Goal**: A "History →" link in the balance widget opens a filtered list of past settle-up transfers between any selected pair.

**Independent Test**: History panel shows only transfer transactions between the selected pair.

### Tests (write first — must be RED)

- [X] T025 [US9] Add settlement history tests to `web/test/household-balances-widget.test.tsx`:
  - Tap "History →" on a pair row: history panel opens showing only transfers where `paid_by` and `owner_ids[0]` are the two members
  - Empty history state: "No settlements yet" message
  - History items appear in reverse-chronological order

### Implementation

- [X] T026 [US9] Add `showHistoryFor` state and history panel to `web/components/web/HouseholdBalancesWidget.tsx`:
  - State: `showHistoryFor: { a: string; b: string } | null`
  - "History →" link on each pair row: sets `showHistoryFor` to that pair
  - History panel (conditional render): filter `transactions` for `kind === 'transfer'` where `paid_by` ∈ `{a, b}` and `owner_ids[0]` ∈ `{a, b}` (both members involved)
  - Render list: date + amount + direction for each settlement
  - Empty state: "No settlements yet" with `text-text-3`
  - "Back" link closes panel (`setShowHistoryFor(null)`)
- [X] T027 [US9] Run `cd web && npm test` — settlement history tests and all prior tests pass

**Checkpoint**: Settlement history complete. "History →" reveals past settle-ups per pair.

---

## Phase 8: US10 — Balance Debt Simplification (Priority: P3)

**Goal**: "Simplified" toggle on the balance widget (3+ member households only) shows the minimum set of transfers needed to clear all debts.

**Independent Test**: `simplifyDebts` golden vector test and widget toggle test both pass.

### Tests (write first — must be RED)

- [X] T028 [P] [US10] Add `simplifyDebts` test to `web/test/member-balance.parity.test.ts`:
  - 3-person multi-hop: A owes B $30 (3000 cents), B owes C $20 (2000 cents), C owes A $0
  - Expected simplified: [A→C $20, A→B $10] (net A: −$30, net B: +$10, net C: +$20)
  - All-zero input: returns empty array
- [X] T029 [P] [US10] Add `simplifyDebts` widget toggle test to `web/test/household-balances-widget.test.tsx`:
  - 3-member household: "Simplified" toggle visible
  - 2-member household: "Simplified" toggle not visible
  - Toggle on: rows change to simplified transfers

### Implementation

- [X] T030 [P] [US10] Implement `simplifyDebts` in `web/lib/balances.ts`:
  - Signature: `export function simplifyDebts(pairs: PairBalance[], people: Person[]): Array<{ from: string; to: string; amountCents: number }>`
  - Algorithm: compute net balance per person (sum credits − debits), split into creditor/debtor arrays sorted by ID as tiebreaker, greedily match largest creditor ↔ largest debtor
  - All output `amountCents` are positive directed transfers
  - Returns `[]` when all balances are zero
- [X] T031 [US10] Add `showSimplified` state and toggle to `web/components/web/HouseholdBalancesWidget.tsx`:
  - Only render toggle when `householdMembers.length >= 3`
  - When toggled on, replace pair rows with `simplifyDebts(allPairs, people)` output
  - Toggle off: show full pairwise matrix
  - Toggle label: "Simplified" / chip-bg style
- [X] T032 [US10] Run `cd web && npm test` — simplification tests and all prior tests pass

**Checkpoint**: Debt simplification complete. 3+ member households can see optimised settle-up set.

---

## Phase 9: US11 — Recurring Split Memory (Priority: P3)

**Goal**: When a user types a merchant that has a prior multi-person split on record, the form pre-fills the previous split and shows a dismissable suggestion chip.

**Independent Test**: `getLastSplitForMerchant` unit tests pass; form integration test verifies chip appears and dismisses.

### Tests (write first — must be RED)

- [X] T033 [P] [US11] Create `web/test/split-memory.test.ts` with failing tests:
  - Known merchant "Netflix" with prior 50/50 split: returns `{ ownerIds: [A,B], shares: {A:500,B:500} }`
  - Known merchant with solo prior (owner_ids.length === 1): returns `null`
  - Unknown merchant: returns `null`
  - Returns the MOST RECENT multi-person transaction for that merchant (ordered by `date` desc)
  - Case-sensitive: "Netflix" ≠ "netflix"

### Implementation

- [X] T034 [P] [US11] Create `web/lib/splitMemory.ts`:
  - Export `SplitMemory` interface: `{ ownerIds: string[]; shares: Record<string, number> }`
  - Export `getLastSplitForMerchant(merchant: string, transactions: Transaction[]): SplitMemory | null`
  - Filter: `kind !== 'transfer'`, `merchant === input` (exact), `owner_ids.length >= 2`
  - Sort descending by `date`, return first match's `{ owner_ids, shares }` or null
- [X] T035 [US11] Integrate split memory into `web/components/web/TxForm.tsx`:
  - In `useTxForm`, add `splitSuggestion` state: `SplitMemory | null`
  - On `merchant` field change (`setMerchant`), call `getLastSplitForMerchant(newMerchant, transactions)` and set state
  - When `splitSuggestion` is non-null and current split is "even" (not yet customised), show suggestion chip above the split section: "Split like last time (50/50) ×"
  - Chip applies: calls `setOwners(splitSuggestion.ownerIds)` and sets split method to `value` with stored shares
  - Chip dismiss (×): clears `splitSuggestion` state and does NOT apply the split
  - Do not show chip when editing an existing transaction (only on new transaction form)
- [X] T036 [US11] Run `cd web && npm test` — split memory tests and all prior tests pass

**Checkpoint**: Recurring split memory complete. Repeat merchants suggest the previous split.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: TypeScript purity, regression safety, documentation.

- [X] T037 [P] Run `cd web && npx tsc --noEmit` — zero TypeScript errors across all new and modified files
- [X] T038 [P] Run full regression suite `cd web && npm test` — all tests pass (191+ including new tests)
- [X] T039 Verify `web/components/transactions/BalanceSummary.tsx` is unchanged and still functional — the existing settle-up on the Transactions page must still work correctly (B9 exact-cents fix intact)
- [X] T040 [P] Add i18n keys for any new `t('...')` strings used in `HouseholdBalancesWidget.tsx`, `TxForm.tsx` ownership picker, and settings page to `web/lib/i18n/locales/*.ts` (all 5 language files)
- [X] T041 Update `docs/household-system.md` §11 (Next Steps / Gap Analysis section) to reflect that all gaps identified have been addressed in spec 031

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Verification)**: No deps — start immediately
- **Phase 2 (US5 Income)**: Depends on Phase 1 baseline green
- **Phase 3 (US6 N-Person)**: Depends on Phase 1 baseline green; can run in parallel with Phase 2
- **Phase 4 (US7 Widget)**: Depends on Phase 2 (income logic) AND Phase 3 (allPairBalances)
- **Phase 5 (US3 Picker)**: Depends on Phase 1 baseline green; can run in parallel with 2+3
- **Phase 6 (US8 Nudge)**: Depends on Phase 4 (widget exists)
- **Phase 7 (US9 History)**: Depends on Phase 4 (widget exists)
- **Phase 8 (US10 Simplify)**: Depends on Phase 3 (allPairBalances) AND Phase 4 (widget exists)
- **Phase 9 (US11 Memory)**: Depends only on Phase 1 baseline; can run in parallel with 2–5
- **Phase 10 (Polish)**: Depends on all prior phases complete

### User Story Dependencies

- **US5 (P1)**: No story dependencies
- **US6 (P2)**: No story dependencies (can parallel with US5)
- **US7 (P1)**: Requires US5 + US6 complete
- **US3 (P1)**: No story dependencies (can parallel with US5/US6)
- **US8 (P3)**: Requires US7 complete
- **US9 (P3)**: Requires US7 complete
- **US10 (P3)**: Requires US6 + US7 complete
- **US11 (P3)**: No story dependencies

### Parallel Opportunities

- T005–T007 (income) + T008–T010 (n-person) can run in parallel (different files)
- T016–T019 (ownership picker) can run alongside T005–T010 (different files)
- T033–T036 (split memory) can run alongside any phase except Phase 10
- T028–T030 (simplifyDebts logic) can run alongside Phase 6/7 (different from widget state work)
- T020–T021 (threshold hook) and T025–T026 (history filter) can run in parallel (both in widget but non-conflicting state additions)

---

## Implementation Strategy

### MVP: P1 Stories (Phases 1–5)

Complete in order:
1. Phase 1: Verify already-done items, green baseline
2. Phase 2: Income balance logic (T005–T007)
3. Phase 3: N-person matrix (T008–T010) — needed by the dashboard widget
4. Phase 4: Dashboard balance widget (T011–T015)
5. Phase 5: Ownership picker (T016–T019)

**Stop and validate on stage** — this delivers the highest-impact user-facing changes.

### Incremental: P3 Stories (Phases 6–9)

Add in order after MVP is stable:
6. Phase 6: Nudge + threshold settings (T020–T024)
7. Phase 7: Settlement history (T025–T027)
8. Phase 8: Debt simplification (T028–T032)
9. Phase 9: Split memory (T033–T036)

### Polish (Phase 10)

Always last:
10. TypeScript check, full regression, i18n, docs update (T037–T041)

---

## Notes

- Every logic task (`balances.ts`, `splitMemory.ts`) requires a failing golden vector or unit test FIRST (Constitution VI)
- Every component task requires a failing RTL test FIRST (Constitution VI)
- `npm test` must be green after every phase — never leave red tests uncommitted
- `npx tsc --noEmit` must be clean at Phase 10 — type errors are blocking
- Never use hardcoded colors — `var(--token)` only (Constitution I)
- Loss/debt is never displayed in red — use neutral `var(--text)` or `var(--text-2)` (Constitution II)
- Hit targets ≥ 40px on all new buttons (Constitution V)
- Stage validation via `quickstart.md` scenarios must be run after Phase 4 is complete (widget visible on dashboard with seeded household)

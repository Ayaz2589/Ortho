# Feature Specification: Household Feature Redesign

**Feature Branch**: `feat/household-redesign`

**Created**: 2026-07-24

**Status**: Draft

**Input**: docs/plan/household-feature-redesign.md — household feature redesign covering all 11 tasks (T001–T011) across 3 phases: UX wrappers, balance logic, and research-backed enhancements. Full TDD required.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Solo User Sees a Clean Interface (Priority: P1)

Alice uses Ortho alone. When she opens the app to add a transaction, she is not presented with split fields, "who paid" pickers, or balance summaries — those sections are hidden because there is nobody else in her household. If she later adds a roommate, the split UI reappears automatically.

**Why this priority**: The majority of users may be solo. Showing split UI to a solo user creates confusion and visual clutter that undermines the product's calm-over-dense principle.

**Independent Test**: Create a single-member household account. Add a transaction. Confirm no split selector, no payer picker, and no balance widget appears. Add a second person. Confirm all split UI becomes visible.

**Acceptance Scenarios**:

1. **Given** the household has exactly one active member, **When** the user opens the transaction form, **Then** the split selector and payer picker are not displayed.
2. **Given** the household has exactly one active member, **When** the user views the dashboard, **Then** no balance widget is shown.
3. **Given** the household has two active members, **When** the user opens the transaction form, **Then** the split selector and payer picker are visible.

---

### User Story 2 — Add a Household Member Without Requiring an App Account (Priority: P1)

Bob wants to track shared expenses with his partner Maya, who does not use Ortho. Bob opens Settings → Household, taps "Add person," and types Maya's name. The onboarding copy clearly states: "They don't need an Ortho account." Maya is added as a local member and can immediately be selected as a payer or split recipient.

**Why this priority**: Without this clarity, users assume shared expense tracking requires their partner to sign up. That assumption blocks adoption of the household feature entirely.

**Independent Test**: From Settings → Household with one member, add a second person by name only (no email, no invite). Verify the second person appears in transaction payer/owner fields immediately.

**Acceptance Scenarios**:

1. **Given** Settings → Household is open, **When** the user taps "Add person," **Then** the form does not require an email address or account invitation.
2. **Given** the add-person form is open, **When** the user types a name and saves, **Then** the new person appears in all transaction ownership fields.
3. **Given** the add-person empty state is showing, **Then** copy reads "Add a roommate or family member — they don't need an Ortho account."

---

### User Story 3 — Select How a Transaction Is Shared in Plain Language (Priority: P1)

Carlos adds a $120 dinner expense. Instead of a raw split editor, he sees a plain-language picker:

- **Just me** — only Carlos owes this
- **We each paid our share** — everyone paid their own portion
- **Carlos paid for everyone** — Carlos fronted the bill; others owe him back

Selecting "Carlos paid for everyone" reveals a "Who paid?" field. Selecting "Just me" collapses the split section entirely. The same picker appears for income with inverted language ("I received this" / "We each received our share" / "[Person] received it for us").

**Why this priority**: The existing raw split editor exposes implementation details (paid_by field, share amounts) without explaining what the choices mean. This is the primary UX barrier to split adoption.

**Independent Test**: Open a new expense with two household members. Cycle through all three ownership modes. Verify the correct payer/owner values are saved for each selection. Repeat with an income transaction.

**Acceptance Scenarios**:

1. **Given** two+ members in household, **When** adding an expense, **Then** an ownership mode picker shows "Just me," "We each paid our share," and "[Payer] paid for everyone."
2. **Given** "Just me" is selected, **Then** no split details section is shown.
3. **Given** "[Person] paid for everyone" is selected, **Then** a payer dropdown appears; selecting it saves the correct payer and distributes ownership to all active members.
4. **Given** an income transaction is being added, **Then** ownership mode labels use income-appropriate language.
5. **Given** the picker is in solo mode (one member), **Then** the picker is hidden entirely.

---

### User Story 4 — Split Equally with One Tap (Priority: P2)

Diana adds a $90 grocery bill shared with her partner. She taps **Equal** and both shares are set to $45 automatically, with any rounding remainder going to the first person. She can still switch to **Percentage** (enter 60/40 and amounts compute) or **Exact** (type amounts manually). The most common split — equal — takes one tap instead of manual arithmetic.

**Why this priority**: Research shows ~46% of couples split expenses 50/50. Making the default case the fastest action materially reduces form abandonment.

**Independent Test**: Add a shared expense. Tap "Equal." Verify share amounts sum to the transaction total with correct rounding. Switch to "Percentage," enter 70/30, verify amounts compute. Switch to "Exact," change an amount, verify validation.

**Acceptance Scenarios**:

1. **Given** the split editor is open, **When** the user taps "Equal," **Then** amounts are set so all shares sum to the transaction total and the remainder (if any) goes to the first owner.
2. **Given** "Percentage" is selected, **When** the user enters percentages that sum to 100, **Then** amounts auto-compute.
3. **Given** "Exact" is selected, **Then** the user can type amounts directly.

---

### User Story 5 — Income Counts Toward Who Owes Whom (Priority: P1)

Eve receives a $1,000 freelance payment into the shared account. She logs it as income, marks it as received by her, and splits it 50/50 with her partner Frank. The balance widget immediately shows Frank owes Eve $500 — the same logic that applies to a shared expense, just with inverted directionality.

**Why this priority**: This is described in the plan as "the single most important logic gap." Excluding income from balance calculations means couples who track income transactions see incorrect balances.

**Independent Test**: Add an income transaction with two members, recipient is person A, split 50/50. Verify the balance widget shows person B owes person A half the income amount. Add a "Just me" income (owner_ids contains only the recipient). Verify no balance effect.

**Acceptance Scenarios**:

1. **Given** an income transaction with `paid_by = A` and `owner_ids = [A, B]`, **Then** B owes A for B's share.
2. **Given** an income transaction with `owner_ids = [A]` only (just me), **Then** no balance change occurs.
3. **Given** a prior state where A owed B $200 from expenses, **When** B receives income split with A, **Then** the balance reflects the net of both.

---

### User Story 6 — Three-Person Household Sees All Balances (Priority: P2)

Gina, Hassan, and Iris share an apartment. Hassan owes Gina $150. Iris owes Gina $80. Hassan and Iris are even. The balance widget shows all three pairs — not just the signed-in user's pairs. Each member can see the full picture and decide who owes what.

**Why this priority**: The current viewer-anchored balance only works for two people. Any household with three or more members gets an incomplete picture.

**Independent Test**: Create a three-person household. Log expenses so each pair has a non-zero balance. Verify the balance widget displays three rows (A↔B, A↔C, B↔C) with correct directionality for each.

**Acceptance Scenarios**:

1. **Given** three active members, **Then** the balance widget shows one row per pair (n×(n−1)/2 rows).
2. **Given** A↔B balance is $50 from A's perspective, **Then** from B's perspective it shows −$50.
3. **Given** all balances are zero, **Then** the widget shows "All settled."

---

### User Story 7 — Outstanding Balances Visible on the Dashboard (Priority: P1)

Joe opens the app. Before going to Transactions, the Dashboard already shows a balance summary card: "Kate owes you $145 · You owe Marcus $30 · Net: you are owed $115." Each row has a "Settle up →" shortcut. The card is hidden when all balances are zero or when solo.

**Why this priority**: The balance summary currently exists only on the Transactions page. Users must navigate away from the dashboard to see who owes what. Dashboard visibility is the single highest-impact surface for household balance awareness.

**Independent Test**: With a seeded household that has outstanding balances, load the dashboard. Verify the balance widget appears with correct amounts. Tap "Settle up" on one row. Verify the transfer form pre-fills the correct amount.

**Acceptance Scenarios**:

1. **Given** outstanding balances exist, **When** the dashboard loads, **Then** the balance widget is visible with at least one non-zero row.
2. **Given** the user taps "Settle up" on a row, **Then** a transfer transaction form opens pre-filled with the exact balance amount in cents.
3. **Given** all balances are zero, **Then** the balance widget shows "All settled" (or is hidden).
4. **Given** solo mode, **Then** the balance widget is not rendered.

---

### User Story 8 — Nudge When a Balance Gets Large (Priority: P3)

Laura notices that her balance with her partner has quietly grown to $215. The balance widget shows a nudge: "You're owed $215 from Marco — settle up?" The nudge threshold is configurable in Settings → Household (default: $100). Below the threshold, the balance shows without a nudge.

**Why this priority**: Research shows shared balances accumulate until manually noticed. A threshold nudge surfaces large outstanding balances passively without requiring the user to hunt for them.

**Independent Test**: Set threshold to $100. Add a $110 shared expense. Verify nudge appears on balance widget. Set threshold to $200. Verify nudge disappears. Settle up. Verify nudge disappears.

**Acceptance Scenarios**:

1. **Given** any pairwise balance exceeds the configured threshold, **Then** a nudge message appears on that balance row.
2. **Given** the threshold is changed in Settings → Household, **Then** the nudge responds to the new value immediately.
3. **Given** a balance is below the threshold, **Then** no nudge is shown (balance still displays normally).

---

### User Story 9 — View Settlement History (Priority: P3)

Nadia wants to know when she last settled with Omar. From the balance widget, she taps "History →" to see a filtered list of past settle-up transfers between them, with dates and amounts. This answers "when did we last settle?" without scrolling the full transaction list.

**Why this priority**: Without settlement history, users lose trust in the running balance number. "Did we already account for that payment?" is a common question; a filtered history answers it directly.

**Independent Test**: Log two settle-up transfers between two members. In the balance widget, open "History." Verify only the relevant settle-up transactions appear in chronological order.

**Acceptance Scenarios**:

1. **Given** past settle-up transfers exist between two members, **When** the user opens "History," **Then** only those transfer transactions are listed.
2. **Given** no prior settlements, **Then** the history panel shows an empty state.

---

### User Story 10 — Simplified Debts for Three-Person Households (Priority: P3)

Pedro, Quinn, and Rosa have a web of small balances: Pedro owes Quinn $30, Quinn owes Rosa $20. A "Simplified" toggle on the balance widget collapses these into the minimum number of transfers: Pedro→Rosa $20, Pedro→Quinn $10. The toggle is off by default and only appears in households with 3+ members.

**Why this priority**: Multi-hop debts in three-person households create unnecessary settle-up friction. Debt simplification reduces the number of required transfers, making settlement feel achievable.

**Independent Test**: In a three-person household with multi-hop debts, toggle "Simplified." Verify the number of displayed settle-up transactions decreases and all net obligations are preserved.

**Acceptance Scenarios**:

1. **Given** a household with 3+ members and multi-hop debts, **When** the user toggles "Simplified," **Then** the balance widget shows the minimum set of transfers that clears all debts.
2. **Given** a two-person household, **Then** the "Simplified" toggle is not displayed.
3. **Given** "Simplified" is off, **Then** the full pairwise balance matrix is shown.

---

### User Story 11 — Recurring Merchants Suggest the Previous Split (Priority: P3)

Sam adds a Netflix charge. Because Sam has logged Netflix before as a 50/50 split with her partner, the form pre-fills owner_ids and shares from the last time. A chip reads "Split like last time (50/50)" that Sam can dismiss. For a first-time merchant, no suggestion appears.

**Why this priority**: Recurring bills (subscriptions, utilities, rent) are logged repeatedly with the same split. Remembering the previous configuration removes repetitive data entry for the most predictable shared expenses.

**Independent Test**: Log "Netflix" twice with a 50/50 split. Add a third "Netflix" transaction. Verify the form pre-fills with the previous 50/50 split and shows the suggestion chip. Dismiss the chip. Verify the split field is cleared. Log "Spotify" for the first time — no suggestion appears.

**Acceptance Scenarios**:

1. **Given** a prior transaction with the same merchant and a multi-person split, **When** the user adds a new transaction with that merchant, **Then** the split is pre-filled and a suggestion chip is shown.
2. **Given** the user dismisses the suggestion chip, **Then** the split fields are cleared.
3. **Given** a merchant with no prior history, **Then** no suggestion is shown.
4. **Given** a prior transaction with "Just me" ownership, **Then** no split suggestion is shown (single-owner transactions are not worth suggesting).

---

### Edge Cases

- What happens when all household members are removed except one? Solo mode guard should activate retroactively.
- How does the balance widget behave if a member was soft-deleted after sharing expenses? Soft-deleted members' balances remain visible until settled.
- What if a settle-up transfer is logged with an amount that does not exactly match the outstanding balance? The balance adjusts by the actual settlement amount; it does not zero out unless exact.
- What happens to income balance effects when the recipient is a local (non-Ortho-account) member? Same as for expenses — local members participate in balance math identically.
- What if the recurring split suggestion merchant matches a case-insensitively different string? Matching is exact (case-sensitive) in v1 to avoid false positives.

---

## Requirements *(mandatory)*

### Functional Requirements

**Phase 1 — UX Wrappers**

- **FR-001**: The system MUST hide all split/balance UI when the household has exactly one active member (solo mode guard).
- **FR-002**: The Settings → Household empty state MUST clearly communicate that added members do not need an Ortho account.
- **FR-003**: The transaction form MUST present a plain-language ownership mode picker ("Just me," "We each paid our share," "[Person] paid for everyone") instead of exposing raw split fields directly.
- **FR-004**: The ownership picker MUST appear only when the household has 2+ active members.
- **FR-005**: The ownership picker MUST use income-appropriate language ("received by" / "we each received") for income transactions.
- **FR-006**: The split editor MUST provide one-tap presets: Equal, Percentage, and Exact.
- **FR-007**: "Equal" preset MUST divide the transaction amount evenly, with rounding remainder assigned to the first owner.

**Phase 2 — Balance Logic**

- **FR-008**: Income transactions with a `paid_by` recipient and multiple `owner_ids` MUST contribute to household balances with the same formula as expenses.
- **FR-009**: Income transactions with `owner_ids` containing only the recipient MUST NOT affect household balances.
- **FR-010**: The balance calculation MUST support N-person households by computing all pairwise balances simultaneously.
- **FR-011**: The dashboard MUST display a household balance widget showing all non-zero pairwise balances.
- **FR-012**: Each balance row on the dashboard MUST include a "Settle up" action that pre-fills a transfer transaction with the exact outstanding amount.
- **FR-013**: The balance widget MUST be hidden in solo mode and MUST show "All settled" when all balances are zero.

**Phase 3 — Research-Backed Enhancements**

- **FR-014**: When any pairwise balance exceeds a configurable threshold (default $100), the balance widget MUST display a nudge on that row.
- **FR-015**: The settle-up threshold MUST be configurable per household in Settings → Household.
- **FR-016**: The balance widget MUST provide a "History →" link that shows past settle-up transfers between any selected pair.
- **FR-017**: For households with 3+ members, the balance widget MUST offer a "Simplified" toggle that displays the minimum set of transfers required to clear all debts.
- **FR-018**: When a user begins adding a transaction for a merchant that has a prior multi-person split on record, the form MUST pre-fill the previous split configuration and display a dismissable suggestion chip.

### Key Entities

- **Household Person**: A named member of the household; may or may not have a linked Ortho account. Soft-deleted when removed; historical balances remain intact.
- **Transaction Ownership**: The combination of `paid_by` (who fronted the money), `owner_ids` (who owes for it), and `shares` (how much each owner owes). Applies to both expenses and income.
- **Pairwise Balance**: The net amount owed between any two household members, derived from all shared transactions. Positive means the reference person is owed; negative means they owe.
- **Settlement Transfer**: A transaction of type "transfer" that records a direct payment between two members to reduce their pairwise balance.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A solo user completing the transaction flow encounters zero split-related fields — measured by zero visible split/ownership UI elements when `activePeople.length === 1`.
- **SC-002**: A user can add a household member without entering an email address or completing an invite flow — verified by completing the add-member flow with name only.
- **SC-003**: A user can apply an equal split to a shared expense in one tap — measured by tap count to reach equal-split state from default transaction form.
- **SC-004**: Income transactions are included in balance calculations — verified by golden-vector tests covering at least 4 income-split scenarios.
- **SC-005**: Three-person households see all pairwise balances on the dashboard — verified by a 3-person seeded household showing 3 balance rows.
- **SC-006**: The balance widget is visible on the dashboard without navigating to Transactions — verified visually with stage-seeded household data.
- **SC-007**: "Settle up" pre-fills the exact outstanding balance in integer cents — verified by the existing B9 fix test coverage and visual stage check.
- **SC-008**: All 191 existing tests pass after implementation — zero regressions in the full test suite.
- **SC-009**: TypeScript compilation exits clean (`tsc --noEmit` returns 0).
- **SC-010**: All new `lib/` business logic is covered by deterministic golden-vector tests before the feature is marked complete.

---

## Assumptions

- The data model (`household_people`, `transaction_shares`, `upsert_transaction` RPC, `paid_by` / `owner_ids` / `shares`) is complete and correct — this feature adds no schema changes.
- The stage environment is seeded with a realistic demo household (spec 030) and is available for visual confirmation of each phase.
- Balance visibility in 3+ households is shared (all members see all pairs) — the Splitwise model. This is assumed based on plan guidance and will be confirmed during stage testing.
- Merchant matching for recurring split memory uses exact string comparison in v1; fuzzy matching is deferred.
- The settle-up threshold default is $100; this is configurable but not per-member.
- Income excluded from `lib/finance/insights.ts` (budget/spending analytics) remains out of scope — only `lib/balances.ts` is changed.
- Phase 3 tasks (T008–T011) are implemented in this same PR but are lower priority and will be confirmed against stage after Phase 1–2 is stable.

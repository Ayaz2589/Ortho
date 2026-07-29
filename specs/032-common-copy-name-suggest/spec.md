# Feature Specification: Most-common copy + merchant name suggestions

**Feature Branch**: `feat/032-common-copy-name-suggest`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "When adding a new transaction we have the ability to copy a recent transaction — change it to copy the most COMMON transactions instead. Also, the mobile upload flow gives merchant name suggestions; add that same name-suggestion affordance to the desktop add AND edit transaction form, for both expense and income."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copy from the household's most common transactions (Priority: P1)

A member opening the New-transaction form wants to quickly re-log a purchase they make
often (their weekly grocery run, their usual coffee shop, a recurring subscription).
Today the form offers a shortcut that lists their transactions **newest-first**, which
buries a frequent-but-not-recent purchase under one-off entries. Instead, the shortcut
should surface the merchants they log **most often**, most-frequent first, so the common
cases are one tap away. Picking one prefills the form with a real prior entry for that
merchant (amount, category, source, splits) that they can adjust and save.

**Why this priority**: This is the primary behavior change the user asked for and it
directly improves the most-repeated task in the app (logging a recurring expense). It
replaces an existing affordance, so it must ship as a coherent whole.

**Independent Test**: With a ledger where "Whole Foods" appears 5 times and "Airport
Parking" appears once (but most recently), open the New form, open the copy shortcut, and
confirm "Whole Foods" is listed above "Airport Parking". Pick it and confirm the form is
prefilled with a real Whole Foods entry. Delivers value on its own without Story 2.

**Acceptance Scenarios**:

1. **Given** a ledger with several merchants of differing frequency, **When** the member opens the copy shortcut on the New form, **Then** merchants are listed ordered by how often they appear (most-frequent first), not by date.
2. **Given** the same merchant logged multiple times with different amounts, **When** it is shown in the copy list, **Then** it appears **once**, represented by that merchant's **most recent** entry.
3. **Given** the member picks a row from the copy list, **When** the pick completes, **Then** the form is prefilled with that entry's merchant, amount, category, source, owners/splits, tags and notes — and the date defaults to **today** (not the copied entry's date).
4. **Given** an empty ledger (no transactions yet), **When** the member opens the New form, **Then** the copy shortcut communicates there is nothing to copy yet (and never errors).
5. **Given** the copy shortcut is labeled, **When** the member views it, **Then** it reads "Copy from most common" (button, sub-view title, and empty state) rather than "Copy from recent".

---

### User Story 2 - Merchant name suggestions while typing (Priority: P2)

A member typing a merchant/payer name into the add or edit transaction form wants the app
to suggest names they already use, so they can pick a canonical spelling instead of
re-typing (and so their ledger stays consistent — one "Uber Eats", not three variants).
The bank-statement import review already offers this; the manual form should too, on both
desktop and mobile, for both **expense** (merchant) and **income** (payer) entries, while
still allowing any free-form name.

**Why this priority**: Additive convenience that reduces typing and merchant-name drift.
Valuable but secondary to Story 1, and independently shippable.

**Independent Test**: In the Add form with kind=expense and an existing "Whole Foods"
merchant in the ledger, type "whole" into the merchant field and confirm "Whole Foods" is
offered as a suggestion; pick it and confirm the field takes the suggested value. Switch to
income and confirm suggestions are drawn from income payers, not expense merchants.

**Acceptance Scenarios**:

1. **Given** the ledger contains prior expense merchants, **When** the member focuses/types in the merchant field on the **Add** form (kind=expense), **Then** matching known merchant names are offered as suggestions.
2. **Given** the member is on the **Edit** form for an existing transaction, **When** they type in the merchant field, **Then** the same suggestions are offered.
3. **Given** the form kind is **income**, **When** the member types in the name field, **Then** suggestions are drawn from prior **income** payers, and **not** from expense merchants (and vice-versa).
4. **Given** a suggestion is offered, **When** the member ignores it and types a brand-new name, **Then** the free-form name is accepted and saved unchanged.
5. **Given** the member's typed text already exactly matches a known name, **When** suggestions are computed, **Then** no redundant suggestion is shown for that exact name.

---

### Edge Cases

- **Empty / near-empty ledger**: copy list shows the "nothing to copy yet" state; name field offers no suggestions. Neither errors.
- **Blank or whitespace-only merchant names** in history: excluded from both the most-common ranking and the suggestion list.
- **Case / spacing variants** of the same merchant ("whole foods" vs "Whole Foods"): treated as the same merchant for ranking and de-duplication (canonical display name from a real prior entry).
- **Transfer / reimbursement entries**: have no merchant; they must not appear in the most-common copy list nor pollute name suggestions, and the copy/suggestion changes must not alter the transfer/reimbursement branch of the form.
- **Ties in frequency**: two merchants with equal counts have a stable, deterministic order (most-recent activity breaks the tie).
- **Very large ledger**: the most-common list is capped to a reasonable number of entries so the picker stays scannable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The New-transaction copy shortcut MUST rank candidate entries by **merchant frequency** across the household's ledger (most-frequently-logged merchant first), replacing the previous newest-first ordering.
- **FR-002**: Each distinct merchant MUST appear **at most once** in the copy list, represented by that merchant's **most recent** transaction (so the prefill carries real amount/category/source/splits).
- **FR-003**: Selecting a copy-list row MUST prefill the form exactly as the current copy behavior does (all contextual fields), with the date defaulting to **today**; the underlying prefill/load behavior MUST NOT change.
- **FR-004**: The copy affordance's user-facing text (button, sub-view title, empty state) MUST read "Copy from most common" (and its localized equivalents) instead of "Copy from recent".
- **FR-005**: The copy behavior change MUST apply identically to both the mobile form surface and the desktop form surface (the shared form body stays in sync).
- **FR-006**: Entries with no merchant (transfers, reimbursements) MUST be excluded from the most-common ranking.
- **FR-007**: The add/edit transaction form's name field MUST offer as-you-type suggestions of the household's known names when the member types.
- **FR-008**: Name suggestions MUST be available on both the **Add** and **Edit** forms, and for both **expense** and **income** kinds.
- **FR-009**: Name suggestions MUST be **kind-aware**: expense entries suggest from prior expense merchants; income entries suggest from prior income payers.
- **FR-010**: Suggestions MUST be a convenience only — the member MUST always be able to type and save a free-form name that is not among the suggestions.
- **FR-011**: When the typed text already exactly matches a known name, no redundant suggestion for that exact name is shown.
- **FR-012**: The feature MUST NOT modify money/split computation, the golden money vectors, or the transfer/reimbursement branch of the form.
- **FR-013**: The feature MUST reuse the household's existing ledger data already available to the form; it MUST NOT require any database or schema change.

### Key Entities *(include if feature involves data)*

- **Transaction (existing)**: a logged expense/income/transfer with merchant/payer name, amount, category, source, owners/splits, tags, notes, date, and kind. The source of both the most-common ranking and the name suggestions.
- **Known merchant name (derived)**: a distinct, canonical display name derived from the household's transactions, ranked by how often it appears — the vocabulary for both features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a member opens the copy shortcut, the merchant they log most often appears in the top three entries in 100% of cases where that merchant has the highest frequency in the ledger.
- **SC-002**: Re-logging a frequently-repeated purchase takes no more than two interactions from the New form (open the shortcut, pick the merchant) — down from scrolling a date-ordered list.
- **SC-003**: For a member with prior history, typing the first few characters of a known name surfaces that name as a suggestion in the add/edit form 100% of the time (expense and income).
- **SC-004**: No regression in money/splits correctness — the existing money golden-vector and split test suites continue to pass unchanged.
- **SC-005**: The change ships behind no schema/DB migration and works identically on desktop and mobile surfaces.

## Assumptions

- **"Most common" means most-frequent merchant.** Ranking is by how often a merchant appears in the household ledger, de-duplicated to one representative (most-recent) entry per merchant. (Alternative readings — e.g. most-frequent exact amount+merchant pair — were considered and rejected as less intuitive.)
- **Reuse of existing ranking/suggestion logic.** The frequency ranking and similar-name suggestion behavior already exist and are tested for the bank-statement import review; this feature reuses that logic rather than inventing new matching rules.
- **Kind-aware vocabulary.** Expense and income names are kept in separate suggestion pools because a payroll payer is not a shopping merchant.
- **Client-side only.** All ranking and suggestion happens from ledger data already loaded into the form context; no new API, storage, or schema.
- **Scope boundaries.** The CSV/bank-import review flow, the native iOS app, and the transfer/reimbursement form branch are out of scope and unchanged.
- **Cap.** The most-common list is capped (mirroring the existing picker's ~40-row cap) so the picker stays scannable on large ledgers.

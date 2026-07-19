# Feature Specification: Transaction Tags & Richer Notes

**Feature Branch**: `feat/transaction-tags` (spec dir `027-transaction-tags`)

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Free-form transaction tags (orthogonal to category) plus richer per-transaction notes. Users can attach zero or more free-form tags to any transaction and a free-form notes text, then filter and search the Transactions list by tag so they can report/slice spending along dimensions that categories don't capture (e.g. work, vacation, reimbursable)."

## Overview

Ortho already classifies every transaction with exactly one **category** (coffee, groceries,
dining…). Categories are a fixed, closed taxonomy — great for consistent budgets and charts, but
they can only answer one question per transaction. Real spending cuts across several dimensions at
once: a dinner can be *dining* **and** "work trip" **and** "reimbursable". This feature adds
**free-form tags** — an open, household-owned set of labels a member can attach to any
transaction, orthogonal to category — plus a **richer notes** field for the sentence of context a
merchant name can't carry. Tags then plug into the existing Transactions filter/search stack so a
member can slice the ledger by any label ("show me everything tagged *vacation*").

The feature is deliberately **small, additive, and calm**: it reuses the household roster pattern
already used for people/splits, adds no new colors or chrome, and does not redesign the dashboard
or introduce tag-based reporting widgets. Filtering by tag *is* the reporting surface for v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tag a transaction and filter by it (Priority: P1)

A member opens a transaction, types one or more short labels (picking existing household tags or
creating a new one on the fly), and saves. Later, from the Transactions list, they select that tag
in the filters and see only the transactions carrying it.

**Why this priority**: This is the whole feature — attach a label, then retrieve by it. Everything
else is refinement. Delivered alone it is a complete, demonstrable slice of value.

**Independent Test**: Create two transactions, tag one "vacation", filter the list by "vacation",
and confirm only the tagged transaction shows; clear the filter and confirm both return.

**Acceptance Scenarios**:

1. **Given** a transaction with no tags, **When** the member adds the tags "work" and "reimbursable" and saves, **Then** the transaction shows both tags as chips and both are persisted.
2. **Given** transactions tagged and untagged with "vacation", **When** the member activates the "vacation" tag filter, **Then** only transactions carrying "vacation" appear and the active-filter count reflects the tag dimension.
3. **Given** two tag filters "work" and "vacation" are active, **When** the list is shown, **Then** a transaction appears if it carries **either** tag (OR within the tag dimension), consistent with how multi-select category/source/owner filters already behave.
4. **Given** an active "vacation" tag filter, **When** the member removes the tag's active-filter chip, **Then** the filter clears and the full (or otherwise-filtered) list returns.

---

### User Story 2 - Create, reuse, and de-duplicate household tags (Priority: P2)

Tags belong to the household, not to a single transaction. Once "vacation" exists, every member can
reuse it, and typing an existing name (in any letter case) reuses the same tag rather than creating
a near-duplicate.

**Why this priority**: Without reuse and de-duplication, the tag set fragments into "Vacation",
"vacation", "vacation " and filtering becomes useless. It is essential for the feature to stay
usable over time, but the P1 slice is demonstrable before it lands.

**Independent Test**: Tag one transaction "Vacation", then on a second transaction type "vacation";
confirm the same single tag is attached (not a second one), and the filter list shows one
"vacation" entry.

**Acceptance Scenarios**:

1. **Given** the household already has a tag "vacation", **When** a member types "Vacation" on another transaction, **Then** the existing tag is reused (case-insensitive match) and no duplicate is created.
2. **Given** a member types a brand-new label, **When** they save, **Then** a new household tag is created and becomes available to every member and to the filter list.
3. **Given** surrounding/trailing whitespace or a mixed-case entry, **When** the tag is saved, **Then** it is stored trimmed and its display name is stable across transactions.
4. **Given** several tags exist, **When** the tag filter list is shown, **Then** tags appear alphabetized and only tags actually present on visible transactions are offered as filter chips.

---

### User Story 3 - Add richer notes to a transaction and search them (Priority: P3)

A member records a free-form note on a transaction ("split the check with Sam, he owes half") and
can later find the transaction by typing part of the note into the Transactions search box.

**Why this priority**: Notes are useful context but secondary to the tag/report loop; they add no
new data relationships and can ship after the tag stack is in place.

**Independent Test**: Add a note to a transaction, type a distinctive word from the note into the
search box, and confirm the transaction is found; clear the search and confirm normal results.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the member types a note and saves, **Then** the note is persisted and shown on the transaction's detail view.
2. **Given** a transaction whose note contains "reimburse", **When** the member searches "reimburse", **Then** that transaction is included in the results even if no other field matches.
3. **Given** the free-text search box, **When** the member searches a word that is a tag name, **Then** transactions carrying that tag are included in the results (tag names are searchable alongside merchant, source, category, owner name, and notes).
4. **Given** a note is cleared to empty, **When** the transaction is saved, **Then** the note is removed (stored as empty/absent) rather than retained.

---

### Edge Cases

- **Empty tag input**: typing only whitespace, or submitting an empty tag chip, adds no tag.
- **Duplicate on the same transaction**: attaching a tag already on the transaction is a no-op (the join is a set, not a bag).
- **Very long label**: tag names have a bounded length (see FR-013); an over-long entry is rejected or truncated with a calm message, never silently corrupting data.
- **Removing a tag from a transaction**: leaves the household tag intact for other transactions; the tag simply detaches.
- **Deleting a transaction**: its tag attachments are removed, but the household tags themselves survive.
- **A tag no longer used by any transaction**: it may remain in the household roster (orphan tags are harmless); it simply stops appearing as a filter chip because the filter list is derived from tags present on transactions.
- **Filtering interaction**: a tag filter combines with every other active dimension by AND (a transaction must pass category AND kind AND owner AND … AND tag), matching existing filter semantics.
- **CLI / import path**: transactions created outside the app (bank import, CLI) simply have no tags/notes; nothing breaks, and the filter treats them as untagged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A member MUST be able to attach zero or more tags to any transaction (expense, income, or transfer) when creating or editing it.
- **FR-002**: Tags MUST be orthogonal to category — a transaction keeps exactly one category and may carry any number of tags independently.
- **FR-003**: Tags MUST be household-scoped: a tag created on one transaction is available to every member of the household and reusable on any transaction.
- **FR-004**: Typing a tag name that already exists in the household (compared case-insensitively, after trimming surrounding whitespace) MUST reuse the existing tag rather than create a duplicate.
- **FR-005**: Typing a tag name that does not yet exist MUST create a new household tag on save and make it immediately available for reuse and filtering.
- **FR-006**: A member MUST be able to remove a tag from a transaction without affecting the tag on other transactions or the household roster.
- **FR-007**: Tags MUST be displayed as calm chips (no new colors, consistent with existing chip styling) on the transaction form and detail view.
- **FR-008**: A member MUST be able to filter the Transactions list by one or more tags, where multiple selected tags match by OR within the tag dimension and AND across other filter dimensions — identical to existing multi-select filters (category/source/owner).
- **FR-009**: The active-filter summary (chip list and "N filters active" count) MUST include the tag dimension, and removing a tag's active-filter chip MUST clear that part of the filter.
- **FR-010**: The tag filter options MUST be derived from tags actually present on the household's transactions, alphabetized, and MUST NOT offer tags no transaction carries.
- **FR-011**: A member MUST be able to record a free-form notes text on any transaction and later clear it; an empty note MUST be stored as absent/empty, not as a blank retained value.
- **FR-012**: Free-text search over the Transactions list MUST match a transaction when the query appears in its notes or in any of its tag names, in addition to the existing merchant/source/category/owner-name matches.
- **FR-013**: Tag names MUST be bounded to a reasonable length (assumption: 1–50 characters after trimming); an empty-after-trim name MUST NOT be created.
- **FR-014**: All new persistence MUST be scoped by the household's existing access rules so a member only ever sees, creates, or filters by their own household's tags and notes.
- **FR-015**: The feature MUST be additive: existing transactions, budgets, splits, insights, imports, and the money/date engines are unchanged; a transaction with no tags/notes behaves exactly as today.
- **FR-016**: The pure transaction-filter logic (the function that decides whether a transaction passes a set of criteria) MUST remain deterministic and covered by the project's regression-vector fixtures, extended to include the tag dimension and the notes/tag-name search matches.

### Key Entities *(include if feature involves data)*

- **Tag**: a household-owned free-form label. Attributes: a stable identity, the owning household, a display name (unique within the household, case-insensitively), and creation time. Relationship: belongs to one household; may be attached to many transactions.
- **Transaction–Tag attachment**: the many-to-many link between a transaction and a tag (a set — each pair at most once). Deleting either side removes the link; deleting a transaction removes only its links, not the tags.
- **Transaction (extended)**: gains an optional free-form **notes** text and, derived from its attachments, the set of tags it carries. All existing attributes (merchant, category, kind, amount, source, date, paid_by, owner/share data) are unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can add a tag to a transaction and retrieve that transaction via the tag filter in under 30 seconds, without leaving the Transactions surface.
- **SC-002**: Filtering by a tag returns exactly the transactions carrying that tag — 100% precision and recall against the underlying data — with no false positives from other dimensions.
- **SC-003**: Reusing an existing tag name (any letter case, any surrounding whitespace) never creates a duplicate: the household tag count grows only when a genuinely new label is introduced.
- **SC-004**: A transaction found by searching its notes or a tag name appears in results, and 100% of existing (untagged, note-less) transactions continue to behave and display exactly as before the feature.
- **SC-005**: The full automated test suite (including the extended filter regression vectors) passes and the pure filter logic keeps its coverage bar, demonstrating no regression to money/date/filter behavior.

## Assumptions

- **Tag identity is its trimmed, case-insensitive name within a household.** There is no separate "rename tag" or "merge tags" management screen in v1; reuse-by-name and de-duplication cover the common case. Orphan tags (attached to nothing) are harmless and left in place.
- **Tag name length is 1–50 characters after trimming.** No reasonable label exceeds this; the bound protects the UI and storage.
- **No tag colors, icons, or per-tag budgets in v1.** Tags are plain text chips using existing tokens; adding tag-colored theming or tag budgets is explicitly out of scope.
- **No dashboard "spend by tag" widget in v1.** Reporting by tag is delivered through the existing filter/search surface; a dedicated dashboard breakdown is a possible future follow-up.
- **Notes are plain text, not attachments.** The backlog item mentions "attachments"; file/photo attachments are deferred — v1 delivers only the text notes field.
- **Tags/notes are edited only through the app's transaction create/edit flow.** The bank-import CLI does not set tags or notes; imported transactions are simply untagged and note-less, and the filter treats them accordingly.
- **Existing household access rules are reused** for the new data; no new roles or permissions are introduced.
- **The existing responsive/mobile + desktop transaction forms and filter panels are the integration points**; the feature adds fields/chips to them rather than introducing new surfaces.

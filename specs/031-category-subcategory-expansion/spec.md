# Feature Specification: Category & Subcategory Expansion

**Feature Branch**: `feat/031-category-subcategory-expansion`

**Created**: 2026-07-24

**Status**: Draft

**Input**: Expand the transaction category system from a flat 11-category list to a two-level category/subcategory hierarchy, and add richer income categorization.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Categorise an expense with a specific subcategory (Priority: P1)

A user adds a new expense and, instead of picking from a flat 11-item list, can navigate a grouped two-level picker. They first select a parent group (e.g. "Food & Drink") and then pick the subcategory that best describes the purchase (e.g. "Takeout" rather than just "Dining"). The selected subcategory is stored on the transaction and appears everywhere the category is shown (transaction list, detail view, charts).

**Why this priority**: This is the core value delivery — finer-grained expense categorisation enables more accurate budgets, insights, and reports. Every other story builds on having the taxonomy in place.

**Independent Test**: Create a new expense, verify the two-level picker is present, select a new subcategory (e.g. "fast_food"), save, and confirm it appears on the transaction with the correct label and icon.

**Acceptance Scenarios**:

1. **Given** the user taps "Add Expense", **When** they open the category picker, **Then** categories are organised into labelled parent groups (Food & Drink, Transport, Home, Health & Wellness, Entertainment, Shopping, Subscriptions, Education) and each group expands to show its subcategories.
2. **Given** the user selects the "fast_food" subcategory, **When** the transaction is saved, **Then** the stored category is `fast_food` and the transaction list / detail shows the "Fast Food" label with the appropriate icon.
3. **Given** an existing transaction with category `coffee`, **When** the user edits it and changes the subcategory to `alcohol`, **Then** the transaction is saved with `alcohol` and all views reflect the change.

---

### User Story 2 — Categorise an income transaction by income type (Priority: P1)

A user adds an income entry and can select the specific type of income (e.g. "Salary", "Freelance", "Dividends") rather than the catch-all "Income". This enables meaningful income breakdowns in reports and filters.

**Why this priority**: Equal in value to expense subcategories — without income subcategories the feature is asymmetric and reports remain coarse for income.

**Independent Test**: Add a new income transaction, select "salary" from the income category picker, save, and verify the transaction stores `salary` and shows "Salary" in all views.

**Acceptance Scenarios**:

1. **Given** the user switches the transaction kind to "Income", **When** the category picker is shown, **Then** it displays only income subcategories (Salary, Bonus, Freelance, Business Income, Dividends, Rental Income, Gift Received, Refund, Other Income).
2. **Given** the user selects "freelance", **When** the transaction is saved, **Then** `kind = income` and `category = freelance` are stored.
3. **Given** an existing transaction with legacy category `income`, **When** it is displayed, **Then** it is shown as "Income" (the legacy label) without error — it is not force-migrated.

---

### User Story 3 — Filter transactions by subcategory or parent group (Priority: P2)

In the filter panel on the transactions page, the user can filter by any subcategory. Parent group labels appear as section headers for navigation, but the filter itself is applied at the subcategory level.

**Why this priority**: Without filtered views, the richer taxonomy has limited reporting value. However, the filter enhancement does not block the core add/edit flow.

**Independent Test**: Open the filter panel, select the parent group "Transport", verify all transport subcategories are available, select "parking", and confirm the transaction list narrows to only transactions with `category = parking`.

**Acceptance Scenarios**:

1. **Given** the filter panel is open, **When** viewing category options, **Then** subcategories are shown grouped under their parent labels.
2. **Given** the user selects subcategory "gym", **When** the filter is applied, **Then** only transactions with `category = gym` appear in the list.
3. **Given** the user selects multiple subcategories across different parent groups, **When** the filter is applied, **Then** transactions matching any selected subcategory are shown.

---

### User Story 4 — Set a budget for any subcategory (Priority: P2)

When opening the budget drawer, the user can create or edit a budget for any subcategory (including new ones like `parking`, `gym`, `clothing`). The budget picker lists all spend subcategories grouped by parent.

**Why this priority**: Budgets are a core financial management feature. New subcategories are only useful if they can be budgeted.

**Independent Test**: Open the budget drawer, select "Clothing" (a new subcategory), set a monthly limit, save, and confirm the budget appears in the budget list.

**Acceptance Scenarios**:

1. **Given** the budget drawer is open and no category is pre-selected, **When** the user browses the category picker, **Then** all spend subcategories are listed (not income subcategories).
2. **Given** the user selects the subcategory `clothing` and sets a limit of $200, **When** the budget is saved, **Then** a budget row for `clothing` with `monthly_limit_cents = 20000` exists.
3. **Given** an existing budget for `groceries`, **When** the user opens the budget drawer, **Then** it still works correctly — existing budget subcategories are not broken.

---

### User Story 5 — Backward compatibility: existing transactions are unaffected (Priority: P1)

All transactions stored with the original 11 category values (`coffee`, `groceries`, `dining`, `subs`, `fuel`, `rent`, `health`, `income`, `transit`, `utilities`, `entertainment`) continue to display, filter, and budget correctly. No data migration is required.

**Why this priority**: Backward compatibility is a hard constraint. Breaking existing data is never acceptable.

**Independent Test**: Load a household with existing transactions using the original categories, verify all display correctly with their original labels and icons, verify filters and budgets still function.

**Acceptance Scenarios**:

1. **Given** transactions exist with any of the original 11 category values, **When** the app loads, **Then** every transaction displays its category label, icon, and tint without error.
2. **Given** a budget exists for `dining`, **When** the budget page loads, **Then** the budget appears and progress is calculated correctly.
3. **Given** filters are active for `groceries`, **When** the filter is applied, **Then** only `groceries` transactions appear.

---

### Edge Cases

- What happens when a subcategory icon is not yet defined? → Fall back to the parent group's icon.
- How does the CSV importer assign categories to rows that match new subcategory names? → The import engine's keyword-to-category map is extended to cover new slugs; unrecognised values default to the closest existing slug.
- What happens if the user has a budget for `subs` (now grouped under Subscriptions)? → It remains intact; `subs` is kept as a valid slug and maps to the Subscriptions group.
- How does the income filter work for the legacy `income` slug? → `income` is treated as a valid income subcategory (mapped to "Other Income" group), so existing income transactions remain filterable.
- What if a transaction has `category = transfer`? → `transfer` is never shown in pickers and is unaffected by this feature; it is still displayed as "Transfer" in the transaction list.

---

## Requirements *(mandatory)*

### Functional Requirements

**Data layer**:
- **FR-001**: The system MUST add all new category slugs to the database via an additive migration (no existing slugs are removed or renamed).
- **FR-002**: The type system MUST update `PICKABLE_CATEGORIES` so that every new slug is a valid `TransactionCategory` value.
- **FR-003**: The category metadata library MUST provide, for every category slug (old and new): a human-readable label, an icon, a tint colour, and a parent group name.
- **FR-004**: The system MUST expose a `CATEGORY_GROUPS` structure that maps each parent group name to its ordered list of child slugs — separately for expense groups and income groups.
- **FR-005**: The `SPEND_CATEGORIES` export MUST include all spend subcategory slugs (both original and new, excluding `income`, `transfer`, and income-only slugs).
- **FR-006**: The `INCOME_CATEGORIES` export MUST include all income subcategory slugs (`salary`, `bonus`, `freelance`, `business_income`, `dividends`, `rental_income`, `gift_received`, `refund`, `other_income`, and the legacy `income` slug).

**Expense category picker (UI)**:
- **FR-007**: The expense category picker in the transaction form MUST render subcategories grouped under their parent group label.
- **FR-008**: Each parent group MUST be visually distinct (section header label) so the user can scan at a glance.
- **FR-009**: Selecting any subcategory (old or new) MUST update the transaction's `category` field to that slug.

**Income category picker (UI)**:
- **FR-010**: When the transaction kind is set to `income`, the category picker MUST switch to showing income subcategories (not spend categories).
- **FR-011**: Saving an income transaction MUST store the selected income subcategory slug (e.g. `salary`), not the hardcoded `income` string.
- **FR-012**: The category field for income transactions MUST default to `salary` for new entries (overridable).

**Filter panel**:
- **FR-013**: The filter panel MUST list all subcategories (spend and income) with parent group headers for visual grouping.
- **FR-014**: Filtering by any subcategory MUST narrow the transaction list to only transactions with that exact category slug.

**Budget drawer**:
- **FR-015**: The budget category picker MUST list all spend subcategories grouped by parent.
- **FR-016**: Creating or editing a budget for any spend subcategory (old or new) MUST work without error.

**Backward compatibility**:
- **FR-017**: All existing transactions with original category slugs MUST display correctly without any data migration.
- **FR-018**: The `transfer` category MUST remain non-pickable and must not appear in any user-facing category picker.
- **FR-019**: The legacy `income` slug MUST remain valid as a stored category value and MUST be displayable as "Income (Legacy)" or "Income" without error.

### Key Entities

- **Category Slug**: The stored string value (e.g. `fast_food`). Immutable once written to the database. Maps 1:1 to `CategoryMeta`.
- **CategoryMeta**: `{ label: string, icon: LucideIcon, tint: string, parent: CategoryGroupKey }` — the display descriptor for a category slug.
- **CategoryGroup**: A parent grouping of related slugs. Has a `key` (e.g. `food_drink`), a display `label` (e.g. "Food & Drink"), and an ordered `children` array of slugs.
- **SPEND_CATEGORIES**: The ordered flat list of all pickable expense slugs. Used by budget, filter, and form pickers.
- **INCOME_CATEGORIES**: The ordered flat list of all pickable income slugs. Used by income form picker and filter.
- **CATEGORY_GROUPS**: The parent-to-children map, split into `expense` and `income` halves.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can pick from at least 28 distinct expense subcategories (up from 10) when adding or editing an expense.
- **SC-002**: A user can pick from at least 9 distinct income subcategories (up from 1) when adding or editing an income transaction.
- **SC-003**: All existing transactions (with original category slugs) load and display correctly after the migration — 0 display errors.
- **SC-004**: All existing unit tests, integration tests, and parity-vector tests continue to pass after the change (`npm test` green).
- **SC-005**: Selecting a subcategory during transaction entry takes no more steps than the current flat-select experience (one tap/click to open, one to choose).
- **SC-006**: The filter panel allows independent multi-subcategory selection and the resulting list matches exactly the expected transactions.

---

## Assumptions

- The web app is the only surface being changed; the frozen native iOS app (`iOS/Ortho-iOS/`) is out of scope.
- The Supabase database for local/staging environments will have the new migration applied; production is promoted manually (per standard workflow).
- "Grouped picker" means the current `<select>` in TxForm is replaced by a grouped select with `<optgroup>` elements or an equivalent accessible grouped component — the exact visual treatment is an implementation detail, but it must meet the accessibility requirements of the constitution (keyboard-reachable, ≥40px hit targets, visible focus ring).
- Income kind defaults to `salary` for new income entries; the form is not pre-populated from the legacy `income` slug.
- The category tint colours for new slugs follow the same warm-neutral palette already in use; no new palette entries are introduced (constitution §I).
- CSV import profiles will be extended to recognise new slugs in the keyword mapping but the existing categorisation fallback logic remains unchanged.
- The seed data script and demo household will be updated to use the richer category set.
- The `docs/finance.md` file documents the updated category taxonomy (categories count, group structure).

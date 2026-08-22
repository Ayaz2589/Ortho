# Implementation Plan: Category & Subcategory Expansion

**Branch**: `feat/031-category-subcategory-expansion` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-category-subcategory-expansion/spec.md`

---

## Summary

Expand the flat 11-category `transaction_category` Postgres enum into a two-level grouped taxonomy — 8 expense parent groups containing 28 subcategories, and 10 income subcategories (9 new + 1 legacy). The TypeScript type union, category metadata library, UI pickers, filter panel, budget drawer, CSV categoriser, and seed data all grow to match. All existing category slugs and stored data remain valid; the migration is purely additive.

---

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15 (App Router) — `web/` directory

**Primary Dependencies**: React, Tailwind v4, lucide-react (icons), Supabase (Postgres + JS client), Vitest (tests)

**Storage**: Supabase Postgres — `transaction_category` enum column on `transactions`, `budgets`, and `goals` tables

**Testing**: Vitest (`web/` — `npm test`); golden-vector parity tests in `web/test/*.parity.test.ts`; TDD discipline required (constitution §VI)

**Target Platform**: Web (desktop + mobile responsive), Capacitor iOS shell

**Project Type**: Full-stack web application

**Performance Goals**: No regression — category lookup remains O(1) map access

**Constraints**:
- DB enum values are additive-only (`ALTER TYPE … ADD VALUE IF NOT EXISTS`)
- `transfer` must never be a pickable category (locked product decision)
- Constitution §I: no new hardcoded colors; new tints drawn from the existing warm-neutral palette
- Constitution §II: category picker must not add density or visual clutter
- Constitution §VI: tests first; `npm test` must stay green at every intermediate commit

**Scale/Scope**: Single `web/` project; ~12 files to touch; ~20 new enum values; ~5 new tests suites or extensions

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. One Design System, Tokens Only | ✅ PASS | New category tints use same `rgb()` palette formula already in `categories.ts`; no hardcoded hex values |
| II. Calm Over Dense | ✅ PASS | Category picker becomes an `<optgroup>`-grouped `<select>` — same interaction model, no added chrome |
| III. Right Form Factor Per Canvas | ✅ PASS | No new layout patterns; existing TxForm responsive breakpoints unchanged |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | New labels follow existing "Title Case, one or two words" convention |
| V. Accessible & Interaction-Complete | ✅ PASS | `<optgroup>` is native HTML and screen-reader compatible; keyboard interaction unchanged |
| VI. Test-Driven & Regression-Safe | ✅ PASS | Tests written in tandem; existing parity vectors remain pinned |

No violations — no Complexity Tracking required.

---

## Project Structure

### Documentation (this feature)

```text
specs/031-category-subcategory-expansion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── categories.md    # Public contract for CATEGORIES, CATEGORY_GROUPS, SPEND_CATEGORIES, INCOME_CATEGORIES
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── types.ts                          # PICKABLE_CATEGORIES (add ~20 new slugs), TransactionCategory union
│   └── categories.ts                     # CATEGORIES map, CATEGORY_GROUPS, SPEND_CATEGORIES, INCOME_CATEGORIES, categoryMeta()
├── components/
│   ├── web/
│   │   ├── TxForm.tsx                    # Category picker: flat <select> → <optgroup>-grouped <select>
│   │   └── FilterPanel.tsx               # Category chips: add group-header visual separators
│   ├── budgets/
│   │   └── BudgetDrawer.tsx              # Budget category picker: expand to all spend subcategories
│   └── goals/
│       └── GoalForm.tsx                  # linked_category picker: expand to full taxonomy
├── scripts/
│   └── import/engine/
│       └── categorize.ts                 # Extend keyword→category rules for new slugs
└── test/
    ├── categories.test.ts                # Extend: new slugs, CATEGORY_GROUPS, INCOME_CATEGORIES
    └── transaction-filters.test.ts       # Extend: filter by new subcategory slugs

supabase/
└── migrations/
    └── 20260724120000_category_expansion.sql   # ALTER TYPE ADD VALUE for ~20 new slugs

docs/
└── finance.md                            # Update category taxonomy section (count, group structure)
```

**Structure Decision**: Single `web/` project — no additional projects needed.

---

## Implementation Phases

### Phase A: Data Layer & Type System (no UI yet)

1. **DB migration** (`supabase/migrations/20260724120000_category_expansion.sql`)
   - `ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS` for each new slug (expense + income)
   - New expense slugs: `fast_food`, `alcohol`, `takeout`, `parking`, `rideshare`, `home_improvement`, `insurance`, `gym`, `pharmacy`, `mental_health`, `streaming`, `gaming`, `events`, `clothing`, `electronics`, `personal_care`, `gifts`, `education`, `books`
   - New income slugs: `salary`, `bonus`, `freelance`, `business_income`, `dividends`, `rental_income`, `gift_received`, `refund`, `other_income`

2. **`web/lib/types.ts`** — extend `PICKABLE_CATEGORIES` to include all new slugs; `TransactionCategory` union updates automatically

3. **`web/lib/categories.ts`** — major expansion:
   - Add `CategoryGroupKey` type and `CategoryGroup` interface
   - Add `parent: CategoryGroupKey` field to `CategoryMeta`
   - Add all new slugs to `CATEGORIES` map (with label, icon, tint, parent)
   - Add `CATEGORY_GROUPS: { expense: CategoryGroup[], income: CategoryGroup[] }` structure
   - Add `INCOME_CATEGORIES: TransactionCategory[]` export (all pickable income slugs)
   - Update `SPEND_CATEGORIES` to include new expense slugs (ordered by group)

4. **Tests for data layer** (`web/test/categories.test.ts`)
   - All new slugs present in `CATEGORIES`
   - Every slug has label, icon, tint, parent
   - `CATEGORY_GROUPS.expense` covers all spend categories; `CATEGORY_GROUPS.income` covers all income categories
   - `INCOME_CATEGORIES` excludes `transfer` and all expense slugs
   - `SPEND_CATEGORIES` excludes `income`, all income slugs, `transfer`

### Phase B: UI Pickers

5. **`web/components/web/TxForm.tsx`**
   - Expense picker: replace flat `SPEND_CATEGORIES.map()` with `CATEGORY_GROUPS.expense.map(group → <optgroup label={group.label}>…children…</optgroup>)`
   - Income picker: when `isIncome`, show grouped income picker (CATEGORY_GROUPS.income) instead of hardcoding `'income'`
   - Income default category: `salary` for new entries
   - On kind switch expense→income: reset category to `salary`; income→expense: reset to `groceries`

6. **`web/components/web/FilterPanel.tsx`**
   - Category section: render group headers as non-selectable separators above each group's chips
   - Include income subcategories in the full filter list (with their own group headers)

7. **`web/components/budgets/BudgetDrawer.tsx`**
   - Category picker: expand to use `CATEGORY_GROUPS.expense` grouped structure

8. **`web/components/goals/GoalForm.tsx`**
   - `linked_category` picker: expand to full taxonomy (expense + income subcategories)

### Phase C: CSV Import & Seed Data

9. **`web/scripts/import/engine/categorize.ts`**
   - Extend keyword rules to map merchants to new slugs where more specific (e.g. Uber Eats → `takeout`, Lyft → `rideshare`, Netflix → `streaming`, Equinox → `gym`, CVS → `pharmacy`)
   - Existing rules that previously mapped to broad slugs (like `dining`) continue to work

10. **Seed data** — update `web/lib/testdata/` or seed script to use richer category set (salary, rideshare, takeout, streaming, gym, etc.)

### Phase D: Docs & Cleanup

11. **`docs/finance.md`** — update category taxonomy table (now 28 expense + 10 income + transfer)
12. **CLAUDE.md** — update active feature pointer to plan.md

---

## Key Design Decisions (from research)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI picker pattern | `<optgroup>`-grouped `<select>` (HTML native) | Zero new dependencies; accessible; matches existing `<select>` interaction model; easy to implement and test |
| Income category field when `kind='income'` | Store the specific income slug directly (e.g. `salary`) | Richer than hardcoded `'income'`; backward compatible (old `income` slug remains valid) |
| New income default | `salary` | Most common income entry use case; easily overridable |
| Tint colours for new slugs | Reuse existing warm-neutral palette values from adjacent categories | No new palette entries; constitution §I satisfied |
| CATEGORY_GROUPS structure | Separate `expense[]` and `income[]` arrays, each containing `{ key, label, children[] }` | Enables picker to iterate groups without filtering; income picker simply uses `income` array |
| Icons for new slugs | Lucide icons (already in bundle) | No new dependency; icons already tree-shaken by category |
| Transfer stays non-pickable | Yes — never in `SPEND_CATEGORIES`, `INCOME_CATEGORIES`, or `CATEGORY_GROUPS` | Locked product decision (2026-07-02 audit) |
| Backward compat for legacy `income` slug | Keep in `INCOME_CATEGORIES` as "Other Income (Legacy)" / map to income group | Zero data migration; old transactions display correctly |

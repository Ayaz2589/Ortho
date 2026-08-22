# Contract: Category Library (`web/lib/categories.ts`)

**Feature**: 031-category-subcategory-expansion  
**Date**: 2026-07-24

This document is the public contract for the exports of `web/lib/categories.ts`. Any consumer (UI components, tests, CSV importer, seed scripts) that imports from this module must rely only on the surface described here.

---

## Exports

### `CATEGORIES: Record<TransactionCategory, CategoryMeta>`

A map from every `TransactionCategory` slug (all pickable slugs + `transfer`) to its display metadata. Keyed by slug.

```typescript
interface CategoryMeta {
  label: string        // human-readable, title-case, 1-3 words; translatable
  icon: LucideIcon     // from lucide-react; used for CatTile
  tint: string         // rgb(r, g, b) string; used for charts and pills
  parent: CategoryGroupKey
}
```

**Invariants**:
- Every slug in `PICKABLE_CATEGORIES` (from `types.ts`) has a key in this map
- `transfer` has a key in this map
- No slug is missing

### `CATEGORY_GROUPS: { expense: CategoryGroup[], income: CategoryGroup[] }`

Ordered groups for pickers. Expense groups are shown in the expense category picker; income groups in the income picker.

```typescript
interface CategoryGroup {
  key: CategoryGroupKey    // stable identifier
  label: string            // section header; translatable
  children: TransactionCategory[]  // ordered slugs; must all be in CATEGORIES
}
```

**Invariants**:
- `CATEGORY_GROUPS.expense` covers exactly `SPEND_CATEGORIES` (same slugs, structured)
- `CATEGORY_GROUPS.income` covers exactly `INCOME_CATEGORIES` (same slugs, structured)
- No slug appears in both `expense` and `income` groups
- `transfer` does not appear in either group

### `SPEND_CATEGORIES: TransactionCategory[]`

Flat ordered array of all expense subcategory slugs. Used by budget drawer, insights, and spend reports.

**Invariants**:
- Does not contain `income`, any income subcategory slug, or `transfer`
- Equals the union of all `CATEGORY_GROUPS.expense[*].children` (in group order)

### `INCOME_CATEGORIES: TransactionCategory[]`

Flat ordered array of all income subcategory slugs (including legacy `income`). Used by income picker and income filter.

**Invariants**:
- Does not contain any expense slug or `transfer`
- Equals the union of all `CATEGORY_GROUPS.income[*].children` (in group order)

### `categoryMeta(c: TransactionCategory): CategoryMeta`

Returns the same object as `CATEGORIES[c]`. Never throws for any valid `TransactionCategory`.

### `SEVERITY_ORDER`, `severityColor()`, `PALETTE`, `paletteFor()`, `deriveInitial()`

Unchanged from current implementation — see existing documentation.

---

## Breaking Change Policy

- New slugs may be **added** to `PICKABLE_CATEGORIES`, `SPEND_CATEGORIES`, `INCOME_CATEGORIES`, and `CATEGORY_GROUPS` at any time — consumers must not hard-code the length of these arrays
- Existing slug strings must **never** be renamed or removed — they are stored in the DB
- `transfer` must always remain non-pickable — consumers must not assume exhaustiveness of `SPEND_CATEGORIES` across all `TransactionCategory` values

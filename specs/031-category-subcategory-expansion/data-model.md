# Data Model: Category & Subcategory Expansion

**Feature**: 031-category-subcategory-expansion  
**Date**: 2026-07-24

---

## Postgres Enum: `transaction_category`

**Before** (12 values = 11 pickable + transfer):
```
coffee, groceries, dining, subs, fuel, rent, health, income, transit, utilities, entertainment, transfer
```

**After** (41 values = 40 pickable + transfer):

Expense slugs (28):
```
coffee, groceries, dining, fast_food, alcohol, takeout,   ← Food & Drink
transit, fuel, parking, rideshare,                         ← Transport
rent, utilities, home_improvement, insurance,              ← Home
health, gym, pharmacy, mental_health,                      ← Health & Wellness
entertainment, streaming, gaming, events,                  ← Entertainment
clothing, electronics, personal_care, gifts,               ← Shopping
subs,                                                      ← Subscriptions
education, books                                           ← Education
```

Income slugs (11 = legacy `income` + 10 new):
```
income,                                                    ← Legacy (Other Income)
salary, bonus, freelance, business_income,                 ← Employment & Business
dividends, rental_income,                                  ← Investment & Assets
gift_received, refund, other_income                        ← Other Income
```

System-only (not pickable):
```
transfer
```

**Migration strategy**: `ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS '<slug>';` — one statement per new slug, idempotent, additive-only.

---

## TypeScript Types (`web/lib/types.ts`)

### `PICKABLE_CATEGORIES` (const array → drives union)

```typescript
export const PICKABLE_CATEGORIES = [
  // Food & Drink
  'coffee', 'groceries', 'dining', 'fast_food', 'alcohol', 'takeout',
  // Transport
  'transit', 'fuel', 'parking', 'rideshare',
  // Home
  'rent', 'utilities', 'home_improvement', 'insurance',
  // Health & Wellness
  'health', 'gym', 'pharmacy', 'mental_health',
  // Entertainment
  'entertainment', 'streaming', 'gaming', 'events',
  // Shopping
  'clothing', 'electronics', 'personal_care', 'gifts',
  // Subscriptions
  'subs',
  // Education
  'education', 'books',
  // Income (legacy + subcategories)
  'income', 'salary', 'bonus', 'freelance', 'business_income',
  'dividends', 'rental_income', 'gift_received', 'refund', 'other_income',
] as const

export type TransactionCategory = (typeof PICKABLE_CATEGORIES)[number] | 'transfer'
```

---

## Category Metadata (`web/lib/categories.ts`)

### `CategoryGroupKey` type

```typescript
export type CategoryGroupKey =
  | 'food_drink'
  | 'transport'
  | 'home'
  | 'health_wellness'
  | 'entertainment'
  | 'shopping'
  | 'subscriptions'
  | 'education'
  | 'income_employment'
  | 'income_investment'
  | 'income_other'
  | 'system'           // transfer
```

### `CategoryMeta` (extended)

```typescript
export interface CategoryMeta {
  label: string
  icon: LucideIcon
  tint: string
  parent: CategoryGroupKey
}
```

### `CategoryGroup`

```typescript
export interface CategoryGroup {
  key: CategoryGroupKey
  label: string           // "Food & Drink", "Transport", etc.
  children: TransactionCategory[]
}
```

### `CATEGORY_GROUPS`

```typescript
export const CATEGORY_GROUPS: {
  expense: CategoryGroup[]
  income: CategoryGroup[]
} = {
  expense: [
    { key: 'food_drink',       label: 'Food & Drink',     children: ['coffee','groceries','dining','fast_food','alcohol','takeout'] },
    { key: 'transport',        label: 'Transport',         children: ['transit','fuel','parking','rideshare'] },
    { key: 'home',             label: 'Home',              children: ['rent','utilities','home_improvement','insurance'] },
    { key: 'health_wellness',  label: 'Health & Wellness', children: ['health','gym','pharmacy','mental_health'] },
    { key: 'entertainment',    label: 'Entertainment',     children: ['entertainment','streaming','gaming','events'] },
    { key: 'shopping',         label: 'Shopping',          children: ['clothing','electronics','personal_care','gifts'] },
    { key: 'subscriptions',    label: 'Subscriptions',     children: ['subs'] },
    { key: 'education',        label: 'Education',         children: ['education','books'] },
  ],
  income: [
    { key: 'income_employment', label: 'Employment & Business', children: ['salary','bonus','freelance','business_income'] },
    { key: 'income_investment',  label: 'Investment & Assets',   children: ['dividends','rental_income'] },
    { key: 'income_other',       label: 'Other Income',          children: ['gift_received','refund','other_income','income'] },
  ],
}
```

### Updated exports

```typescript
// All spend subcategory slugs (expense pickers, budget drawer, spend insights)
export const SPEND_CATEGORIES: TransactionCategory[] = [
  'coffee','groceries','dining','fast_food','alcohol','takeout',
  'transit','fuel','parking','rideshare',
  'rent','utilities','home_improvement','insurance',
  'health','gym','pharmacy','mental_health',
  'entertainment','streaming','gaming','events',
  'clothing','electronics','personal_care','gifts',
  'subs',
  'education','books',
]

// All income subcategory slugs (income picker and income filter)
export const INCOME_CATEGORIES: TransactionCategory[] = [
  'salary','bonus','freelance','business_income',
  'dividends','rental_income',
  'gift_received','refund','other_income','income',
]
```

---

## Existing Tables: No Schema Change Needed

| Table | Column | Change |
|-------|--------|--------|
| `transactions` | `category transaction_category` | No change — column type accepts new enum values after migration |
| `budgets` | `category transaction_category` | No change — new subcategories automatically valid |
| `goals` | `linked_category transaction_category` | No change — nullable; new values valid |

---

## Validation Rules

- `SPEND_CATEGORIES` ∩ `INCOME_CATEGORIES` = ∅ (no slug in both)
- `transfer` ∉ `SPEND_CATEGORIES` ∪ `INCOME_CATEGORIES` ∪ any `CATEGORY_GROUPS` children
- `SPEND_CATEGORIES` = union of all `CATEGORY_GROUPS.expense[*].children`
- `INCOME_CATEGORIES` = union of all `CATEGORY_GROUPS.income[*].children`
- Every slug in `PICKABLE_CATEGORIES` appears in exactly one `CATEGORY_GROUPS` group
- Every slug in `CATEGORIES` map has a non-empty `label`, a truthy `icon`, a valid `tint` string, and a valid `parent` key

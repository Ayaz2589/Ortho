# Quickstart Validation Guide: Category & Subcategory Expansion

**Feature**: 031-category-subcategory-expansion  
**Date**: 2026-07-24

This guide covers how to validate the feature end-to-end once implemented.

---

## Prerequisites

- Node >=20 installed; deps installed (`cd web && npm install`)
- Supabase local dev running (`supabase start` from repo root) or a staging instance
- Migration applied (`supabase db push` or `supabase migration up`)

---

## 1. Run the test suite

```bash
cd web
npm test
```

Expected: all tests pass, including the updated `web/test/categories.test.ts` which covers:
- All 41 slugs (40 pickable + transfer) present in `CATEGORIES`
- Every slug has label, icon, tint, parent
- `CATEGORY_GROUPS.expense` children = `SPEND_CATEGORIES`
- `CATEGORY_GROUPS.income` children = `INCOME_CATEGORIES`
- `SPEND_CATEGORIES` excludes income slugs and `transfer`
- `INCOME_CATEGORIES` excludes expense slugs and `transfer`

---

## 2. Validate DB migration

```sql
-- Check all new slugs exist in the enum
SELECT enumlabel FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_category')
ORDER BY enumsortorder;
```

Expected: 41 rows (40 pickable + transfer), including all new slugs like `fast_food`, `salary`, `rideshare`, etc.

---

## 3. Validate expense category picker (UI)

1. Open the app (dev server: `cd web && npm run dev`) and navigate to the transaction form
2. Switch to "Expense" mode
3. Open the category picker
4. **Expected**: Categories are grouped under section headers (Food & Drink, Transport, Home, Health & Wellness, Entertainment, Shopping, Subscriptions, Education)
5. Select "Fast Food" → save the transaction
6. **Expected**: Transaction list shows "Fast Food" label with the correct icon
7. Open the transaction detail — **expected**: "Fast Food" displayed

---

## 4. Validate income category picker (UI)

1. Open the transaction form, switch to "Income" mode
2. **Expected**: Category picker shows income groups (Employment & Business, Investment & Assets, Other Income) — NOT the expense categories
3. Default selection should be "Salary"
4. Select "Freelance" → save
5. **Expected**: Transaction stored with `category = freelance`, displayed as "Freelance"

---

## 5. Validate backward compatibility

1. Load a household with existing transactions (use the seed data or a real household)
2. **Expected**: All transactions with original categories (`coffee`, `groceries`, `dining`, `subs`, `fuel`, `rent`, `health`, `income`, `transit`, `utilities`, `entertainment`) display correctly
3. Check the filter panel — **expected**: existing categories still selectable
4. Check budgets — **expected**: existing budgets for original categories still display

---

## 6. Validate filter panel

1. Open the transactions filter panel
2. **Expected**: Category list shows group headers, new subcategories visible alongside original ones
3. Select "Parking" — **expected**: transaction list narrows to only `parking` transactions
4. Select "Salary" — **expected**: transaction list narrows to only `salary` income transactions

---

## 7. Validate budget drawer

1. Open the budget drawer (from Budgets page)
2. **Expected**: Category picker includes new subcategories grouped by parent
3. Create a budget for "Clothing" with a $100 monthly limit
4. **Expected**: Budget saved and appears in the budget list

---

## 8. Check TypeScript types

```bash
cd web
npx tsc --noEmit
```

Expected: 0 errors. All new slugs in `PICKABLE_CATEGORIES` resolve to the `TransactionCategory` union without TS errors.

---

## 9. Regression check — CSV import

1. Run the categorizer test or create a test CSV row with merchant "Lyft"
2. **Expected**: categorized as `rideshare` (not generic `transit`)
3. Merchant "Netflix" → `streaming` (not generic `subs`)
4. Merchant "Equinox" → `gym` (not generic `health`)

---

## Known Edge Cases to Verify

| Scenario | Expected Behaviour |
|----------|-------------------|
| Transaction with legacy `income` category | Displayed as "Income" (from CATEGORIES map); no error |
| Budget for original `dining` category | Unchanged; still works |
| Goal with `linked_category = 'rent'` | Still works; displayed as "Rent" |
| Filter selecting multiple new subcategories | OR logic; all matching transactions shown |
| `transfer` category in transaction list | Displayed as "Transfer"; not available in any picker |

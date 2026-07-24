# Research: Category & Subcategory Expansion

**Feature**: 031-category-subcategory-expansion  
**Date**: 2026-07-24

---

## Q1: How should the grouped UI picker be implemented?

**Decision**: Use native HTML `<select>` with `<optgroup>` child elements.

**Rationale**:
- The existing TxForm already uses a `<select>` element — this is an in-place upgrade with no structural change to the form layout
- `<optgroup>` is supported in all browsers, works on mobile, is keyboard-navigable, and announced by screen readers (accessibility §V)
- No new dependency; no custom dropdown component needed
- Capacitor WebView (WKWebView on iOS) renders native-looking `<select>` pickers — `<optgroup>` headers appear in the system picker sheet automatically

**Alternatives considered**:
- Custom dropdown/combobox with section headers: More visual control but adds complexity, requires keyboard trap, focus management, and ARIA roles — disproportionate effort for a category picker
- Two-step picker (select group first, then subcategory): Adds interaction steps vs. current flat select — rejected per spec SC-005

---

## Q2: How should income categories be handled in the transaction kind flow?

**Decision**: When `kind = 'income'`, the category field shows a separate income-specific `<select>` (using `CATEGORY_GROUPS.income`). The category defaults to `salary`. The stored value is the income subcategory slug directly (e.g. `salary`, `freelance`).

**Rationale**:
- The current code hardcodes `category: isIncome ? 'income' : category` — this is exactly the pattern to change
- Income subcategories need to be stored as direct slug values so the filter, insights, and reports can differentiate income types
- `salary` is the most common income entry; defaulting there reduces the friction for the most common case
- The legacy `income` slug stays in `INCOME_CATEGORIES` so existing transactions display without error

**Alternatives considered**:
- Keep `income` hardcoded for `kind='income'` and add a separate "income type" field: Adds a new column to the DB — unnecessary complexity; the existing `category` field already serves this role
- Make income categories a separate top-level field: Same problem — schema change not needed

---

## Q3: What icon and tint should new categories use?

**Decision**: New slugs use Lucide icons already in the bundle; tints reuse the existing warm-neutral RGB formula.

**Tint assignments (new slugs)**:

| Slug | Icon | Tint RGB |
|------|------|----------|
| fast_food | `Beef` | rgb(211, 155, 127) — warm terracotta, adj of dining |
| alcohol | `Wine` | rgb(180, 145, 175) — muted mauve |
| takeout | `ShoppingBag` | rgb(205, 165, 120) — warm sand |
| parking | `ParkingSquare` | rgb(160, 175, 195) — cool slate |
| rideshare | `Car` | rgb(175, 165, 145) — warm stone |
| home_improvement | `Hammer` | rgb(150, 165, 175) — grey-blue |
| insurance | `ShieldCheck` | rgb(145, 170, 160) — sage-grey |
| gym | `Dumbbell` | rgb(195, 155, 155) — warm rose, adj of health |
| pharmacy | `Pill` | rgb(180, 160, 175) — muted lavender |
| mental_health | `Brain` | rgb(170, 175, 155) — warm sage |
| streaming | `Tv` | rgb(140, 155, 185) — cool blue, adj of entertainment |
| gaming | `Gamepad2` | rgb(150, 140, 185) — muted violet |
| events | `Ticket` | rgb(175, 155, 135) — warm tan |
| clothing | `Shirt` | rgb(185, 165, 155) — blush |
| electronics | `Laptop` | rgb(150, 165, 180) — tech slate |
| personal_care | `Sparkles` | rgb(195, 170, 175) — dusty rose |
| gifts | `Gift` | rgb(200, 165, 140) — peach |
| education | `GraduationCap` | rgb(155, 170, 155) — sage |
| books | `BookOpen` | rgb(160, 175, 165) — sage-green |
| salary | `Landmark` | rgb(140, 185, 160) — income green |
| bonus | `TrendingUp` | rgb(145, 190, 155) — bright income |
| freelance | `Briefcase` | rgb(150, 185, 170) — teal income |
| business_income | `Building2` | rgb(145, 175, 165) — business teal |
| dividends | `Percent` | rgb(155, 185, 155) — investment green |
| rental_income | `KeyRound` | rgb(165, 185, 160) — sage income |
| gift_received | `PackageOpen` | rgb(170, 190, 155) — light sage |
| refund | `RotateCcw` | rgb(160, 185, 165) — muted green |
| other_income | `CircleDollarSign` | rgb(155, 180, 165) — income fallback |

All income tints are in the existing income-green neighbourhood (`rgb(0.565, 0.722, 0.612)` → `rgb(144, 184, 156)`).  
All expense tints stay in the existing warm-neutral envelope.

---

## Q4: What is the complete new PICKABLE_CATEGORIES list?

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
  // Income
  'income', 'salary', 'bonus', 'freelance', 'business_income',
  'dividends', 'rental_income', 'gift_received', 'refund', 'other_income',
] as const
```

Total: 40 pickable slugs (28 expense + 1 legacy income + 9 new income + 2 already-income). Transfer excluded, non-pickable.

---

## Q5: How do existing tests that enumerate ALL_CATEGORIES need to change?

The `web/test/categories.test.ts` file hardcodes:
```typescript
const ALL_CATEGORIES: TransactionCategory[] = [
  'coffee', 'groceries', 'dining', 'subs', 'fuel', 'rent', 'health',
  'income', 'transit', 'utilities', 'entertainment', 'transfer',
]
```

This must be updated to include all 40 pickable slugs + `transfer`. The test that checks `Object.keys(CATEGORIES).sort() === ALL_CATEGORIES.sort()` will fail until both the map and the array are updated together — this is the test acting as intended.

Similarly, the `SPEND_CATEGORIES` order test must be updated to match the new grouped order.

---

## Q6: How does the `store.tsx` unknown-category guard work?

```typescript
return KNOWN_KINDS.has(r.kind) && r.category in CATEGORIES
```

This drops rows with unknown categories. New slugs must be in `CATEGORIES` before any data using them is loaded. Since `CATEGORIES` is the source of truth (populated from `web/lib/categories.ts`), the app-code change and the DB migration can be deployed together without ordering issues (new slugs in the migration are always valid on the DB side; old app code sees `r.category in CATEGORIES` as false for unknown slugs, which is a safe drop-and-hide behaviour during a rolling deploy).

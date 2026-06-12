# Contracts: Public Surfaces Locked by Tests

For a testing feature, the "contracts" are the public function signatures and component
props the suite pins. Tests assert these behaviors; changing a signature should require
updating a test (intentional change), not silently breaking callers.

## lib/finance/money.ts
- `formatMoney(cents, currency='usd', rate=1, leadingPlus=false): string`
  - negative → leading Unicode-safe `-`; positive + `leadingPlus` → `+`; uses `Intl`.
- `toUSDCents(displayAmount, fromCurrency='usd', rate=1): number` — integer; `rate 0 → 0`.
- `CURRENCY_CONFIG` (code/symbol/fractionDigits per key).

## lib/finance/currency.ts
- `CURRENCIES: CurrencyKey[]` (fixed order, matches iOS).
- `CURRENCY_NAMES`, `FALLBACK_RATE_FROM_USD` (complete maps over all keys).
- `currencyCode/currencySymbol/fractionDigits(key)`.

## lib/format.ts
- `startOfDay(d)`, `startOfMonth(d)` — local midnight / first-of-month.
- `dayLabel(date, locale, now)` → Today/Yesterday/weekday/“MMM d”.
- `shortDate/mediumDate/monthYear/monthYearLong(date, locale)`.
- `groupByDay(txs): TxDayGroup[]` (newest day first; items newest first).
- `groupDaysByMonth(days): TxMonthGroup[]` (newest month first; day order preserved).
- `expenseTotal(items)` (expenses only, income excluded).
- `effectiveSplits(tx): Record<string, number>` (explicit or even; `{}` if no owners).
- `relativeTime(date, now)`.

## lib/categories.ts
- `categoryMeta(category)` → label/icon/palette; `SPEND_CATEGORIES` list; `paletteFor(key)`.

## lib/api/aggregates.ts
- Exported aggregation helpers (sums/grouping over transactions) — signatures pinned by tests.

## lib/utils.ts
- `cn(...classes)` — merges/dedupes Tailwind classes.

## lib/store.tsx (via `AppStateProvider` + `useApp()`)
- `formatMoney(cents, { leadingPlus? })`, `ownersDisplay(tx): OwnerDisplay`,
  `addTransaction(tx)`, `updateTransaction(tx)`, `deleteTransaction(id)`,
  `transactions: Transaction[]`, scope/owner semantics.

## components/inputs.tsx → `DatePicker`
- Props: `{ value: string /* YYYY-MM-DD */, onChange: (iso) => void, ariaLabel?: string }`.
- Behavior: trigger shows formatted date + opens dialog; grid for value's month; month
  nav; day click emits correct local ISO; Today; Esc/outside-click dismiss.

## components/Sidebar.tsx, components/TabBar.tsx
- Nav items are real links to `/dashboard|/transactions|/housing|/settings`; active route
  marked `aria-current="page"` / active class. Driven by `usePathname()` (mocked in test).

## components/web/TxForm.tsx → `useTxForm`
- `canSave: boolean` gate; `submit()` returns boolean and only persists when valid.

> Stability note: assertions target observable outputs and accessible DOM, not private
> internals, so refactors that preserve these contracts keep tests green.

# Data Model: Housing Dashboard Widgets

No persisted entities are added. Both widgets are read-only projections over the existing store.

## Source of truth

`housingSummary(properties: Property[]) → HousingSummary` — `web/lib/finance/housing-summary.ts`:

```ts
interface HousingSummary {
  cost: number       // total monthly cost: Σ mortgage payments + Σ lease rents (integer USD cents)
  equity: number     // Σ principal paid down across all mortgages (paid-off capped to full) (cents)
  netRental: number  // Σ (occupied unit rent − mortgage payment) for multifamily props (cents; may be < 0)
  multi: boolean     // any property is multifamily
  count: number      // number of properties
}
```

`properties` and `formatMoney` come from `useApp()` (`web/lib/store.tsx`).

## Housing costs widget (`housing-costs`)

Reads: `housingSummary(properties)` → `{ cost, netRental, multi, count }`.

| Element        | Source                                   | Notes                                   |
| -------------- | ---------------------------------------- | --------------------------------------- |
| Headline       | `formatMoney(cost)`                       | total monthly housing cost              |
| Caption        | `"per month"`                            | static label                            |
| Count row      | `count` → `"1 property"` / `"{0} properties"` | pluralized                          |
| Net rental row | `formatMoney(netRental, { leadingPlus })` | shown only when `multi`; minus glyph if < 0 |
| Empty state    | when `count === 0` → `"No properties yet."` | fills the cell                        |

## Home equity widget (`home-equity`)

Reads: `housingSummary(properties)` → `{ equity }`, plus a locally-summed denominator:

```ts
// total original loan across every property that has a mortgage (raw-data read)
const loanOriginal = properties.reduce(
  (sum, p) => sum + (p.mortgage?.original_loan_cents ?? 0),
  0
)
const fraction = loanOriginal > 0 ? Math.min(1, Math.max(0, equity / loanOriginal)) : 0
```

| Element      | Source                                | Notes                                  |
| ------------ | ------------------------------------- | -------------------------------------- |
| Headline     | `formatMoney(equity)`                 | principal paid down                    |
| Caption      | `"principal paid down"`               | static label                           |
| Progress bar | `fraction`                            | `--positive`; track `--chip-bg`; clamped 0–1 |
| Caption row  | `"{0}% paid off"` + `"of {0}"` money  | `Math.round(fraction * 100)`; `formatMoney(loanOriginal)` |
| Empty state  | when `loanOriginal === 0` → `"No mortgages yet."` | fills the cell             |

## New i18n keys (English source; translated in `es, bn, ja, ko, zh`)

```
"Housing costs"
"Your total monthly housing cost across all properties."
"per month"
"1 property"
"{0} properties"
"Net rental"
"No properties yet."
"Home equity"
"Principal you've paid down across all mortgages."
"principal paid down"
"{0}% paid off"
"of {0}"
"No mortgages yet."
```

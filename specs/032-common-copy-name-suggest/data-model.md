# Data Model: Most-common copy + merchant name suggestions

No persisted data changes. This feature derives two in-memory views from the existing
`Transaction` list already loaded into the form context (`useApp().transactions`).

## Existing entity (unchanged): Transaction

Fields relevant to this feature (see `web/lib/types.ts`):

| Field | Type | Used for |
|-------|------|----------|
| `id` | string | React keys; row identity |
| `merchant` | string | ranking key + suggestion vocabulary (may be empty for transfers) |
| `kind` | `'expense' \| 'income' \| 'transfer'` | kind-aware filtering; transfers excluded |
| `category` | TransactionCategory | carried into the prefill on copy |
| `amount_cents` | number | carried into the prefill on copy |
| `source` | string \| null | carried into the prefill on copy |
| `owner_ids` / split fields | — | carried into the prefill on copy (via existing `loadFrom`) |
| `date` | string (ISO) | most-recent tie-break + representative selection |

## Derived views (new, in-memory only)

### MostCommonEntry (Feature 1)

The output of `mostCommonTransactions(transactions, limit)` — a `Transaction[]` where:

- Only entries with a non-blank `merchant` are considered (transfers/blank excluded).
- Grouped by **normalized** merchant (`normalizeMerchant`) so case/spacing variants merge.
- Each group is represented by its **most-recent** transaction (max `date`).
- Membership is **selected** by **count desc**, then representative **date desc**, then normalized name asc, truncated to `limit`.
- The selected survivors are then **presented** ordered by **category slug asc**, then **merchant name asc** (case-insensitive) within each category.
- Truncated to `limit` (default 40).

Validation / invariants:
- Deterministic order for a given input (Principle VI).
- Idempotent and pure (no clock, no I/O).
- Empty input → empty array (drives the "nothing to copy yet" state).

### KnownNamesForKind (Feature 2)

The output of `knownNamesForKind(transactions, kind)` — a `string[]` of distinct merchant
display names, most-frequent first, where:

- `transactions` is first filtered to those whose `kind` matches the requested kind
  (`'expense'` or `'income'`).
- Then `rankedMerchants()` produces the distinct, frequency-ordered display names.
- Blank names excluded (inherited from `rankedMerchants`/`normalizeMerchant`).

This list feeds:
- The `<datalist>` `<option>`s attached to the merchant input, and
- `suggestMerchants(typedText, knownNames)` if/when a "you've used" hint is shown
  (datalist alone satisfies the requirement; suggestMerchants remains available for parity
  with the CSV editor).

## Pure function signatures (contract)

```ts
// web/lib/txSuggest.ts
import type { Transaction, TransactionKind } from '@/lib/types'

/** Most-common merchants (freq-selected) as representative most-recent transactions,
 *  presented by category slug asc then merchant name asc within each category. */
export function mostCommonTransactions(
  transactions: Transaction[],
  limit?: number, // default 40
): Transaction[]

/** Distinct known names for a kind (expense|income), most-frequent first. */
export function knownNamesForKind(
  transactions: Transaction[],
  kind: Extract<TransactionKind, 'expense' | 'income'>,
): string[]
```

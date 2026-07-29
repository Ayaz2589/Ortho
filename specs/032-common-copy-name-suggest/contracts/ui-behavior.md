# UI Behavior Contract

Behavioral contracts for the two touch points. These are the assertions the tests encode.

## Contract A — Pure module `web/lib/txSuggest.ts`

### `mostCommonTransactions(transactions, limit = 40)`

| Given | Then |
|-------|------|
| "Blue Bottle" (coffee), "Chipotle" (dining), "Aldi"+"Whole Foods" (groceries) | ordered by **category slug asc** then **merchant name asc**: `["Blue Bottle","Chipotle","Aldi","Whole Foods"]` |
| within one category, merchants "zabar","Aldi","Bravo" | sorted **case-insensitively**: `["Aldi","Bravo","zabar"]` |
| freq 5 / 3 / 1 across categories, `limit=2` | freq **selects** the top 2 (the freq-1 merchant drops); survivors shown in category order |
| "Whole Foods" logged 3× with different amounts/dates | appears **once**, as the entry with the max `date` |
| variants "whole foods" / "Whole Foods" / "WHOLE FOODS" | merged into one group; display name = a real prior entry's `merchant` |
| a `transfer` entry (no merchant) or a blank-merchant entry | **excluded** from the result |
| two equal-count merchants, `limit=1` | the more-recent one is **selected** (frequency tie broken by representative `date` desc) |
| `[]` (empty ledger) | `[]` |
| ledger with 50 distinct merchants | result length === 40 (capped by frequency selection) |

### `knownNamesForKind(transactions, kind)`

| Given | Then |
|-------|------|
| expense merchants ["Whole Foods","Subway"], income payers ["Acme payroll"], kind="expense" | ["Whole Foods","Subway"] ordered by frequency; **no** "Acme payroll" |
| same, kind="income" | ["Acme payroll"] only |
| blank/whitespace merchant present | excluded |
| `[]` | `[]` |

## Contract B — Copy list (`TxCopyList` in `TxForm.tsx`)

| Given | When | Then |
|-------|------|------|
| a ledger with merchants across categories | New form's copy shortcut opened | rows are ordered by category then alphabetically by merchant (uses `mostCommonTransactions`), not date-first |
| the copy button/sub-view is rendered | — | its label reads "Copy from most common" (button, sub-view title) |
| a row is clicked | pick completes | `form.loadFrom(tx)` is called with that representative tx; date defaults to today (existing behavior, unchanged) |
| empty ledger | copy shortcut opened | shows the existing "Nothing to copy yet" empty state; no error |
| the change applies to both surfaces | — | mobile modal (`TxFormContent`) and desktop full page (`TxFormPageClient`) show the same relabeled, re-ranked list |

## Contract C — Merchant suggestions (merchant input in `TxFormFields`)

| Given | When | Then |
|-------|------|------|
| kind=expense, ledger has expense merchant "Whole Foods" | merchant input rendered on the **Add** form | a `<datalist>` with an option "Whole Foods" is associated with the input (`list=` matches datalist `id`) |
| kind=expense, on the **Edit** form | merchant input rendered | the same datalist association is present |
| kind=income, ledger has income payer "Acme payroll" and expense merchant "Whole Foods" | merchant input rendered | datalist options include "Acme payroll" and **not** "Whole Foods" |
| any state | user types a brand-new name not in the list | the typed value is accepted and submittable (free-form preserved; `canSave` unaffected by suggestions) |
| the transfer/reimbursement branch | rendered | unchanged — no merchant field, no datalist, no regression |

## Non-goals / invariants (all contracts)

- No change to `lib/splits.ts`, the money golden vectors, or `formatMoney`.
- No DB/schema/API change.
- Styling uses existing tokens/`ow-*` classes only.
- The merchant input remains a single labelled semantic `<input>`; suggestions are a
  native `<datalist>` (keyboard/AT reachable).

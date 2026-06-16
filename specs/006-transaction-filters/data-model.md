# Phase 1 Data Model: Transaction Filters

All types are in-memory/UI only — no schema change. Identical shape in TS and Swift.

## FilterCriteria
| Field | Type | Default | Notes |
|------|------|---------|------|
| `scope` | `'all' \| 'shared' \| 'personal'` | `'all'` | Existing scope toggle. |
| `query` | `string` | `''` | Existing free-text search (trimmed, lowercased at compare). |
| `categories` | `TransactionCategory[]` | `[]` | Multi-select; `[]` = all. OR within. |
| `kind` | `'all' \| 'expense' \| 'income'` | `'all'` | — |
| `sources` | `string[]` | `[]` | Multi-select source/account; `[]` = all. OR within. |
| `owners` | `string[]` | `[]` | Multi-select user ids; `[]` = all. A tx matches if any of its `owner_ids` ∈ owners. |
| `dateFrom` | `string \| null` | `null` | Inclusive ISO bound (`date >= from`). |
| `dateTo` | `string \| null` | `null` | Exclusive ISO bound (`date < to`). Half-open `[from, to)`. |

`emptyCriteria()` returns all defaults above (the unfiltered state).

## FilterContext
| Field | Type | Notes |
|------|------|------|
| `householdId` | `string \| null` | Current household id, for scope (`shared` = `household_id === householdId`; `personal` = `household_id === null`). |
| `ownerNames` | `Record<string,string>` | userId → display name, for search-by-owner-name. |

Serializable → embedded verbatim in each golden vector case.

## Functions (pure — `web/lib/transactionFilters.ts`, mirrored in Swift)
| Fn | Signature | Behaviour |
|----|-----------|-----------|
| `filterTransactions` | `(txs: Transaction[], c: FilterCriteria, ctx: FilterContext) => Transaction[]` | Returns the subset passing **all** dimensions (order preserved). |
| `emptyCriteria` | `() => FilterCriteria` | The unfiltered default. |
| `activeFilterCount` | `(c: FilterCriteria) => number` | Count of non-default dimensions (D5). |
| `availableSources` | `(txs: Transaction[]) => string[]` | Distinct non-empty `source`, alphabetized. |
| `monthBounds` | `(yyyymm: string) => { dateFrom: string; dateTo: string }` | `startOfMonth` / `startOfNextMonth` ISO (timezone-stable). |

### Predicate (the contract)
A transaction passes iff **all** hold:
- **scope**: `all` → true; `shared` → `household_id === ctx.householdId`; `personal` → `household_id === null`.
- **search**: `query` empty → true; else lowercased `query` is a substring of `merchant`, `source`, `category`, or any `ctx.ownerNames[owner_id]`.
- **category**: `categories` empty → true; else `category ∈ categories`.
- **kind**: `all` → true; else `kind === criteria.kind`.
- **source**: `sources` empty → true; else `source ∈ sources`.
- **owner**: `owners` empty → true; else `owner_ids ∩ owners ≠ ∅`.
- **date**: `dateFrom` set → `date >= dateFrom`; `dateTo` set → `date < dateTo`.

## Golden vector format (`shared/test-vectors/transaction-filters.json`)
```jsonc
{
  "cases": [
    {
      "name": "category multi-select (dining + coffee), default scope",
      "transactions": [ { /* minimal Transaction: id, household_id, merchant, category, kind, scope, amount_cents, source, date, owner_ids */ } ],
      "context": { "householdId": "h1", "ownerNames": { "u1": "Ayaz", "u2": "Tasnuva" } },
      "criteria": { "scope": "all", "query": "", "categories": ["dining","coffee"], "kind": "all", "sources": [], "owners": [], "dateFrom": null, "dateTo": null },
      "expectedIds": ["t2", "t5"]
    }
    // …cases per dimension, combinations, and edge cases (empty result, scope+category, date window, owner OR, source OR, search+filter)
  ]
}
```
Both suites: for each case, `filterTransactions(case.transactions, case.criteria, case.context).map(id)` MUST equal `case.expectedIds` (order preserved, newest-first input).

## Derived (UI, not in the pure fn)
- **Grouped result**: `groupDaysByMonth(groupByDay(filterTransactions(...)))` — existing helpers; empty groups dropped, totals via `expenseTotal` over the visible set.
- **Owner options**: household members + current user (from the store), shown in the owner control.
- **Active-filter chips**: one removable chip per active dimension; the count badge = `activeFilterCount`.

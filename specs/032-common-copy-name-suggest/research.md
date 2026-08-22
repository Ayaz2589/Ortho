# Research: Most-common copy + merchant name suggestions

All Technical Context items were resolvable from the existing codebase; no external
research required. This file records the design decisions and the alternatives rejected.

## Decision 1 — "Most common" = merchant frequency, one representative entry

- **Decision**: Rank the copy list by how often each **merchant** appears in the ledger
  (descending). De-duplicate to one row per merchant, represented by that merchant's
  **most-recent** transaction (so the prefilled amount/category/source/splits are real).
- **Rationale**: Matches the user's intent ("copy the most common transactions") and the
  most-repeated real task (re-logging a recurring purchase). Reuses the exact frequency
  notion already implemented and tested in `rankedMerchants()`.
- **Alternatives considered**:
  - *Most-frequent exact (merchant + amount) pair* — rejected: brittle (amounts vary run
    to run), and a coffee that's $4.50 then $4.75 would split into two "commons".
  - *Keep newest-first but add a "frequent" badge* — rejected: doesn't satisfy the ask and
    still buries frequent-but-old merchants.

## Decision 2 — Extract a pure module `web/lib/txSuggest.ts`

- **Decision**: Put the ranking (`mostCommonTransactions`) and the kind-aware known-name
  list (`knownNamesForKind`) in a new pure module that imports `rankedMerchants` /
  `normalizeMerchant` / `suggestMerchants` from `web/lib/csv/merchantSuggest.ts`.
- **Rationale**: Principle VI wants pure logic locked by unit tests; a component method is
  harder to test in isolation. The CSV module's functions are pure and not actually
  CSV-specific (they operate on `{ merchant: string }[]`), so reuse — not duplication —
  keeps one source of truth for "similar merchant" matching.
- **Alternatives considered**:
  - *Inline the sort in `TxCopyList`* — rejected: not unit-testable, and would duplicate
    the frequency logic already in `rankedMerchants`.
  - *Move `rankedMerchants` up out of `lib/csv/`* — rejected: unnecessary churn to CSV
    call sites; a thin re-export/import is enough and additive.

## Decision 3 — Suggestion UI = native `<datalist>` (mirror the CSV editor)

- **Decision**: Attach a native `<datalist>` of known names to the merchant `<input>`
  (via `list=`), exactly as `CsvRowEditModal` does. Options come from `knownNamesForKind`.
- **Rationale**: Zero new dependencies, keyboard- and screen-reader-friendly, preserves
  free-form typing, and is consistent with an affordance already shipped in the app. The
  browser handles the as-you-type filtering of `<datalist>` options natively.
- **Alternatives considered**:
  - *Custom dropdown/combobox* — rejected: more code, more a11y surface area, and
    inconsistent with the existing pattern for no user-visible benefit.
  - *The CSV editor's "You've used" chip row* — considered as an optional enhancement, but
    the datalist alone satisfies the requirement; chips are heavier chrome (Principle II)
    and are left out of scope unless requested.

## Decision 4 — Kind-awareness

- **Decision**: When the form kind is `income`, source known names from income
  transactions; when `expense`, from expense transactions. Transfers/reimbursements have
  no merchant and are excluded from both.
- **Rationale**: A payroll payer ("Acme Co. payroll") is not a shopping merchant; mixing
  the pools would surface irrelevant suggestions. The form already tracks `direction`
  (`isIncome`), so this is a filter on the transaction list before ranking.

## Decision 5 — Tie-breaking & cap

- **Decision**: Ties in frequency break by **most-recent activity** (the merchant whose
  latest transaction is newer ranks first), giving a deterministic order for tests. The
  most-common list is **capped at 40** entries, mirroring the current picker's slice.
- **Rationale**: Determinism is required by Principle VI (no flaky ordering). 40 keeps the
  picker scannable on large ledgers and matches existing behavior, minimizing surprise.

## Decision 6 — i18n

- **Decision**: Change the source literal from "Copy from recent" to "Copy from most
  common" and add the corresponding key to each of the 5 locale catalogs
  (`bn/es/ja/ko/zh`), matching how "Copy from recent" is already present in all five. The
  empty state "Nothing to copy yet" is unchanged (still accurate).
- **Rationale**: Keeps locale parity; the English-keyed `t()` would fall back to English
  otherwise, leaving a partial translation regression.

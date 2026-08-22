# Quickstart: Most-common copy + merchant name suggestions

## Prerequisites

- Node + deps installed: `cd web && npm install`
- Tests run from `web/`: Vitest + React Testing Library (jsdom via `test/setup.ts`).

## Run the feature's tests

```bash
cd web
# The three new suites for this feature:
npx vitest run test/lib/txSuggest.test.ts \
              test/web/tx-copy-most-common.test.tsx \
              test/web/tx-merchant-suggest.test.tsx
```

TDD order (write test → see it fail → implement → green):

1. `test/lib/txSuggest.test.ts` — Contract A (pure `mostCommonTransactions`, `knownNamesForKind`).
2. `test/web/tx-copy-most-common.test.tsx` — Contract B (copy list re-ranked + relabeled).
3. `test/web/tx-merchant-suggest.test.tsx` — Contract C (kind-aware datalist on add + edit).

## Full gate (must be green before PR)

```bash
cd web
npx tsc --noEmit        # types clean
npm test                # full suite — includes the money golden vectors, which MUST stay green
```

## Manual validation

1. `cd web && npm run dev`, open the app, ensure the ledger has a few repeated merchants
   (seed/test-data mode is fine).
2. **Copy from most common**: open **Add transaction** → tap **Copy from most common** →
   confirm the most-frequently-used merchant is at the top (not simply the newest entry);
   pick it and confirm the form prefills with a real amount/category/source, date = today.
3. **Suggestions (expense)**: in the Add form (expense), start typing a known merchant →
   the browser offers it from the datalist; pick it, or type a new name freely and save.
4. **Suggestions (income)**: switch the form to **Income** and confirm the suggestions come
   from income payers, not expense merchants.
5. **Edit**: open an existing transaction's **Edit** form and confirm suggestions appear there too.
6. Confirm **Transfer/Reimbursement** is unchanged (no merchant field, no datalist).

## Success signals

- New suites pass; `npm test` and `tsc --noEmit` are green (money/splits vectors unchanged).
- Copy list is frequency-ordered and relabeled on both mobile and desktop surfaces.
- Free-form merchant entry still works everywhere.

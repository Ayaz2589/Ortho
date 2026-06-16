# Quickstart: Transaction Filters

End-to-end validation. Assumes the feature is implemented per plan.md.

## 1. Shared logic + parity (no UI)
```bash
cd web && npm run gen:vectors     # regenerates shared/test-vectors/transaction-filters.json from the TS fn
cd web && npm test                # Node >= 20.19
```
Expected: `transaction-filters.test.ts` (unit) and `transaction-filters.parity.test.ts` (vectors) pass — every dimension, AND/OR, date window, and edge cases. This is the Principle VI gate and the parity lock.

## 2. Web — desktop (≥1024)
```bash
cd web && npm run dev   # only if no shared dev server is already up
```
Open `/transactions` wide:
- Click **Filters** → the right drawer opens with Category / Kind / Source / Owner / Date.
- Pick **Dining + Coffee** → list narrows to those; active chips "Dining ×", "Coffee ×" appear; badge shows `2`.
- Add **Income** kind and a **source** → list further narrows (AND); badge updates.
- **Clear all** → full list returns, chips gone.
- Pick a combination that matches nothing → **"No transactions match your filters"** + Clear filters.
- Keyboard: Tab to the controls, toggle with Enter/Space, sand focus ring visible.

## 3. Web — compact (<1024)
Narrow the window (or mobile): the filter surface opens as a panel/sheet from the filter button; the scope segmented + search still work; active chips show under the header; same narrowing/clear/no-match behavior.

## 4. Totals & grouping
With filters active, confirm each day/month total equals the sum of the visible rows, empty months are dropped, ordering stays newest-first.

## 5. iOS (run in Xcode)
- Add `shared/test-vectors/transaction-filters.json` to the test target's **Copy Bundle Resources**.
- Run `TransactionFilterParityTests` → every vector case passes (Swift `filterTransactions` matches the TS-generated expectations → no parity drift, SC-002).
- Build/run the app: on **Transactions**, the filter button opens the **bottom sheet**; the scope pills + search are preserved; category/kind/source/owner/date narrow the list; clear-all + no-matches state behave as on web.

## 6. Additivity check
Clear every filter on both clients → the Transactions page behaves exactly as before the feature (scope + search only) (SC-007).

## Success = all of:
- Unit + parity suites green (1); desktop + compact filtering, chips, clear-all, no-match (2–3); totals/grouping correct (4); iOS parity vectors pass + sheet works (5); additive when cleared (6).

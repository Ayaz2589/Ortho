# Parity Contracts

The "interfaces" this feature reconciles are (a) shared **golden-vector** fixtures asserted by both clients,
and (b) **cross-client behavioral** contracts. Both clients MUST satisfy these identically.

## C1 — Split round-trip (golden vector: `transaction-splits.json`)

`computeShares(amountCents, orderedOwners, splitInput) -> cents[]` already exists in both `web/lib/splits.ts`
and iOS `TransactionSplits.swift` and is vectored. **Add** cases:

- **Income split**: same inputs as an existing expense case but asserting the function is kind-agnostic
  (the function takes no kind; the contract is that the UI must not gate it — see C5).
- **Custom-split edit-prefill** (NEW transform to vector): given stored per-owner `cents[]` and the
  ordered owners + total, deriving the form seed:
  - `seedSplit(amountCents, orderedOwners, storedCents) -> { method, values }` where
    `method = 'even'` iff `storedCents == computeShares(amountCents, owners, even)`, else `method = 'value'`
    with `values = storedCents` (exact).
  - Round-trip invariant: `computeShares(amount, owners, seedSplit(...).asSplitInput) == storedCents`.
  - Vector cases: even split → seeds even; 50/50 of odd amount (leftover cent) → seeds value preserving the
    exact cents; uneven 70/30 with leftover → seeds value; single owner → full amount.

Implement `seedSplit` as a pure function in BOTH `web/lib/splits.ts` and iOS `TransactionSplits.swift`,
generated/asserted from the same vector. (Web already does this detection inline; extract/align it.)

## C2 — Insight IDs (golden vector: `insights.json`)

`generateInsights(input, referenceDate) -> Insight[]` with stable, input-deterministic `id`s following the
canonical web scheme in `shared/test-vectors/README.md`. Contract:

- For identical inputs + reference date, web and iOS emit the SAME ordered insights with the SAME `id`s and
  payloads.
- Every rule that can fire has at least one vector scenario. `gen-vectors.ts` is extended to trigger all
  rules; `insights.json` is regenerated; iOS `InsightEngine` IDs are renamed to match.

## C3 — Money/cents invariant (existing, reaffirmed)

All amounts are USD cents end-to-end; per-owner shares sum to the exact transaction total on both clients.
No rounding drift; leftover cent deterministic in owner order.

## C4 — Auth lifecycle (behavioral contract; not a vector — runtime)

- **Restore**: a persisted, valid (or refreshable) session yields `signedIn` before the first gate render;
  no `SignInView` flash, no empty-data flash.
- **Refresh**: expired access token + valid refresh token → refreshed, stays `signedIn`.
- **Sign-out**: clears all domain state + bootstrap marker; next sign-in re-bootstraps from server.
- **OTP length**: both clients gate on the same constant == production length; copy matches.
- **platform_locks**: claim on sign-in, release on sign-out, yield to an active other-platform lock —
  identical rule on both clients.

Validated by quickstart manual scenarios + (where unit-testable) iOS view-model tests for teardown/seed.

## C5 — UI capability contract (behavioral)

- The split editor (even/%/value) is available for any ≥2-owner transaction regardless of kind, on both
  clients.
- A household person's name and color are editable post-creation on both clients.
- On web ≥1024px: transaction detail shows per-owner cents + percent; dashboard shows category drill-down +
  per-member breakdown; language selection drives locale formatting. Each matches the phone/iOS surface.

## Contract test mapping

| Contract | Web assertion | iOS assertion |
|---|---|---|
| C1 split + seedSplit | Vitest vs `transaction-splits.json` | XCTest vs `transaction-splits.json` (after R9) |
| C2 insight IDs | Vitest vs `insights.json` | XCTest vs `insights.json` (after R9) |
| C3 cents invariant | covered by C1 vectors | covered by C1 vectors |
| C4 auth lifecycle | existing middleware behavior | iOS view-model unit tests + quickstart manual |
| C5 UI capability | component/behavior tests | quickstart manual + view-model tests where feasible |

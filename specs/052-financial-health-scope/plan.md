# Implementation Plan: Financial Health Scope Correction

**Branch**: `feat/050-053-household-wiring` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

Score the spending-driven health dimensions against the profile owner's **own share** of household
spending instead of the household total. The engine stays pure: the caller resolves the profile owner
to a person and passes the already-scoped ledger in, using spec 051's primitive.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: spec 051's `web/lib/scope/moneyScope.ts`

**Storage**: none — no migration, no new table

**Testing**: Vitest — extends `web/test/financial-health.test.ts`

**Constraints**: one-person households must produce byte-identical scores; the engine must remain
`now`-injected and side-effect free.

## Constitution Check

| Principle | Status |
|---|---|
| II — Calm over dense | Pass. No UI change; the number simply becomes correct. |
| IV — Plainspoken | Pass. No copy change. |
| VI — Test-driven & regression-safe | Pass. Solo-household identity asserted before the change lands. |

No violations.

## Design

### The split: which dimensions scope, which do not

| Dimension | Scope | Why |
|---|---|---|
| `cash_flow` | **person** | Compares the user's private income to spend — must share a denominator. |
| `savings_momentum` | **person** | Derives from the same spend figure. |
| `commitment_load` | n/a | Reads only the private profile; no transactions involved. |
| `safety_net` | n/a | Profile level + household goal bonus; goals stay household. |
| `plan_engagement` | **household** | Budgets and goals belong to the household (FR-005). |
| `routine_awareness` | **household** | Routines and their windowed denominator are household-wide (FR-006). |

Because only the *spend* figure differs, the change is surgical: `scoreFinancialHealth` gains an
optional `scopedTransactions` input used for `monthSpendCents` and `hasHistory`, while `transactions`
continues to feed plan engagement and routine awareness.

```ts
export interface FinancialHealthInput {
  // …existing fields unchanged…
  /** The profile owner's share of household spending. Defaults to `transactions`
   *  (household) when omitted, preserving spec 041/044 behavior exactly. */
  scopedTransactions?: Transaction[]
}
```

Defaulting to `transactions` when omitted means every existing caller and test keeps working, and the
one-person case is identical by construction.

### Caller — `web/components/widgets/bodies/FinancialHealthBody.tsx`

Resolve `currentPersonId` (already on the store) → build the scope → project once in the existing
`useMemo` → pass both arrays. When `currentPersonId` is empty, pass nothing and fall back to
household scope (FR-003).

`useFinancialProfileForm.ts` performs the same resolution so the questionnaire's live preview agrees
with the widget.

## Project Structure

```text
web/lib/finance/financialHealth.ts                     # optional scopedTransactions input
web/components/widgets/bodies/FinancialHealthBody.tsx  # resolve + project
web/components/financial-health/useFinancialProfileForm.ts
web/test/financial-health.test.ts                      # extended
```

No new files — this is a correction, not a capability.

## Test Strategy (TDD order)

1. **Regression lock**: existing `financial-health.test.ts` must pass untouched with
   `scopedTransactions` omitted.
2. **The defect**: two-person household, evenly split expenses → cash-flow spend is half the
   household total. This test fails before the change.
3. **Symmetry**: two members with identical profiles score identically regardless of who created the
   transactions.
4. **Household dimensions hold**: plan engagement unchanged for a member who created no budgets.
5. **Fallback**: unresolvable profile owner → household scope, not an empty ledger.

# Research: Finance Model Correctness (027)

All decisions resolved from codebase reading. No external unknowns.

## R1 — A2 Timezone fix approach

**Decision**: Fix `inInterval` in `insights.ts` to detect date-only strings
(`!date.includes('T')`) and parse them via `parseLocalDate` (from `web/lib/format.ts`)
instead of raw `new Date(date)`. This aligns the transaction-date parsing regime with
`monthInterval`'s local-calendar boundaries.

**Alternatives considered**:
- Change `monthInterval` to return UTC boundaries → would change behavior for full
  ISO strings and risk breaking existing vectors. Rejected.
- Normalize all transaction dates to local midnight before ingestion → out of scope
  and a schema change. Rejected.
- Add a TZ-aware `Date` constructor → no API for this in JS without a library. Rejected.

## R2 — A3 Oracle approach

**Decision**: Extend existing `finance-goldens.test.ts` (hand-derived expected values
with derivations shown) and `finance-properties.test.ts` (invariants). No new files
for the oracle — augment the existing files from spec-025.

## R3 — A4 Verification outcome

**Decision**: Inspect and test. Current code paths in `toTransaction.ts` and `tx.ts`
BOTH call `orderedOwnerIds` before `computeShares`. Test with `sort_order` ≠ UUID
order; if it passes, record "verified no divergence" in PARITY.md.

## R4 — B3 Housing component locations

Need to audit during implementation (grep for `currentEquityCents`, `netRentalCents`,
`equityFraction` render sites). Expected locations: a PropertyCard component, a
HousingDetail or SummaryRow component. Will confirm in T-B3 task.

## R5 — B4 Comment wording

Decided wording: "Leftover cents go to the canonically-first owner in `orderedOwnerIds`
order (ascending UUID string sort) — a deterministic, sub-cent-magnitude fairness
choice, not largest-remainder. This is a conscious product decision: consistent,
auditable, and independent of insertion or UI order."

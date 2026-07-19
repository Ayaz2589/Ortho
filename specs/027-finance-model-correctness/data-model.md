# Data Model: Finance Model Correctness (027)

No new data entities. This feature touches pure-logic functions and UI copy only.

## Key entities (existing, referenced)

### Transaction date string — two regimes
| Form | Example | JS parse result |
|------|---------|-----------------|
| Date-only | `"2026-06-01"` | UTC midnight (`…T00:00:00.000Z`) |
| Full ISO | `"2026-06-15T12:00:00.000Z"` | Exact UTC timestamp |

The A2 bug lives at the boundary: `monthInterval` builds **local** boundaries while
`inInterval` was calling `new Date(date)` which gives UTC midnight for date-only
strings. After the fix, date-only strings are parsed via `parseLocalDate` (local
midnight) so both sides are in the same timezone regime.

### Insight month window
Derived from `now: Date` passed to `generateInsights`:
- `mStart = new Date(now.getFullYear(), now.getMonth(), 1)` — local midnight, 1st of month
- `mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)` — local midnight, 1st of next month
- `pStart`, `pEnd` — same, one month earlier

### Leftover-cent allocation (splits.ts)
- Input: `owners: string[]` (must be pre-sorted by `orderedOwnerIds` before calling)
- Algorithm: floor each owner's share, distribute `leftover = amountCents − sum(floors)` one cent at a time, in list order
- Result: sum(shares) = amountCents always

### `PAID_OFF_THRESHOLD_CENTS` (new constant — display layer)
- Value: `500` (¢ = $5.00)
- Location: `web/lib/finance/mortgage.ts` (export so components can import)
- Semantics: a mortgage whose `currentPrincipalBalanceCents` ≤ this value is displayed as "paid off"
- Math functions (`currentPrincipalBalanceCents`, `currentEquityCents`) are unchanged — they continue to return exact values

## State transitions (none)

No new state machines or transitions. The insights engine is a pure function;
the housing components are display-only reads.

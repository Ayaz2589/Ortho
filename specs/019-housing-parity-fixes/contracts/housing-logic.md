# Contract: Housing Pure Logic & Cross-Surface Parity

These are the observable contracts the implementation must satisfy. Tests assert them; both platforms
must agree where noted.

## C1 — `parseLocalDate(s: string): Date` (web, shared in `web/lib/format.ts`)

- Given `'YYYY-MM-DD'` (or an ISO string with that prefix), returns a `Date` at **local** midnight of
  that calendar day: `new Date(y, m-1, d)`.
- Timezone-stable: for the same input string, `.getFullYear/.getMonth/.getDate` return the encoded
  Y/M/D in **every** timezone (UTC−12 … UTC+14).
- Every Housing consumer of a stored `date` column uses this instead of `new Date(str)`.

## C2 — Lease helpers (web `web/components/housing/lease.ts`) — parity with iOS `LeaseInfo`

For a fixed injected `asOf`:

| Function | Contract |
|---|---|
| `rentDueDay(lease)` | day-of-month of `lease_start` via `parseLocalDate` — equals iOS `LeaseInfo.rentDueDay` |
| `daysUntilNextRent(lease, asOf)` | ≥ 0; next occurrence of the due day, **clamped to month length** (a 31 due-day resolves to month-end in short months), never rolling an extra month |
| `nextRentCaption/rentDueCaption` | "Due today" at 0, "Due tomorrow" at 1, else "Due in N days" — N from the corrected `daysUntilNextRent` |
| `daysUntilEnd(lease, asOf)` | `parseLocalDate(lease_end) − asOf` in whole days — equals iOS |
| `isRenewalSoon(lease, asOf)` | `0 ≤ daysUntilEnd ≤ 60` on the corrected value |

**Acceptance anchor**: in `America/New_York`, `lease_start='2025-09-01'` ⇒ `rentDueDay===1`; on the
due date, `nextRentCaption==='Due today'`.

## C3 — Date display (web `RentalCards.tsx`, `MortgageCards.tsx`)

- Lease start/end rows, each rental-payment date, and the mortgage "Built since closing · {month}"
  caption render the **stored** calendar date (via `parseLocalDate` → existing `mediumDate`/`monthYear`),
  with no off-by-one and no wrong month in any timezone.

## C4 — Amortization month labels (web `web/lib/finance/mortgage.ts::upcomingAmortization`)

- For `months = N` and any `asOf`, the returned entries' `month` fields are **N successive calendar
  months** starting at `asOf`'s month, advanced by whole-month calendar addition with the day clamped —
  none skipped, none duplicated. Matches iOS `MortgageInfo` schedule dates.
- `principalCents` / `interestCents` are **unchanged** from current behavior (still vector-locked by
  `mortgage.json`).
- **Regression test**: `mortgage.parity.test.ts` (or a sibling) asserts the month sequence at a
  month-end `asOf` (e.g. Jan 31 → Jan, Feb, Mar, … in order).

## C5 — Interest-rate round-trip (web `AddPropertyModal.tsx`; iOS `AddPropertySheet.swift`)

- Loading a property with stored rate `R` (up to 4 decimals) into the edit form and saving **without
  changing the rate** persists exactly `R` (no truncation). Derived payment/balance are unchanged.
- **Regression test**: `property-edit.test.tsx` seeds a property at 6.375%, drives a no-op save through
  the store, asserts the persisted `annual_interest_rate_percent === 6.375`. iOS verified on CI.

## C6 — Net rental figure (web `web/lib/finance/housing.ts`; iOS `Property.swift`)

- `occupiedRentCents(units)` = Σ rent of occupied units; `netRentalCents(units, mortgagePaymentCents)`
  = occupiedRent − payment (may be negative; not gated on a mortgage).
- The Dashboard housing summary (`HousingSnapshotCard`, `DashboardDesktop.housingSummary`) and the
  property-detail net-balance (`MultifamilyCards.NetBalanceCard`) all call this — the **same** figure
  on both screens.
- iOS `HousingSnapshotCard.swift` switches from all-units to `occupiedMonthlyRentCents`; the value must
  equal the web result for the same fixture.
- **Parity vector** `housing-net-rental.json` (see data-model.md) is asserted by both suites.

## C7 — Occupancy is deliberate (web `MultifamilyCards.tsx` / `AddPropertyModal.tsx`; iOS editor)

- A unit's rent counts toward `occupiedRentCents` unless the unit is **explicitly** marked vacant.
- `isVacant` semantics (empty tenant name ⇒ vacant) are unchanged at the storage layer; the editor
  surfaces the choice so a rent-earning unit isn't dropped by a blank optional field.

## C8 — Non-goals / must-not

- No change to `monthlyPaymentCents` / `currentPrincipalBalanceCents` / `currentEquityCents` /
  `equityFraction` / `maturityDate` / `yearsRemaining` outputs (existing `mortgage.json` stays green).
- No DB migration, no new stored column, no change to iOS date/amortization behavior (already correct),
  no redesign of Housing UI, no new palette/token.

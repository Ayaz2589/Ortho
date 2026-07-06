# Research & Decisions: Housing Correctness & Parity Fixes

All "unknowns" here were resolved during the deep review that produced this feature; this file
records the decisions, rationale, and rejected alternatives so the plan is auditable.

## D1 — Local calendar-date parsing for all Housing date-only values

**Decision**: Promote the existing `parseLocalDate(s)` helper (currently private in
`web/lib/finance/mortgage.ts`) into `web/lib/format.ts` (the date-helper module that already holds
`startOfDay`, `mediumDate`, `monthYear`). Route every stored-date interpretation through it:
`lease.ts` (`rentDueDay`, `daysUntilNextRent`, `daysUntilEnd`), `RentalCards.tsx` (lease start/end +
payment date display), and `MortgageCards.tsx` (closing-date caption). `mortgage.ts` imports it back
from `format.ts`.

**Rationale**: `new Date('YYYY-MM-DD')` is parsed as **UTC midnight** by spec; read in a negative-UTC
timezone it becomes the previous day. iOS decodes the same `date` columns with a `.current`-timezone
`DateFormatter`, i.e. **local** calendar dates, and is correct. `docs/shared.md` already documents the
invariant ("mortgage dates parse as **local** calendar dates on both sides") — the lease/display code
simply never honored it. Reusing the one helper avoids a second parser.

**Alternatives rejected**: (a) manual `+tzoffset` math at each site — error-prone, duplicated;
(b) switch storage to timestamptz — a schema change, explicitly out of scope; (c) a new date library —
unnecessary for a one-line parse.

## D2 — Month-length clamp for the rent-due day

**Decision**: In `daysUntilNextRent`, when constructing the candidate due date, clamp the due day to
the target month's length (`min(dueDay, daysInMonth)`) instead of letting `new Date(y, m, 31)` roll
into the next month.

**Rationale**: A lease whose start day is the 31st should be "due" on the last day of a 30-day month,
not the 1st of the next month; the current overflow produces an off-by-1–3-day countdown.

**Alternatives rejected**: leaving overflow (wrong countdown); introducing a separate due-date entity
(over-engineered).

## D3 — Amortization month-label iteration

**Decision**: In `upcomingAmortization`, advance each row's month by proper calendar addition with a
day clamp — mirroring Swift `Calendar.date(byAdding: .month, value: i, to: base)` — rather than
`month.setMonth(month0.getMonth() + i)` on a fixed base date.

**Rationale**: JS `setMonth` overflows short months (Jan 31 + 1mo → Mar 3), so the schedule skips
February/April and duplicates March when viewed at month-end. iOS clamps (Jan 31 + 1mo → Feb 28/29)
and is correct. Only the month **label** is affected — principal/interest values are unchanged and
stay vector-locked. The golden vector strips the `month` field, so this was invisible to the parity
test; the fix adds explicit month-sequence coverage.

**Alternatives rejected**: normalizing the base to the 1st (changes the displayed day, diverges from
iOS which keeps the day clamped).

## D4 — Interest-rate precision on property edit

**Decision (web)**: Load the mortgage rate into the edit form **faithfully** from the stored
`numeric(7,4)` value (render the exact stored number, trimming only trailing zeros) instead of
`.toFixed(2)`, and round-trip it losslessly on save.
**Decision (iOS)**: Verify `AddPropertySheet.formatPercent(...)` (the rate prefill) does not truncate
to two decimals; if it does (e.g. `String(format: "%.2f", …)`), widen it to preserve the stored
precision, mirroring the web fix.

**Rationale**: `numeric(7,4)` can hold e.g. 6.3750; `.toFixed(2)` rewrites it to 6.38 on any no-op
save, silently changing every derived figure. The store persists whatever the form holds, so the form
must hold the true value.

**Alternatives rejected**: rounding stored data to 2 decimals in a migration (data loss, schema/data
change, out of scope).

## D5 — Unify net rental income on the occupied-only computation

**Decision**: Introduce a single pure computation used by every surface:
`occupiedRentCents(units)` and `netRentalCents(units, mortgagePaymentCents)` = occupied rent −
mortgage payment. Web: new `web/lib/finance/housing.ts`, consumed by `HousingSnapshotCard`,
`DashboardDesktop.housingSummary`, and `MultifamilyCards.NetBalanceCard`. iOS: `Property.swift`
already exposes `occupiedMonthlyRentCents` and the occupied-only net — the only change is switching the
**Dashboard** `HousingSnapshotCard.swift` from `p.units.reduce{…}` (all units) to the occupied-only
helper. The figure is never gated on a mortgage (a paid-off multifamily still nets its occupied rent).

**Rationale**: The Dashboard summing all units (incl. vacant) while the detail page sums occupied-only
produces different, sometimes opposite-signed, figures for the same building. The occupied-only number
is the truthful "collected" figure and is what the detail card and the canonical iOS model already use
("Vacant units contribute zero — their monthlyRent is the asking number, not money you're collecting").

**Alternatives rejected**: unify on all-units (overstates income, contradicts the iOS model); show two
figures (adds density; the "Net" must be the collected number).

## D6 — Deliberate vacancy in the unit editor

**Decision**: Make vacancy an explicit choice in the multifamily unit editor (a Vacant/Occupied
control) so a rent-earning unit is never dropped merely because the optional tenant name was left
blank. Keep the underlying storage convention ("empty tenant name ⇒ vacant") unchanged — **no schema
change** — so `isVacant` semantics are stable; the UI just makes the state deliberate.

**Rationale**: Occupancy is inferred from a non-empty `tenant_name`, but the form labels tenant
"Optional", inviting silent rent loss. A dedicated `occupied` column would be cleaner but is a schema
change (deferred). An explicit toggle removes the footgun with zero migration.

**Alternatives rejected**: (a) `units.occupied` boolean column — schema change, out of scope;
(b) require a tenant name always — forces naming a tenant you may not track; (c) count all units'
rent — that's the rejected D5 direction.

## D7 — Golden vector for the shared net-rental math

**Decision**: Add a **new** vector file `shared/test-vectors/housing-net-rental.json`, generated by
`gen-vectors.ts` from `web/lib/finance/housing.ts`, asserted by a new web
`test/housing-net-rental.parity.test.ts` and a new iOS `HousingNetRentalParityTests.swift`. Shape is
platform-neutral: each case is `{ input: { units: [{ rentCents, occupied }], mortgagePaymentCents },
expected: { occupiedRentCents, netRentalCents } }`. Cases: all-occupied, some-vacant, all-vacant,
empty units, no-mortgage (paymentCents 0), and the opposite-sign fixture from the review.

**Rationale**: Net rental is now shared money logic across two languages; per constitution VI and the
parity system it must be pinned by a vector so neither side drifts. Keeping occupancy as a resolved
`occupied` boolean in the vector cleanly separates the vectored math (FR-005) from the per-platform
occupancy model (FR-008, D6).

**Cost/consequence**: A **new** vector file requires a `project.pbxproj` Copy-Bundle-Resources entry so
the iOS test can read it (per `CI-SETUP.local.md` §6). The pbxproj is plain text and is hand-editable
from Linux by copying an existing vector entry's shape (PBXFileReference + PBXBuildFile + test-resources
group + Resources build phase). CI validates the result.

**Alternatives rejected**: extend `mortgage.json` (wrong domain — that file is MortgageInfo math);
leave net-rental unvectored (the two surfaces could silently diverge again — the exact bug we're fixing).

## D8 — iOS build/validation strategy

**Decision**: Web is built and tested locally (`npm test`, timezone-pinned where needed). iOS is
validated only via the `ios-ci.yml` macOS GitHub Actions run after push (`gh run watch`). The new
vector's pbxproj entry and the Swift mirror/tests are validated on that run.

**Rationale**: The Linux sandbox has no Xcode. This is the established loop (`docs/index.md`,
`CI-SETUP.local.md`).

**Operational note**: The user runs Xcode against this same working tree, so `project.pbxproj` and any
`Localizable.xcstrings` edits can trigger a "backing file modified outside Xcode" warning on their side
— they must take the **file-system** version (Revert/reopen), never "Keep Xcode Version", or our target
registrations are dropped.

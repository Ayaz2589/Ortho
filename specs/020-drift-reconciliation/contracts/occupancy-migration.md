# Contract: Occupancy Migration (P4)

## Migration — `supabase/migrations/<ts>_unit_occupied.sql`
- `ALTER TABLE units ADD COLUMN occupied boolean NOT NULL DEFAULT true;`
- Backfill in the same migration so existing nets are unchanged:
  `UPDATE units SET occupied = (tenant_name IS NOT NULL AND btrim(tenant_name) <> '');`
- Forward-only, heavily commented per repo convention; references spec 020 / completes 019 US5.
- No RLS change (inherits `units` household-member policies).

## Client contract
- **web** `lib/types.ts`: `Unit.occupied: boolean`. `lib/finance/housing.ts` `rentUnitsFrom` → `occupied: u.occupied`. `components/housing/AddPropertyModal.tsx`: unit editor gains an Occupied/Vacant control; new units default occupied. Save writes `occupied`.
- **iOS** `Models/Unit.swift`: `occupied: Bool` (CodingKey `occupied`). `Property.occupiedMonthlyRentCents` / `HousingMath` read `unit.occupied`. `Features/Housing/AddPropertySheet.swift`: matching toggle (tokens-only, ≥44px, real control).
- **Both** desktop + mobile paths (web `HousingDesktop.tsx` net path; iOS dashboard + detail) read the same occupied-only net — already centralized post-019.

## Copy
- Helper text "…net balance is **total** unit rent minus the mortgage payment" → "**occupied** unit rent" in: web `AddPropertyModal.tsx`, iOS `AddPropertySheet.swift`, iOS `Localizable.xcstrings`, and the 5 web catalogs (`lib/i18n/*`). New "Occupied"/"Vacant" labels added as shared keys (coordinate with P5 catalog reorg + the catalog-parity lock).

## Invariants
- **No net changes on migration** (backfill == current inference).
- `housing-net-rental.json` byte-identical (pure functions untouched).
- Net counts occupied units only; dashboard == detail on both platforms (existing vector + a vacant-unit assertion).

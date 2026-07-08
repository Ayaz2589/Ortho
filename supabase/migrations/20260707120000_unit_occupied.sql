-- Feature 020: explicit unit occupancy (completes deferred 019 US5).
-- Occupancy was inferred from whether a unit's `tenant_name` was non-blank, so a
-- rent-earning unit whose tenant name was left unrecorded was silently treated as
-- vacant and dropped from net rental income. Add an explicit `occupied` flag and
-- backfill it from the CURRENT inference, so no property's displayed net changes
-- on migration. Additive + reversible; inherits the existing `units` household
-- RLS (no policy change).

alter table units
  add column if not exists occupied boolean not null default true;

-- Backfill to match the current tenant-name inference EXACTLY (a non-blank
-- tenant_name ⇒ occupied). This keeps every existing property's net identical;
-- the clients (web `rentUnitsFrom`, iOS `HousingMath`) read this column going
-- forward and fall back to the same inference for any row not yet migrated.
update units
set occupied = (tenant_name is not null and btrim(tenant_name) <> '');

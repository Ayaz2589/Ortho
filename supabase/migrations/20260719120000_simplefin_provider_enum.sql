-- ============================================================================
-- Spec 028 — SimpleFIN provider seam: enum value only
-- ============================================================================
-- A second aggregation provider is added as an ISOLATED `alter type ... add
-- value` migration, never referenced in the same file (the 20260522170000
-- pattern the 024 migration calls out). Postgres cannot use a freshly-added
-- enum value later in the SAME transaction, so the columns + RPCs that insert
-- provider='simplefin' live in the next migration (20260719120001).
-- ============================================================================

alter type public.linked_provider add value if not exists 'simplefin';

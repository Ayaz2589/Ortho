-- Ortho — per-person budgets (spec 054)
-- Created: 2026-08-16
--
-- Budget LIMITS gain the PEOPLE axis that spec 051 gave to spend. A budget row
-- may now belong to one household person instead of the household as a whole:
--
--   person_id IS NULL      — a HOUSEHOLD budget. This is what every existing row
--                            is, and its meaning is unchanged.
--   person_id = <person>   — that person's own limit for the category, measured
--                            against their scoped share of household spending
--                            (lib/scope/moneyScope.ts).
--
-- Additive and backward-compatible: no backfill, no data movement, and a client
-- that predates this migration keeps working (it just never sends the column).
-- RLS is untouched — a budget is still readable/writable by any household member,
-- because Ortho has no per-member privacy boundary at the DB level (a personal
-- budget is an attribution, not a secret; see spec 044 research).

alter table public.budgets
  add column person_id uuid references public.household_people(id) on delete cascade;

comment on column public.budgets.person_id is
  'Whose budget this is (spec 054): null = the household''s; a person id = that person''s own limit for the category. People are soft-deleted (removed_at), so the cascade rarely fires — a removed person''s budgets simply stop being reachable.';

create index budgets_person_idx on public.budgets (person_id);

-- One budget per (household, category, person). NULLS NOT DISTINCT is load-bearing:
-- the default (NULLS DISTINCT) treats every null person as a different value, which
-- would let a household accumulate duplicate SHARED budgets for one category — the
-- exact invariant the old two-column constraint existed to enforce. It also keeps
-- PostgREST's upsert working unchanged: on_conflict=household_id,category,person_id
-- infers this constraint for the null and non-null cases alike.
-- (Requires Postgres 15+; this project runs 17.)
alter table public.budgets drop constraint budgets_household_id_category_key;

alter table public.budgets
  add constraint budgets_household_category_person_key
  unique nulls not distinct (household_id, category, person_id);

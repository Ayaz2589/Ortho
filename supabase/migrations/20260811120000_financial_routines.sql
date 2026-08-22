-- spec 044: Financial Routines
-- Four new tables backing recurring-charge/behavioral-habit routine detection and its optional
-- location booster. Detection itself is derived live from transactions (never stored — see
-- specs/044-financial-routines/data-model.md); only genuinely user-authored state persists.
--
-- Household-scoped (RLS via public.is_household_member, matching transactions/budgets/goals — NOT
-- user_id = auth.uid(); research.md found no existing per-member privacy boundary for household
-- data to mirror, so routine visibility is a UI-layer filter, not a new RLS pattern):
--   * recognized_routine_states: a user's confirm/dismiss/rename decision on a detected routine.
--   * merchant_geocodes: a household-level cache of merchant-name → place lookups.
-- User-scoped (RLS user_id = auth.uid(), mirrors 20260806120000_financial_health_profile.sql —
-- genuinely private, not household-shared):
--   * user_location_consent: the 3-tier opt-in level (off/geocoding/foreground_capture).
--   * user_routine_visits: opportunistic foreground location captures.
-- Enum-like columns use CHECK constraints (cheaper to evolve than Postgres enum types), matching
-- recent additive tables. See specs/044-financial-routines/data-model.md.

-- 1. Durable confirm/dismiss/rename state for a detected routine (keyed by the engine's
--    deterministic routine_key, not a routine id — there is no "routines" table; routines are
--    computed on read).
create table public.recognized_routine_states (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  routine_key  text not null,
  status       text not null
                 check (status in ('confirmed','dismissed')),
  label        text,
  person_id    uuid references public.household_people(id) on delete set null,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, routine_key)
);
create index recognized_routine_states_household_idx on public.recognized_routine_states (household_id);

-- 2. Household-level merchant-name → place cache (FR-012 baseline geocoding enrichment).
create table public.merchant_geocodes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  merchant_key text not null,
  latitude     double precision,
  longitude    double precision,
  label        text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (household_id, merchant_key)
);

-- 3. One location-consent record per user (off by default).
create table public.user_location_consent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  level      text not null default 'off'
               check (level in ('off','geocoding','foreground_capture')),
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- 4. Opportunistic foreground location captures (only written while level = 'foreground_capture').
create table public.user_routine_visits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid not null references public.households(id) on delete cascade,
  captured_at     timestamptz not null default now(),
  latitude        double precision not null,
  longitude       double precision not null,
  accuracy_meters real,
  created_at      timestamptz not null default now()
);
create index user_routine_visits_user_idx on public.user_routine_visits (user_id, captured_at);

-- RLS: household-membership on the two household-scoped tables.
alter table public.recognized_routine_states enable row level security;
create policy recognized_routine_states_select on public.recognized_routine_states
  for select using (public.is_household_member(household_id));
create policy recognized_routine_states_insert on public.recognized_routine_states
  for insert with check (public.is_household_member(household_id));
create policy recognized_routine_states_update on public.recognized_routine_states
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy recognized_routine_states_delete on public.recognized_routine_states
  for delete using (public.is_household_member(household_id));

alter table public.merchant_geocodes enable row level security;
create policy merchant_geocodes_select on public.merchant_geocodes
  for select using (public.is_household_member(household_id));
create policy merchant_geocodes_insert on public.merchant_geocodes
  for insert with check (public.is_household_member(household_id));
create policy merchant_geocodes_update on public.merchant_geocodes
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy merchant_geocodes_delete on public.merchant_geocodes
  for delete using (public.is_household_member(household_id));

-- RLS: private to the owning user on the two user-scoped tables.
alter table public.user_location_consent enable row level security;
create policy user_location_consent_select on public.user_location_consent
  for select using (user_id = auth.uid());
create policy user_location_consent_insert on public.user_location_consent
  for insert with check (user_id = auth.uid());
create policy user_location_consent_update on public.user_location_consent
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_location_consent_delete on public.user_location_consent
  for delete using (user_id = auth.uid());

alter table public.user_routine_visits enable row level security;
create policy user_routine_visits_select on public.user_routine_visits
  for select using (user_id = auth.uid());
create policy user_routine_visits_insert on public.user_routine_visits
  for insert with check (user_id = auth.uid());
create policy user_routine_visits_update on public.user_routine_visits
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_routine_visits_delete on public.user_routine_visits
  for delete using (user_id = auth.uid());

-- 5. Extend the health_dimension vocabulary (user_dimension_weights.dimension CHECK) with the new
--    sixth dimension. financial_health_snapshots.band is unaffected (band values are unchanged).
alter table public.user_dimension_weights drop constraint user_dimension_weights_dimension_check;
alter table public.user_dimension_weights add constraint user_dimension_weights_dimension_check
  check (dimension in ('cash_flow','safety_net','commitment_load','savings_momentum','plan_engagement','routine_awareness'));

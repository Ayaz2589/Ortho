-- spec 041: Financial Health profile
-- Four USER-SCOPED tables (RLS user_id = auth.uid()) backing the baseline
-- financial-health metric. Unlike cards/budgets (household-scoped), a financial
-- profile is a private per-account self-assessment. The score itself is derived
-- live in the client (never stored); only raw questionnaire answers + append-only
-- band snapshots persist. All money is integer USD cents. Enum-like columns use
-- CHECK constraints (cheaper to evolve than Postgres enum types), matching recent
-- additive tables. See specs/041-financial-health/data-model.md.

-- 1. One financial profile per user.
create table public.user_financial_profile (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  monthly_income_cents      integer not null default 0 check (monthly_income_cents >= 0),
  income_is_variable        boolean not null default false,
  income_low_estimate_cents integer,
  housing_type              text not null default 'rent'
                              check (housing_type in ('rent','own','family','none')),
  housing_cost_cents        integer,
  housing_share_fraction    numeric(5,4) not null default 1.0,
  savings_target_fraction   numeric(5,4) not null default 0.10,
  emergency_fund_level      text not null default 'none'
                              check (emergency_fund_level in ('none','under_1m','1_3m','3_6m','6m_plus')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id)
);

-- 2. Zero-to-many recurring monthly commitments beyond housing (remittances first-class).
create table public.user_fixed_costs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text not null,
  amount_cents integer not null check (amount_cents > 0),
  kind         text not null default 'other'
                 check (kind in ('remittance','loan','phone','transit','childcare','subscription','other')),
  created_at   timestamptz not null default now()
);
create index user_fixed_costs_user_idx on public.user_fixed_costs (user_id);

-- 3. One 1..5 importance weight per user per health dimension.
create table public.user_dimension_weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  dimension  text not null
               check (dimension in ('cash_flow','safety_net','commitment_load','savings_momentum','plan_engagement')),
  weight     smallint not null default 3 check (weight between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, dimension)
);

-- 4. Append-only band/score snapshots for the "you moved from Building → Steady" story.
create table public.financial_health_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  score      smallint not null check (score between 0 and 100),
  band       text not null
               check (band in ('strong','steady','building','getting_started')),
  created_at timestamptz not null default now()
);
create index financial_health_snapshots_user_idx on public.financial_health_snapshots (user_id, created_at);

-- RLS: private to the owning user (user_id = auth.uid()) on all four tables.
alter table public.user_financial_profile enable row level security;
create policy user_financial_profile_select on public.user_financial_profile
  for select using (user_id = auth.uid());
create policy user_financial_profile_insert on public.user_financial_profile
  for insert with check (user_id = auth.uid());
create policy user_financial_profile_update on public.user_financial_profile
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_financial_profile_delete on public.user_financial_profile
  for delete using (user_id = auth.uid());

alter table public.user_fixed_costs enable row level security;
create policy user_fixed_costs_select on public.user_fixed_costs
  for select using (user_id = auth.uid());
create policy user_fixed_costs_insert on public.user_fixed_costs
  for insert with check (user_id = auth.uid());
create policy user_fixed_costs_update on public.user_fixed_costs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_fixed_costs_delete on public.user_fixed_costs
  for delete using (user_id = auth.uid());

alter table public.user_dimension_weights enable row level security;
create policy user_dimension_weights_select on public.user_dimension_weights
  for select using (user_id = auth.uid());
create policy user_dimension_weights_insert on public.user_dimension_weights
  for insert with check (user_id = auth.uid());
create policy user_dimension_weights_update on public.user_dimension_weights
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_dimension_weights_delete on public.user_dimension_weights
  for delete using (user_id = auth.uid());

alter table public.financial_health_snapshots enable row level security;
create policy financial_health_snapshots_select on public.financial_health_snapshots
  for select using (user_id = auth.uid());
create policy financial_health_snapshots_insert on public.financial_health_snapshots
  for insert with check (user_id = auth.uid());
create policy financial_health_snapshots_update on public.financial_health_snapshots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy financial_health_snapshots_delete on public.financial_health_snapshots
  for delete using (user_id = auth.uid());

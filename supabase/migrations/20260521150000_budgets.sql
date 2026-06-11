-- Ortho — budgets
-- Created: 2026-05-21
--
-- Per-household monthly spending limit per category. One row per
-- (household_id, category) — UNIQUE constraint enforces it. Drives the
-- budget-status rule in the InsightEngine and the BudgetProgressCard
-- widget on the Dashboard. Amounts in USD cents like every other money
-- column in the schema.

create table public.budgets (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  category             transaction_category not null,
  monthly_limit_cents  bigint not null check (monthly_limit_cents >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (household_id, category)
);

create index budgets_household_idx on public.budgets (household_id);

create trigger budgets_touch_updated_at
  before update on public.budgets
  for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;

-- Members of the household can read + manage that household's budgets.
-- Reuses the existing is_household_member helper (security definer).
create policy budgets_member_select on public.budgets
  for select using (public.is_household_member(household_id));

create policy budgets_member_insert on public.budgets
  for insert with check (public.is_household_member(household_id));

create policy budgets_member_update on public.budgets
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy budgets_member_delete on public.budgets
  for delete using (public.is_household_member(household_id));

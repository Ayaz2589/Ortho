-- spec 033: income deposit accounts
-- Mirrors the `cards` table — a household-scoped list of user-defined deposit
-- account names (e.g. "Chase Checking", "Joint Savings"). Income transactions
-- store the chosen name in the existing `transactions.source` text column;
-- no schema change to `transactions` is required.

create table public.deposit_accounts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create index deposit_accounts_household_idx on public.deposit_accounts (household_id);

alter table public.deposit_accounts enable row level security;

create policy deposit_accounts_member_select on public.deposit_accounts
  for select using (public.is_household_member(household_id));

create policy deposit_accounts_member_insert on public.deposit_accounts
  for insert with check (public.is_household_member(household_id));

create policy deposit_accounts_member_update on public.deposit_accounts
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy deposit_accounts_member_delete on public.deposit_accounts
  for delete using (public.is_household_member(household_id));

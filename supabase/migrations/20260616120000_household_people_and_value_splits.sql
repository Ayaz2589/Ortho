-- Ortho — simplified households + value splits (feature 007-household-splits)
-- Created: 2026-06-16
--
-- Collapses the personal/shared scope model into one household ledger of
-- name-only PEOPLE, and moves splits from percent to authoritative cents.
--
--   * household_people: name-only members (optional link to an auth user).
--   * transaction_shares: (transaction_id, person_id, amount_cents) — one row
--     per owner, summing to the transaction amount. percent/user_id dropped.
--   * transactions: scope dropped, household_id NOT NULL.
--   * RLS + aggregate RPCs simplified to household membership + cents sums.
--
-- Forward-only (data is early/personal; loss-free backfill). Reviewed before
-- apply; quickstart §6 sum-check verifies integrity afterwards.

-- ============================================================================
-- 1. household_people  (+ backfill from household_members)
-- ============================================================================

create table public.household_people (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null,
  initial        text not null,
  color_key      text not null,
  linked_user_id uuid references public.users(id) on delete set null,
  sort_order     int  not null default 0,
  removed_at     timestamptz,                 -- soft-remove: hidden from pickers, history kept
  created_at     timestamptz not null default now(),
  unique (household_id, linked_user_id)
);
create index household_people_household_idx on public.household_people (household_id);

-- One person per existing membership, linked to the auth user, in join order.
insert into public.household_people (household_id, name, initial, color_key, linked_user_id, sort_order)
select hm.household_id,
       u.name,
       u.initial,
       u.color_key,
       u.id,
       (row_number() over (partition by hm.household_id order by hm.created_at) - 1)::int
  from public.household_members hm
  join public.users u on u.id = hm.user_id;

-- ============================================================================
-- 2. transaction_shares -> cents per person
-- ============================================================================

alter table public.transaction_shares add column person_id    uuid references public.household_people(id) on delete restrict;
alter table public.transaction_shares add column amount_cents bigint check (amount_cents >= 0);

-- 2a. Map existing (shared) percent rows to the linked person + rounded cents.
-- (Comma-join with all correlations in WHERE — a JOIN's ON clause may not
-- reference the UPDATE target table `s` in Postgres.)
update public.transaction_shares s
   set person_id    = hp.id,
       amount_cents = round(t.amount_cents * s.percent / 100.0)::bigint
  from public.transactions t, public.household_people hp
 where s.transaction_id = t.id
   and hp.household_id = t.household_id
   and hp.linked_user_id = s.user_id;

-- Loosen the legacy shape (PK on user_id + NOT NULLs) so 2b can insert
-- person-only rows. The columns are dropped entirely in 2d.
alter table public.transaction_shares drop constraint transaction_shares_pkey;
alter table public.transaction_shares alter column user_id drop not null;
alter table public.transaction_shares alter column percent drop not null;

-- 2b. Transactions with no share rows (personal + shared single-owner): one
--     full-amount row owned by the creator's person.
insert into public.transaction_shares (transaction_id, person_id, amount_cents)
select t.id,
       hp.id,
       t.amount_cents
  from public.transactions t
  join public.household_people hp on hp.linked_user_id = t.created_by
 where not exists (
   select 1 from public.transaction_shares s where s.transaction_id = t.id
 )
 -- the creator's person must be in the transaction's household
 and hp.household_id = coalesce(t.household_id, hp.household_id);

-- Drop any shares whose user_id didn't map to a person (orphans, e.g. a since-
-- removed member). The reconcile below redistributes their amount to the rest.
delete from public.transaction_shares where person_id is null;

-- 2c. Reconcile rounding so each transaction's shares sum to its amount: assign
--     any difference to the lowest-sort_order person (the deterministic "first
--     owner" used by computeShares).
with diff as (
  select t.id as tx_id,
         t.amount_cents - coalesce(sum(s.amount_cents), 0) as delta
    from public.transactions t
    left join public.transaction_shares s on s.transaction_id = t.id
   group by t.id, t.amount_cents
), first_owner as (
  select s.transaction_id, s.person_id,
         row_number() over (
           partition by s.transaction_id
           order by hp.sort_order, hp.id
         ) as rn
    from public.transaction_shares s
    join public.household_people hp on hp.id = s.person_id
)
update public.transaction_shares s
   set amount_cents = s.amount_cents + d.delta
  from diff d
  join first_owner fo on fo.transaction_id = d.tx_id and fo.rn = 1
 where s.transaction_id = d.tx_id
   and s.person_id = fo.person_id
   and d.delta <> 0;

-- 2d. Finalize the new shape (the legacy PK was already dropped above).
alter table public.transaction_shares drop column percent;
alter table public.transaction_shares drop column user_id;
alter table public.transaction_shares alter column person_id    set not null;
alter table public.transaction_shares alter column amount_cents set not null;
alter table public.transaction_shares add primary key (transaction_id, person_id);
create index transaction_shares_person_idx on public.transaction_shares (person_id);

-- ============================================================================
-- 3. transactions -> drop scope, household_id NOT NULL
-- ============================================================================

-- Drop the scope↔household invariant first so personal rows can take a
-- household_id during backfill.
alter table public.transactions drop constraint scope_matches_household;

-- Personal rows had household_id null: attribute to the creator's household.
update public.transactions t
   set household_id = (
     select hm.household_id from public.household_members hm
      where hm.user_id = t.created_by
      limit 1
   )
 where t.household_id is null;

-- The old RLS policies (on both tables) reference `scope`, so they must be
-- dropped before the column can be removed.
drop policy transactions_select on public.transactions;
drop policy transactions_insert on public.transactions;
drop policy transactions_update on public.transactions;
drop policy transactions_delete on public.transactions;
drop policy transaction_shares_select on public.transaction_shares;
drop policy transaction_shares_write  on public.transaction_shares;

alter table public.transactions drop column scope;
alter table public.transactions alter column household_id set not null;

drop type transaction_scope;

-- ============================================================================
-- 4. RLS rewrite — household membership only (no scope branches)
-- ============================================================================

create policy transactions_select on public.transactions
  for select using (public.is_household_member(household_id));

create policy transactions_insert on public.transactions
  for insert with check (
    created_by = auth.uid()
    and public.is_household_member(household_id)
  );

create policy transactions_update on public.transactions
  for update using (
    created_by = auth.uid() or public.is_household_owner(household_id)
  )
  with check (
    created_by = auth.uid() or public.is_household_owner(household_id)
  );

create policy transactions_delete on public.transactions
  for delete using (
    created_by = auth.uid() or public.is_household_owner(household_id)
  );

create policy transaction_shares_select on public.transaction_shares
  for select using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and public.is_household_member(t.household_id)
    )
  );

create policy transaction_shares_write on public.transaction_shares
  for all
  using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
    )
  )
  with check (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
    )
  );

-- household_people: visible/writable by members of the household.
alter table public.household_people enable row level security;

create policy household_people_select on public.household_people
  for select using (public.is_household_member(household_id));

create policy household_people_write on public.household_people
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================================
-- 5. Aggregate RPCs — per-person cents sums (replace percent weighting)
-- ============================================================================

-- Per-person split expense: a plain sum of the materialized cents shares. The
-- old "no share rows -> creator 100%" branch is gone (rows are always present).
drop function if exists public.household_owner_spend(uuid, timestamptz, timestamptz);

create or replace function public.household_owner_spend(
  p_household_id uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table(person_id uuid, cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.person_id, sum(s.amount_cents)::bigint as cents
    from public.transactions t
    join public.transaction_shares s on s.transaction_id = t.id
   where t.household_id = p_household_id
     and t.kind = 'expense'
     and t.date >= p_start and t.date < p_end
     and public.is_household_member(p_household_id)
   group by s.person_id;
$$;

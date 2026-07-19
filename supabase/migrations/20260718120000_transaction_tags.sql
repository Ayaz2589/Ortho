-- ============================================================================
-- Spec 027 — Transaction tags & richer notes
-- ============================================================================
-- Free-form, household-scoped labels ORTHOGONAL to category, plus a per-
-- transaction free-form notes column. Mirrors the household_people (roster) +
-- transaction_shares (join) pattern already used for people/splits:
--   tags             — the per-household label roster; members read/write
--                      (like cards/budgets/household_people).
--   transaction_tags — many-to-many join (a SET: each (transaction_id, tag_id)
--                      at most once); read/write piggyback on the parent
--                      transaction's visibility/writability (like
--                      transaction_shares).
--   transactions.notes — nullable free-form note (distinct from `source`,
--                      which names the card/account that paid).
--
-- Client-side invariants (NOT enforced by SQL beyond the unique index):
--   * tag identity = trimmed, case-insensitive name within a household
--     (the unique index below is the backstop; clients dedup optimistically).
--   * transaction_tags carries NO sum invariant (unlike transaction_shares) —
--     a failed tag write never rolls back the parent transaction.
--
-- Deliberately touches NO existing enum/policy and adds only a nullable column
-- to `transactions`, so every existing row/behaviour is unchanged (additive).
-- Ordering: alter → tables → indexes → RLS enable → policies → grants.
-- ============================================================================

-- ============================================================================
-- 1. transactions.notes (additive, nullable)
-- ============================================================================
alter table public.transactions add column notes text;

-- ============================================================================
-- 2. tags — the per-household label roster
-- ============================================================================
create table public.tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 50),
  created_at   timestamptz not null default now()
);

-- Case-insensitive uniqueness per household: "Work", "work", "work " collapse
-- to one tag (the dedup backstop behind the client's optimistic reuse).
create unique index tags_household_lower_name_idx on public.tags (household_id, lower(btrim(name)));
create index tags_household_id_idx on public.tags (household_id);

-- ============================================================================
-- 3. transaction_tags — the many-to-many join (a set)
-- ============================================================================
create table public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create index transaction_tags_tag_id_idx on public.transaction_tags (tag_id);

-- ============================================================================
-- 4. RLS
-- ============================================================================
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;

-- tags: visible/writable by members of the owning household (cards/budgets pattern).
create policy tags_select on public.tags
  for select using (public.is_household_member(household_id));

create policy tags_write on public.tags
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- transaction_tags: piggyback on the parent transaction (transaction_shares pattern).
create policy transaction_tags_select on public.transaction_tags
  for select using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_tags.transaction_id
         and public.is_household_member(t.household_id)
    )
  );

create policy transaction_tags_write on public.transaction_tags
  for all
  using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_tags.transaction_id
         and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
    )
  )
  with check (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_tags.transaction_id
         and (t.created_by = auth.uid() or public.is_household_owner(t.household_id))
    )
  );

-- ============================================================================
-- 5. Explicit grants
-- ============================================================================
-- Newer Supabase stacks (verified on the local PG17 stack, spec 024) no longer
-- auto-grant DML on newly created public tables. Grant exactly what each role
-- needs so this behaves identically on old (permissive) and new ACL regimes.
-- Clients write transaction_tags directly (RLS still gates by household), so
-- `authenticated` gets DML on both tables — the transaction_shares posture.
grant select, insert, update, delete on public.tags             to authenticated;
grant select, insert, update, delete on public.transaction_tags to authenticated;
grant select, insert, update, delete on public.tags             to service_role;
grant select, insert, update, delete on public.transaction_tags to service_role;

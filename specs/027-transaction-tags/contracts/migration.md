# Contract: Migration `20260718120001_transaction_tags.sql`

The exact schema contract. The implementation SQL must match this shape (comments abbreviated here;
the real file carries the full heavily-commented header per repo convention).

```sql
-- Spec 027 — Transaction tags & richer notes.
-- Free-form, household-scoped labels orthogonal to category, plus a notes column.
-- Mirrors the household_people (roster) + transaction_shares (join) pattern.
-- Client invariants (not enforced by SQL beyond the unique index):
--   * tag identity = trimmed, case-insensitive name within a household
--   * transaction_tags is a set (each (transaction_id, tag_id) at most once)
--   * tags carry NO sum invariant (unlike transaction_shares)

-- 1. notes column (additive, nullable)
alter table public.transactions add column notes text;

-- 2. tags roster
create table public.tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 50),
  created_at   timestamptz not null default now()
);
create unique index tags_household_lower_name_idx on public.tags (household_id, lower(btrim(name)));
create index tags_household_id_idx on public.tags (household_id);

-- 3. transaction_tags join (set)
create table public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);
create index transaction_tags_tag_id_idx on public.transaction_tags (tag_id);

-- 4. RLS
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;

create policy tags_select on public.tags
  for select using (public.is_household_member(household_id));
create policy tags_write on public.tags
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

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

-- 5. Explicit grants (new PG17 stacks don't auto-grant DML — spec 024 lesson)
grant select, insert, update, delete on public.tags             to authenticated;
grant select, insert, update, delete on public.transaction_tags to authenticated;
grant select, insert, update, delete on public.tags             to service_role;
grant select, insert, update, delete on public.transaction_tags to service_role;
```

## Acceptance

- `supabase db reset` replays all migrations including this one with no error.
- A household member (RLS `authenticated`) can `insert`/`select`/`delete` their own household's `tags` and `transaction_tags`, and cannot see another household's.
- The `tags_household_lower_name_idx` rejects a second `('work')` when `('Work')` exists in the same household.
- `transactions.notes` accepts `null` and text; existing rows read back `null`.

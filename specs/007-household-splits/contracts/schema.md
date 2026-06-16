# Contract: Schema migration (Supabase / Postgres)

One forward migration `supabase/migrations/<ts>_household_people_and_value_splits.sql`. Money in
`bigint` cents. Order: new table → shares alter+backfill → transactions alter+backfill → drop
enum → RLS rewrite → RPC update. Reviewed before apply (loss-free backfill of early data).

## 1. `household_people`

```sql
create table public.household_people (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null,
  initial        text not null,
  color_key      text not null,
  linked_user_id uuid references public.users(id) on delete set null,
  sort_order     int not null default 0,
  removed_at     timestamptz,            -- soft-remove: hidden from pickers, history preserved
  created_at     timestamptz not null default now(),
  unique (household_id, linked_user_id)  -- at most one person per real account
);
create index household_people_household_idx on public.household_people (household_id);
```

Backfill: one person per `household_members` row, copying `users.name/initial/color_key`,
`linked_user_id = user_id`, `sort_order` by member `created_at`.

## 2. `transaction_shares` → cents per person

```sql
alter table public.transaction_shares add column person_id    uuid references public.household_people(id) on delete restrict;
alter table public.transaction_shares add column amount_cents bigint check (amount_cents >= 0);
-- backfill existing percent rows → person + cents (remainder-corrected so rows sum to amount)
-- + insert a full-amount row for every transaction lacking shares (former personal/single-owner)
-- then:
alter table public.transaction_shares drop constraint transaction_shares_pkey;
alter table public.transaction_shares drop column percent;
alter table public.transaction_shares drop column user_id;
alter table public.transaction_shares alter column person_id    set not null;
alter table public.transaction_shares alter column amount_cents set not null;
alter table public.transaction_shares add primary key (transaction_id, person_id);
create index transaction_shares_person_idx on public.transaction_shares (person_id);
```

Invariant (client/RPC-enforced, quickstart-verified): `Σ amount_cents per transaction =
transactions.amount_cents`; every transaction has ≥1 share row.

## 3. `transactions` → drop scope, household NOT NULL

```sql
update public.transactions t                       -- personal rows had household_id null
   set household_id = (select hm.household_id from public.household_members hm
                        where hm.user_id = t.created_by limit 1)
 where t.household_id is null;
alter table public.transactions drop constraint scope_matches_household;
alter table public.transactions drop column scope;
alter table public.transactions alter column household_id set not null;
drop type transaction_scope;
```

## 4. RLS rewrite (drop personal/shared branches)

`transactions`: SELECT/INSERT/UPDATE/DELETE gated by household membership only:
```sql
-- select: is_household_member(household_id)
-- insert: created_by = auth.uid() and is_household_member(household_id)
-- update/delete: created_by = auth.uid() or is_household_owner(household_id)
```
`transaction_shares`: a row is visible/writable iff the parent transaction is — same
`exists (select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id) …)`
without the `scope` predicates.

## 5. Aggregate RPCs

`household_owner_spend` (and `household_*` siblings that referenced shares/scope) change from
percent-weighting to a direct cents sum and drop the no-rows branch:
```sql
select s.person_id as person_id, sum(s.amount_cents)::bigint as cents
  from public.transactions t
  join public.transaction_shares s on s.transaction_id = t.id
 where t.household_id = p_household_id and t.kind = 'expense'
   and t.date >= p_start and t.date < p_end
   and public.is_household_member(p_household_id)
 group by s.person_id;
```
Return column renamed `user_id → person_id`. Category/month/daily RPCs that don't reference
scope or shares are unchanged except for dropping any `scope`/null-household assumptions.

## Down / fallback

No down migration authored (forward-only; data is early/personal). Fallback if a backfill
defect is found pre-apply: reset the affected dev rows. The migration is verified against the
quickstart sum-check query before being considered done.

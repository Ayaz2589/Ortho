# Contract: Goals schema (`supabase/migrations/20260718120000_savings_goals.sql`)

Follows the migration conventions in `docs/supabase.md` §7 (heavily commented
header naming the spec; enums → tables → triggers → indexes → RLS enable →
policies → grants). Touches **no existing table/enum/policy**. Deliberately
member-managed (the budgets posture), not service-role-only (goals hold no secret).

## Ordering & guards

1. `create type public.goal_kind as enum ('savings', 'debt_payoff');`
2. `create table public.goals (...)` — see [data-model.md](../data-model.md).
3. `create table public.goal_contributions (...)`.
4. `create trigger goals_touch_updated_at before update on public.goals for each row
   execute function public.touch_updated_at();`
5. Indexes: `goals_household_idx (household_id)`,
   `goal_contributions_goal_idx (goal_id)`.
6. `alter table ... enable row level security;` on both.
7. Policies (below).
8. Explicit grants (below).

## RLS policies

**`goals`** (budgets pattern, `is_household_member` SECURITY DEFINER helper):

```sql
create policy goals_member_select on public.goals
  for select using (public.is_household_member(household_id));
create policy goals_member_insert on public.goals
  for insert with check (public.is_household_member(household_id));
create policy goals_member_update on public.goals
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy goals_member_delete on public.goals
  for delete using (public.is_household_member(household_id));
```

**`goal_contributions`** (`transaction_shares` parent-`EXISTS` pattern):

```sql
create policy goal_contributions_member_select on public.goal_contributions
  for select using (exists (
    select 1 from public.goals g
    where g.id = goal_id and public.is_household_member(g.household_id)));
-- insert/update/delete mirror this via using / with check on the same EXISTS.
```

## Grants (spec-024 explicit-ACL rule)

```sql
grant select, insert, update, delete on public.goals              to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;
```

No grant to `anon`; no service-role-only tables here.

## Invariants left to the client

- **Association exclusivity** is enforced in SQL
  (`check (linked_account_id is null or linked_category is null)`).
- **Positive target / positive contribution** enforced in SQL (`check > 0`).
- **Progress = Σ contributions** is a *client* computation (the DB stores rows, the
  engine derives) — consistent with the shares-sum-in-client convention.

## Local verification

`supabase db reset` replays all migrations including this one against the local
PG17 stack; the web suite + `tsc` then exercise the client mirrors. The migration
must apply cleanly on a fresh stack (explicit grants make it correct under the newer
default-deny ACL regime — `docs/supabase.md` §8).

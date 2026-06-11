-- Ortho — shared aggregation RPCs
-- Created: 2026-06-11  (feature 002-logic-dedup)
--
-- Moves the dashboard rollups out of duplicated client code (Swift + TS) into
-- one SQL definition both clients call. No backend tier — these are plain
-- Postgres functions over the existing schema, callable via PostgREST `rpc`.
--
-- SCOPE: these aggregate a household's SHARED transactions (`household_id =
-- p_household_id`). Personal transactions (`household_id is null`) are an
-- individual's own data, visible only to them under RLS, and stay a client
-- concern — they are intentionally NOT mixed into these household-level
-- aggregates. Presentation/currency conversion also stays on the client; all
-- outputs are USD cents.
--
-- Every function is `security definer` (so it can read across the household's
-- rows) but re-checks `is_household_member(p_household_id)` so a non-member
-- gets nothing — same guard the table RLS policies use.
--
-- Date range is half-open: `date >= p_start AND date < p_end` (matches the TS
-- `inRange`/insight-interval convention).

-- ── Per-owner split-weighted expense ────────────────────────────────────────
-- Mirrors the TS `spentBy`: each shared expense is attributed to its owners by
-- their `transaction_shares` percent (rounded per transaction per owner); a
-- shared transaction with no share rows is attributed 100% to its creator.
create or replace function public.household_owner_spend(
  p_household_id uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table(user_id uuid, cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  with exp as (
    select t.id, t.amount_cents, t.created_by
      from public.transactions t
     where t.household_id = p_household_id
       and t.kind = 'expense'
       and t.date >= p_start and t.date < p_end
       and public.is_household_member(p_household_id)
  ),
  weighted as (
    select s.user_id,
           round(e.amount_cents * s.percent / 100.0)::bigint as cents
      from exp e
      join public.transaction_shares s on s.transaction_id = e.id
    union all
    select e.created_by as user_id, e.amount_cents as cents
      from exp e
     where not exists (
       select 1 from public.transaction_shares s where s.transaction_id = e.id
     )
  )
  select user_id, sum(cents)::bigint as cents
    from weighted
   group by user_id;
$$;

-- ── Per-category expense (full amount, not split) ───────────────────────────
-- Mirrors the TS `categoryExpenseTotal`.
create or replace function public.household_category_totals(
  p_household_id uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table(category transaction_category, cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.category, sum(t.amount_cents)::bigint as cents
    from public.transactions t
   where t.household_id = p_household_id
     and t.kind = 'expense'
     and t.date >= p_start and t.date < p_end
     and public.is_household_member(p_household_id)
   group by t.category;
$$;

-- ── Month summary: income, expense, net ─────────────────────────────────────
create or replace function public.household_month_summary(
  p_household_id uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table(income bigint, expense bigint, net bigint)
language sql
stable
security definer
set search_path = public
as $$
  with sums as (
    select
      coalesce(sum(amount_cents) filter (where kind = 'income'), 0)::bigint  as income,
      coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)::bigint as expense
      from public.transactions
     where household_id = p_household_id
       and date >= p_start and date < p_end
       and public.is_household_member(p_household_id)
  )
  select income, expense, (income - expense)::bigint as net from sums;
$$;

-- ── Daily expense series ────────────────────────────────────────────────────
-- Mirrors the TS daily-expense buckets; one row per day that has expense.
create or replace function public.household_daily_expense(
  p_household_id uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table(day date, cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (t.date)::date as day, sum(t.amount_cents)::bigint as cents
    from public.transactions t
   where t.household_id = p_household_id
     and t.kind = 'expense'
     and t.date >= p_start and t.date < p_end
     and public.is_household_member(p_household_id)
   group by (t.date)::date
   order by day;
$$;

-- Allow signed-in users to call them; each function enforces membership itself.
revoke all on function public.household_owner_spend(uuid, timestamptz, timestamptz)     from public;
revoke all on function public.household_category_totals(uuid, timestamptz, timestamptz)  from public;
revoke all on function public.household_month_summary(uuid, timestamptz, timestamptz)    from public;
revoke all on function public.household_daily_expense(uuid, timestamptz, timestamptz)    from public;
grant execute on function public.household_owner_spend(uuid, timestamptz, timestamptz)    to authenticated;
grant execute on function public.household_category_totals(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.household_month_summary(uuid, timestamptz, timestamptz)  to authenticated;
grant execute on function public.household_daily_expense(uuid, timestamptz, timestamptz)  to authenticated;

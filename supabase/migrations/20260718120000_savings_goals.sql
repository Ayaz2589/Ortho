-- ============================================================================
-- Spec 027 — Savings & debt-payoff goals
-- ============================================================================
-- Named household goals with a target amount (USD cents) and optional target
-- date, plus the contributions recorded against them:
--   goals               — one row per named target; members read + manage
--                         (the budgets posture — collectively owned household
--                         data, NOT a secret, so plain member RLS, not the
--                         service-role-only entitlements/Plaid posture).
--   goal_contributions  — dated cent amounts set aside toward a goal. A goal's
--                         progress is the SUM of its contributions, computed in
--                         the client (lib/finance/goals.ts) — the DB stores
--                         rows, the engine derives (the shares-sum convention).
--
-- Progress is contribution-driven: Ortho's bank linking (spec 024) is
-- connect-only and syncs NO balances, so a linked-account balance cannot drive
-- progress in v1. `linked_account_id` / `linked_category` are CONTEXT ONLY
-- (at most one of the two — see the check), never a progress source here.
--
-- All money is integer USD cents (bigint), like every other money column.
-- Deliberately touches NO existing table/enum/policy.
-- Ordering (the 018/024 pattern): enum → tables → trigger → indexes →
-- RLS enable → policies → explicit grants.
-- ============================================================================

-- ============================================================================
-- ENUM
-- ============================================================================
-- Savings ("reach $5,000") and debt-payoff ("pay off $3,000") share one
-- progress model (accumulate contributions toward a positive target); kind
-- only drives plain-language framing. A brand-new CREATE TYPE used in the same
-- migration is fine — only ALTER TYPE ... ADD VALUE is same-migration-forbidden
-- (see 20260522170000).
create type public.goal_kind as enum ('savings', 'debt_payoff');

-- ============================================================================
-- TABLES
-- ============================================================================
create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  kind               public.goal_kind not null default 'savings',
  -- Positive target required (spec FR-001) — a goal with no destination is not
  -- a goal. Mirrors how budgets treat their limit (>= 0), but a goal target
  -- must be strictly positive so the progress fraction is always defined.
  target_cents       bigint not null check (target_cents > 0),
  -- Optional; a plain date (local calendar day, like lease/closing dates). The
  -- goal's created_at is the pace START reference; this is the pace END.
  target_date        date,
  -- CONTEXT ONLY (v1): associate a goal with one linked account OR one category.
  -- Neither drives progress; both are optional and independently clearable.
  linked_account_id  uuid references public.linked_accounts(id) on delete set null,
  linked_category    public.transaction_category,
  created_by         uuid not null references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- At most one association (spec FR-002).
  constraint goals_single_association
    check (linked_account_id is null or linked_category is null)
);

create table public.goal_contributions (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.goals(id) on delete cascade,
  -- A contribution is a positive amount set aside; removing a mistaken one is a
  -- row delete, not a negative amount (spec: saved = sum of contributions).
  amount_cents  bigint not null check (amount_cents > 0),
  date          date not null default current_date,
  note          text,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- TRIGGER
-- ============================================================================
create trigger goals_touch_updated_at
  before update on public.goals
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================
create index goals_household_idx on public.goals (household_id);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

-- goals: members of the household read + manage (the budgets pattern), via the
-- existing SECURITY DEFINER is_household_member helper.
create policy goals_member_select on public.goals
  for select using (public.is_household_member(household_id));

create policy goals_member_insert on public.goals
  for insert with check (public.is_household_member(household_id));

create policy goals_member_update on public.goals
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy goals_member_delete on public.goals
  for delete using (public.is_household_member(household_id));

-- goal_contributions: visibility/writability piggyback on the parent goal's
-- household (the transaction_shares EXISTS pattern) — no household_id column of
-- their own to keep the parent the single source of scope.
create policy goal_contributions_member_select on public.goal_contributions
  for select using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_household_member(g.household_id)
    )
  );

create policy goal_contributions_member_insert on public.goal_contributions
  for insert with check (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_household_member(g.household_id)
    )
  );

create policy goal_contributions_member_update on public.goal_contributions
  for update using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_household_member(g.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_household_member(g.household_id)
    )
  );

create policy goal_contributions_member_delete on public.goal_contributions
  for delete using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.is_household_member(g.household_id)
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Newer Supabase/PG17 stacks no longer auto-grant DML on new public tables to
-- client roles (docs/supabase.md §8) — grant explicitly so this migration
-- behaves identically on old and new ACL regimes. Member-managed data, so the
-- grants go to `authenticated` (RLS above is the real authorization layer);
-- no `anon`, no service-role-only tables here.
grant select, insert, update, delete on public.goals              to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;

comment on table public.goals is
  'Named household savings/debt-payoff goals (spec 027): target in USD cents, '
  'optional target date, optional CONTEXT-ONLY linked account/category. Progress '
  'is the client-computed sum of goal_contributions.';
comment on table public.goal_contributions is
  'Dated USD-cent amounts set aside toward a goal (spec 027). Their sum is the '
  'goal''s progress; a goal''s deletion cascades to these.';

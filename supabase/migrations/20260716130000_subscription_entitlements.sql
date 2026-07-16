-- ============================================================================
-- Spec 018 — Subscription entitlements
-- ============================================================================
-- One service-role-only source of truth for "may this user use the app":
--   entitlements    — one row per user; clients may ONLY select their own row.
--   billing_events  — append-only provider-event log (idempotency + audit);
--                     invisible to all client roles.
--   ensure_entitlement() — the single non-service-role write path: creates the
--                     caller's 31-day trial row exactly once (insert-if-absent).
--
-- Writes otherwise happen ONLY via the service role inside the billing edge
-- functions (supabase/functions/), driven by signature-verified Stripe events.
-- Deliberately touches NO existing table/enum/policy (spec FR-030).
-- Ordering: enums → tables → indexes → RLS enable → policies → RPCs.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Stored status stays provider-shaped; the UI gates on a DERIVED state computed
-- client-side (see specs/018-subscription-system/contracts/entitlement-state.md).
-- 'admin' is the operator-granted bypass: never expires, provider events never
-- downgrade it. 'trialing' here is the APP-administered free month — no Stripe
-- objects exist for a trialing user.
create type public.entitlement_status as enum (
  'trialing',
  'active',
  'past_due',
  'paused',
  'unpaid',
  'canceled',
  'admin'
);

create type public.billing_plan as enum ('monthly', 'yearly');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.entitlements (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  status                  public.entitlement_status not null default 'trialing',
  -- NULL = never expires (admin only). Trial rows: created_at + 31 days.
  -- Paid rows: the RAW provider period end — leeway lives in derivation, one place.
  access_expires_at       timestamptz,
  plan                    public.billing_plan,
  source                  text not null default 'trial'
                          check (source in ('trial', 'stripe', 'operator')),
  stripe_customer_id      text unique,
  stripe_subscription_id  text,
  -- Provider `created` of the last APPLIED event — the out-of-order shield.
  last_event_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.entitlements is
  'Per-user subscription source of truth (spec 018). Service-role writes only; '
  'clients read their own row. Gate state is derived client-side with leeway.';

create table public.billing_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'stripe',
  event_id          text not null unique,
  event_type        text not null,
  event_created_at  timestamptz not null,
  user_id           uuid,
  outcome           text not null,
  payload           jsonb not null,
  received_at       timestamptz not null default now()
);

comment on table public.billing_events is
  'Append-only provider-event log (spec 018): unique event_id is the webhook '
  'idempotency key; outcome records the state-machine decision. No client access.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Reuses the touch_updated_at() helper from the initial schema.
create trigger entitlements_touch_updated_at
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.entitlements   enable row level security;
alter table public.billing_events enable row level security;

-- entitlements: exactly ONE policy — read your own row. No insert/update/delete
-- policy exists for any client role; the service role bypasses RLS, and
-- ensure_entitlement() below is SECURITY DEFINER. A client that can write its
-- own entitlement is a paywall that doesn't exist (FR-017).
create policy entitlements_select_own on public.entitlements
  for select using (user_id = auth.uid());

-- billing_events: RLS enabled with ZERO policies — service-role/SQL-console only.

-- ============================================================================
-- RPCs
-- ============================================================================

-- The only trusted write path reachable by clients: create the caller's trial
-- row exactly once. Idempotent by design — reinstalls, re-sign-ins, and replays
-- can neither reset nor extend a trial (FR-001/002). Covers pre-rollout users
-- uniformly: their row appears at their first post-rollout bootstrap (D4).
-- SECURITY DEFINER (precedent: accept_invite); re-checks auth.uid() inside.
create or replace function public.ensure_entitlement()
returns public.entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     public.entitlements%rowtype;
begin
  if v_user_id is null then
    raise exception 'ensure_entitlement requires an authenticated user';
  end if;

  insert into public.entitlements (user_id, status, access_expires_at, source)
       values (v_user_id, 'trialing', now() + interval '31 days', 'trial')
  on conflict (user_id) do nothing;

  select * into v_row from public.entitlements where user_id = v_user_id;
  return v_row;
end;
$$;

revoke all on function public.ensure_entitlement() from public;
grant execute on function public.ensure_entitlement() to authenticated;

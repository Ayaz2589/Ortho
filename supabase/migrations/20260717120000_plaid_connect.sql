-- ============================================================================
-- Spec 024 — Plaid Connect (connect-only bank linking)
-- ============================================================================
-- Household-scoped record of standing bank connections made through an
-- aggregation provider (Plaid first — the provider column is the seam, FR-010):
--   linked_institutions        — one row per standing connection; members read,
--                                service role writes (edge functions only).
--   linked_accounts            — display metadata for each account an
--                                institution revealed; members read via parent.
--   linked_institution_secrets — institution → Vault secret mapping. RLS with
--                                ZERO policies: invisible to every client role.
--   plaid_link_sessions        — transient connection attempts (idempotency +
--                                the iOS foreground-poll path). Zero policies.
--
-- The provider access_token itself lives in SUPABASE VAULT (first use in this
-- repo), reachable only through the three SECURITY DEFINER wrapper RPCs below,
-- executable by service_role alone — the `vault` schema is not exposed over
-- PostgREST, and no client role may ever read a standing bank credential
-- (spec FR-005/FR-006, SC-002).
--
-- Connect-only scope guard: NO transaction/balance/staging tables, NO owner
-- assignment columns (spec FR-011) — those arrive with the future sync feature.
-- Deliberately touches NO existing table/enum/policy.
-- Ordering: extension → enums → tables → triggers → indexes → RLS enable →
-- policies → RPCs (the 018 pattern).
-- ============================================================================

-- Vault ships enabled on hosted projects and in the local CLI stack; this is
-- a no-op there but keeps `supabase db reset` honest on fresh stacks.
create extension if not exists supabase_vault;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- The provider seam (FR-010). A second provider is an isolated
-- `alter type ... add value` migration (never referenced in the same file —
-- see 20260522170000 for the pattern).
create type public.linked_provider as enum ('plaid');

-- Connection lifecycle is deliberately minimal for connect-only: repair/error
-- states (ITEM_LOGIN_REQUIRED etc.) arrive with the transactions feature.
create type public.linked_institution_status as enum ('active', 'disconnected');

-- Session expiry is DERIVED from expires_at at read time — there is no cron
-- flipping rows, so no 'expired' value here. 'abandoned' is best-effort client
-- hygiene; nothing load-bearing reads it.
create type public.link_session_status as enum ('pending', 'completed', 'abandoned');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.linked_institutions (
  id                       uuid primary key default gen_random_uuid(),
  household_id             uuid not null references public.households(id) on delete cascade,
  provider                 public.linked_provider not null default 'plaid',
  -- Plaid item_id: the stable identity of one standing connection. Unique per
  -- provider — the idempotency anchor for double hand-backs and retries.
  provider_item_id         text not null,
  -- Plaid ins_* id; Plaid may omit it for some items.
  provider_institution_id  text,
  institution_name         text not null default '',
  status                   public.linked_institution_status not null default 'active',
  created_by               uuid not null references public.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  disconnected_at          timestamptz,
  unique (provider, provider_item_id)
);

comment on table public.linked_institutions is
  'Standing bank connections via an aggregation provider (spec 024). Household '
  'members read; ALL writes are service-role inside the plaid-* edge functions. '
  'The access credential lives in Vault, never here.';

create table public.linked_accounts (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references public.linked_institutions(id) on delete cascade,
  provider_account_id  text not null,
  name                 text not null default '',
  official_name        text,
  -- Last-4 display mask; Plaid may omit it.
  mask                 text,
  -- Plaid type/subtype vocabulary is the provider's to grow — stored as text,
  -- rendered verbatim, never branched on (connect-only scope, FR-011).
  account_type         text not null default '',
  account_subtype      text,
  created_at           timestamptz not null default now(),
  unique (institution_id, provider_account_id)
);

comment on table public.linked_accounts is
  'Display metadata for accounts revealed by a linked institution (spec 024). '
  'Never balances, never transactions — connect-only scope.';

create table public.linked_institution_secrets (
  institution_id   uuid primary key references public.linked_institutions(id) on delete cascade,
  -- Row id in vault.secrets holding the provider access_token.
  vault_secret_id  uuid not null,
  created_at       timestamptz not null default now()
);

comment on table public.linked_institution_secrets is
  'Institution -> Vault secret mapping (spec 024). RLS with zero policies: no '
  'client role can see even the mapping; only the wrapper RPCs touch it.';

create table public.plaid_link_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id),
  household_id   uuid not null references public.households(id) on delete cascade,
  -- 'embedded' = web page runs Plaid Link; 'hosted' = external browser
  -- (Capacitor iOS — webview Link is deprecated by Plaid).
  mode           text not null check (mode in ('embedded', 'hosted')),
  -- Needed server-side for POST /link/token/get (hosted completion + polling).
  -- Zero-policy table keeps it out of client reach after issuance.
  link_token     text not null,
  status         public.link_session_status not null default 'pending',
  institution_id uuid references public.linked_institutions(id),
  created_at     timestamptz not null default now(),
  -- Plaid link-token expiration (~30 min direct). Expiry is derived at read
  -- time: a pending session with expires_at < now() can never complete.
  expires_at     timestamptz not null,
  completed_at   timestamptz
);

comment on table public.plaid_link_sessions is
  'Transient Plaid Link attempts (spec 024): the idempotency record for '
  'completion (exactly one institution per session) and the iOS foreground-'
  'poll path. Zero client policies; edge functions only.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Reuses the touch_updated_at() helper from the initial schema.
create trigger linked_institutions_touch_updated_at
  before update on public.linked_institutions
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================

create index linked_institutions_household_id_idx on public.linked_institutions (household_id);
create index linked_accounts_institution_id_idx   on public.linked_accounts (institution_id);
create index plaid_link_sessions_user_id_idx      on public.plaid_link_sessions (user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.linked_institutions        enable row level security;
alter table public.linked_accounts            enable row level security;
alter table public.linked_institution_secrets enable row level security;
alter table public.plaid_link_sessions        enable row level security;

-- Linked banks are household-level shared facts (like budgets): any member
-- reads; NO client role writes (no insert/update/delete policy exists — the
-- service role inside the edge functions bypasses RLS).
create policy linked_institutions_select on public.linked_institutions
  for select using (public.is_household_member(household_id));

-- Accounts piggyback on the parent institution's visibility (the
-- transaction_shares pattern).
create policy linked_accounts_select on public.linked_accounts
  for select using (
    exists (
      select 1 from public.linked_institutions li
      where li.id = institution_id
        and public.is_household_member(li.household_id)
    )
  );

-- linked_institution_secrets: RLS enabled with ZERO policies.
-- plaid_link_sessions:        RLS enabled with ZERO policies.

-- ============================================================================
-- TABLE GRANTS (explicit — do not rely on default privileges)
-- ============================================================================
-- Newer Supabase stacks no longer auto-grant DML on public tables to the
-- client/service roles (verified against the local Postgres 17 stack, where
-- the default ACL for postgres-created tables gives anon/authenticated/
-- service_role no SELECT/INSERT/UPDATE/DELETE at all). Older projects — like
-- the hosted one this repo links — still have the permissive defaults.
-- Explicit grants make this migration correct under BOTH regimes:
--   * authenticated: SELECT only, on the two display tables; RLS filters rows.
--     No grant at all on the secret/session tables — client roles are denied
--     at the privilege layer before RLS is even consulted.
--   * service_role: full DML everywhere (it bypasses RLS but NOT privileges).
--   * anon: nothing — linked banks are never visible signed-out.
grant select on public.linked_institutions to authenticated;
grant select on public.linked_accounts     to authenticated;
grant select, insert, update, delete on public.linked_institutions        to service_role;
grant select, insert, update, delete on public.linked_accounts            to service_role;
grant select, insert, update, delete on public.linked_institution_secrets to service_role;
grant select, insert, update, delete on public.plaid_link_sessions        to service_role;

-- ============================================================================
-- RPCs — Vault wrappers (service_role ONLY; not callable by any client)
-- ============================================================================
-- PostgREST does not expose the `vault` schema, so the service-role edge
-- functions reach it through these SECURITY DEFINER bridges. EXECUTE is
-- revoked from public/anon/authenticated and granted to service_role alone:
-- a leaked anon key still cannot touch a bank credential.

-- Store (or replace, on deliberate re-link) the access token for an
-- institution. Returns the vault secret id recorded in the mapping table.
create or replace function public.store_institution_secret(
  p_institution_id uuid,
  p_secret         text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_secret_id uuid;
begin
  -- Replace-not-duplicate: a re-link of the same provider item mints a new
  -- token; the old Vault row must not linger.
  select vault_secret_id into v_existing
    from public.linked_institution_secrets
   where institution_id = p_institution_id;
  if v_existing is not null then
    delete from vault.secrets where id = v_existing;
    delete from public.linked_institution_secrets where institution_id = p_institution_id;
  end if;

  v_secret_id := vault.create_secret(
    p_secret,
    'linked_institution:' || p_institution_id::text
  );

  insert into public.linked_institution_secrets (institution_id, vault_secret_id)
       values (p_institution_id, v_secret_id);

  return v_secret_id;
end;
$$;

-- Read the decrypted access token for an institution; NULL when absent.
create or replace function public.get_institution_secret(p_institution_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select ds.decrypted_secret
    from public.linked_institution_secrets lis
    join vault.decrypted_secrets ds on ds.id = lis.vault_secret_id
   where lis.institution_id = p_institution_id;
$$;

-- Delete the token + mapping (disconnect). Idempotent: absent rows are a no-op.
create or replace function public.delete_institution_secret(p_institution_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
    from public.linked_institution_secrets
   where institution_id = p_institution_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
    delete from public.linked_institution_secrets where institution_id = p_institution_id;
  end if;
end;
$$;

revoke all on function public.store_institution_secret(uuid, text) from public;
revoke all on function public.get_institution_secret(uuid)         from public;
revoke all on function public.delete_institution_secret(uuid)      from public;
grant execute on function public.store_institution_secret(uuid, text) to service_role;
grant execute on function public.get_institution_secret(uuid)         to service_role;
grant execute on function public.delete_institution_secret(uuid)      to service_role;

-- Ortho — initial schema
-- Created: 2026-05-21
--
-- Mirrors the Identity & Permissions Model spec in Tasks.md. Tables follow
-- the Swift domain models in `Ortho-iOS/Models/`. Money is stored in USD
-- cents (`bigint`); per-user display currency is a device preference and
-- intentionally not persisted server-side.
--
-- v1 role enum is `owner | member`. `admin` is deferred — adding it later
-- is a single `ALTER TYPE role ADD VALUE 'admin'` plus new policy branches.
--
-- Running order: enums → tables → indexes → helper functions → RLS enable
-- → RLS policies → RPCs.

-- ============================================================================
-- ENUMS
-- ============================================================================

create type role             as enum ('owner', 'member');
create type transaction_kind as enum ('expense', 'income');
create type transaction_scope as enum ('personal', 'shared');
create type property_kind    as enum ('primary_home', 'multifamily', 'rental');
create type transaction_category as enum (
  'coffee', 'groceries', 'dining', 'subs', 'fuel',
  'rent', 'health', 'income', 'transit', 'utilities'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Profile row mirroring auth.users. `id` is identical to `auth.uid()`.
-- App-side `ensureCurrentUser(authID:email:)` inserts/upserts on sign-in.
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  initial     text not null,
  color_key   text not null,
  created_at  timestamptz not null default now()
);

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete restrict,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.users(id)      on delete cascade,
  role         role not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.pending_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email        text,
  role         role not null default 'member',
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_by   uuid not null references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  redeemed_at  timestamptz
);

create table public.cards (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  -- nullable: personal transactions have no household.
  household_id    uuid references public.households(id) on delete cascade,
  merchant        text not null,
  category        transaction_category not null,
  kind            transaction_kind not null,
  scope           transaction_scope not null,
  amount_cents    bigint not null,
  source          text not null default '',
  date            timestamptz not null,
  created_by      uuid not null references public.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint amount_non_negative check (amount_cents >= 0),
  -- Scope ↔ household_id invariant (matches the spec).
  constraint scope_matches_household check (
    (scope = 'shared'   and household_id is not null) or
    (scope = 'personal' and household_id is null)
  )
);

-- Per-owner percentages for a SHARED transaction. Ortho users only —
-- local-user splits live on the device. Even splits are materialized as
-- explicit rows on save (no implicit nil-means-even at this layer).
--
-- Note: the sum-to-100 invariant is enforced by the client / RPC layer.
-- A deferred constraint trigger could enforce it in SQL — deferred to keep
-- v1 simple.
create table public.transaction_shares (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id        uuid not null references public.users(id)        on delete restrict,
  percent        numeric(5,2) not null,
  primary key (transaction_id, user_id),
  constraint percent_range check (percent >= 0 and percent <= 100)
);

create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  kind          property_kind not null,
  address       text not null,
  nickname      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 1:1 with properties for primary_home + multifamily kinds. Enforced by
-- application logic (AddPropertySheet builders) plus a partial check via
-- the trigger below.
create table public.mortgage_info (
  property_id                    uuid primary key references public.properties(id) on delete cascade,
  purchase_price_cents           bigint not null check (purchase_price_cents >= 0),
  original_loan_cents            bigint not null check (original_loan_cents  >= 0),
  annual_interest_rate_percent   numeric(7,4) not null,
  loan_term_years                int not null check (loan_term_years > 0),
  closing_date                   date not null,
  auto_pay_source                text
);

-- 1:1 with properties for rental kind.
create table public.lease_info (
  property_id              uuid primary key references public.properties(id) on delete cascade,
  monthly_rent_cents       bigint not null check (monthly_rent_cents >= 0),
  lease_start              date not null,
  lease_end                date not null,
  security_deposit_cents   bigint check (security_deposit_cents is null or security_deposit_cents >= 0),
  paid_with_source         text,
  constraint lease_dates_ordered check (lease_end >= lease_start)
);

-- N:1 with properties for multifamily kind.
create table public.units (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties(id) on delete cascade,
  name              text not null,
  monthly_rent_cents bigint not null check (monthly_rent_cents >= 0),
  tenant_name       text,
  tenant_email      text,
  sort_order        int not null default 0
);

create table public.rental_payments (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents >= 0),
  date          date not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index transactions_household_date_idx on public.transactions (household_id, date desc);
create index transactions_created_by_idx     on public.transactions (created_by);
create index transaction_shares_user_idx     on public.transaction_shares (user_id);
create index household_members_user_idx      on public.household_members (user_id);
create index pending_invites_household_idx   on public.pending_invites (household_id);
create index properties_household_idx        on public.properties (household_id);
create index units_property_idx              on public.units (property_id);
create index rental_payments_property_idx    on public.rental_payments (property_id, date desc);
create index cards_household_idx             on public.cards (household_id);

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER — break RLS recursion)
-- ============================================================================
--
-- RLS policies on `household_members` that reference `household_members`
-- recurse infinitely. These helpers run with elevated privileges and bypass
-- RLS, letting policies ask "is this user a member of household X?" safely.

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
     where household_id = p_household_id
       and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
     where household_id = p_household_id
       and user_id = auth.uid()
       and role = 'owner'
  );
$$;

-- ============================================================================
-- updated_at TRIGGER
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

alter table public.users               enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.pending_invites     enable row level security;
alter table public.cards               enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_shares  enable row level security;
alter table public.properties          enable row level security;
alter table public.mortgage_info       enable row level security;
alter table public.lease_info          enable row level security;
alter table public.units               enable row level security;
alter table public.rental_payments     enable row level security;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- ---- users -----------------------------------------------------------------
-- A user can read + update their own profile. Reading other users is allowed
-- only for members of households the current user belongs to (so the activity
-- list can render owner names + avatars).

create policy users_self_select on public.users
  for select using (id = auth.uid());

create policy users_household_peers_select on public.users
  for select using (
    exists (
      select 1
        from public.household_members mine
        join public.household_members peers
          on peers.household_id = mine.household_id
       where mine.user_id  = auth.uid()
         and peers.user_id = public.users.id
    )
  );

create policy users_self_insert on public.users
  for insert with check (id = auth.uid());

create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- households ------------------------------------------------------------

create policy households_member_select on public.households
  for select using (public.is_household_member(id));

-- A user can create a household. The CHECK constraint enforces ownership.
create policy households_insert on public.households
  for insert with check (owner_id = auth.uid());

create policy households_owner_update on public.households
  for update using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

create policy households_owner_delete on public.households
  for delete using (public.is_household_owner(id));

-- ---- household_members -----------------------------------------------------

create policy household_members_select on public.household_members
  for select using (public.is_household_member(household_id));

-- INSERT typically happens via accept_invite() RPC (security definer) or
-- the household creator inserting themselves on household creation.
-- Owner can insert any row; user can insert their own owner-role row when
-- creating a household.
create policy household_members_insert on public.household_members
  for insert with check (
    public.is_household_owner(household_id)
    or (user_id = auth.uid() and role = 'owner')
  );

create policy household_members_owner_delete on public.household_members
  for delete using (public.is_household_owner(household_id));

-- A user can also remove themselves (leave household).
create policy household_members_self_delete on public.household_members
  for delete using (user_id = auth.uid());

-- ---- pending_invites -------------------------------------------------------

create policy pending_invites_owner_select on public.pending_invites
  for select using (public.is_household_owner(household_id));

create policy pending_invites_owner_insert on public.pending_invites
  for insert with check (
    public.is_household_owner(household_id)
    and created_by = auth.uid()
  );

create policy pending_invites_owner_delete on public.pending_invites
  for delete using (public.is_household_owner(household_id));

-- ---- cards -----------------------------------------------------------------

create policy cards_member_select on public.cards
  for select using (public.is_household_member(household_id));

create policy cards_member_insert on public.cards
  for insert with check (public.is_household_member(household_id));

create policy cards_member_update on public.cards
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy cards_member_delete on public.cards
  for delete using (public.is_household_member(household_id));

-- ---- transactions ----------------------------------------------------------
-- SELECT: personal rows visible to creator; shared rows visible to all members.
-- INSERT: personal — creator only; shared — household members only.
-- UPDATE / DELETE: creator OR household owner.

create policy transactions_select on public.transactions
  for select using (
    (scope = 'personal' and created_by = auth.uid())
    or
    (scope = 'shared'   and public.is_household_member(household_id))
  );

create policy transactions_insert on public.transactions
  for insert with check (
    created_by = auth.uid()
    and (
      (scope = 'personal' and household_id is null)
      or
      (scope = 'shared'   and public.is_household_member(household_id))
    )
  );

create policy transactions_update on public.transactions
  for update using (
    created_by = auth.uid()
    or (scope = 'shared' and public.is_household_owner(household_id))
  )
  with check (
    created_by = auth.uid()
    or (scope = 'shared' and public.is_household_owner(household_id))
  );

create policy transactions_delete on public.transactions
  for delete using (
    created_by = auth.uid()
    or (scope = 'shared' and public.is_household_owner(household_id))
  );

-- ---- transaction_shares ----------------------------------------------------
-- Shares follow their parent transaction. A user can see/modify a share only
-- if they can see/modify the underlying transaction.

create policy transaction_shares_select on public.transaction_shares
  for select using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and (
           (t.scope = 'personal' and t.created_by = auth.uid())
           or
           (t.scope = 'shared'   and public.is_household_member(t.household_id))
         )
    )
  );

create policy transaction_shares_write on public.transaction_shares
  for all
  using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and (
           t.created_by = auth.uid()
           or (t.scope = 'shared' and public.is_household_owner(t.household_id))
         )
    )
  )
  with check (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_shares.transaction_id
         and (
           t.created_by = auth.uid()
           or (t.scope = 'shared' and public.is_household_owner(t.household_id))
         )
    )
  );

-- ---- properties + housing sub-tables ---------------------------------------
-- Properties belong to a household. Any household member can read + write.
-- (No per-user "owner" on a property — the household owns it collectively.)

create policy properties_member_select on public.properties
  for select using (public.is_household_member(household_id));

create policy properties_member_insert on public.properties
  for insert with check (public.is_household_member(household_id));

create policy properties_member_update on public.properties
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy properties_member_delete on public.properties
  for delete using (public.is_household_member(household_id));

-- Helper expression used by housing sub-tables — checks the property's
-- household membership.
create or replace function public.is_property_household_member(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
      join public.household_members m on m.household_id = p.household_id
     where p.id = p_property_id
       and m.user_id = auth.uid()
  );
$$;

create policy mortgage_info_member_all on public.mortgage_info
  for all
  using (public.is_property_household_member(property_id))
  with check (public.is_property_household_member(property_id));

create policy lease_info_member_all on public.lease_info
  for all
  using (public.is_property_household_member(property_id))
  with check (public.is_property_household_member(property_id));

create policy units_member_all on public.units
  for all
  using (public.is_property_household_member(property_id))
  with check (public.is_property_household_member(property_id));

create policy rental_payments_member_all on public.rental_payments
  for all
  using (public.is_property_household_member(property_id))
  with check (public.is_property_household_member(property_id));

-- ============================================================================
-- accept_invite RPC
-- ============================================================================
--
-- Caller passes the raw invite token (typically a UUID encoded in the QR
-- payload or magic-link). Server hashes it, looks up a matching, unredeemed,
-- unexpired `pending_invites` row, and atomically (a) inserts the
-- `household_members` row and (b) marks the invite redeemed.
--
-- SECURITY DEFINER so the function can read pending_invites and write
-- household_members regardless of caller's RLS context. We re-check
-- `auth.uid()` inside so an unauthenticated caller can't redeem anything.

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite     public.pending_invites%rowtype;
  v_token_hash text;
  v_user_id    uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'accept_invite requires an authenticated user';
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_invite
    from public.pending_invites
   where token_hash = v_token_hash
     and redeemed_at is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'Invite is invalid, redeemed, or expired';
  end if;

  -- Idempotent membership insert.
  insert into public.household_members (household_id, user_id, role)
       values (v_invite.household_id, v_user_id, v_invite.role)
  on conflict (household_id, user_id) do nothing;

  update public.pending_invites
     set redeemed_at = now()
   where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

-- accept_invite depends on pgcrypto for digest(). Enable the extension if
-- it isn't already.
create extension if not exists pgcrypto;

-- Allow authenticated users to call the RPC; the function itself enforces
-- authentication and token validity.
revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

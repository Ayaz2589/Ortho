-- Ortho — atomic transaction + shares upsert  (spec 027-ledger-atomic-persistence)
-- Created: 2026-07-18
--
-- Replaces the client-side two-step write (INSERT transactions, then INSERT
-- transaction_shares) + compensating rollback with a single PL/pgSQL function
-- that commits both writes atomically — or rolls back both on any failure.
--
-- The function also validates the shares-sum invariant inline, so the database
-- rejects any payload where sum(shares.amount_cents) ≠ transaction.amount_cents
-- before a single row is written.
--
-- Design decisions: specs/027-ledger-atomic-persistence/research.md

-- ── Pre-migration audit ──────────────────────────────────────────────────────
-- Count existing share-less transaction rows and surface as a NOTICE.
-- This migration does NOT modify historical data; operator remediation is
-- required if the count is non-zero (specs/027-ledger-atomic-persistence/research.md D6).
do $$
declare v_count bigint;
begin
  select count(*) into v_count
    from public.transactions t
   where not exists (
     select 1 from public.transaction_shares s where s.transaction_id = t.id
   );
  raise notice 'upsert_transaction migration: % share-less transaction row(s) found (pre-existing; not modified by this migration)', v_count;
end $$;

-- ── upsert_transaction ───────────────────────────────────────────────────────
-- Atomically upsert one transaction and replace all of its share rows.
--
-- Security model
-- --------------
-- `security definer` so the write runs as the function owner (postgres) and does
-- not depend on the caller having table-level DML grants on transactions /
-- transaction_shares. EXECUTE is revoked from PUBLIC and granted only to
-- `authenticated` + `service_role` (see the grants at the end of this file) —
-- the same posture every other SECURITY DEFINER function in this schema uses
-- (aggregates, ensure_entitlement, plaid). Because `anon` can never execute the
-- function, a NULL auth.uid() inside the body can ONLY be the trusted
-- service-role connection (the --admin CLI), so the membership guard is safely
-- skipped for it — matching the RLS bypass the service-role key already grants.
--
-- The inline guard re-implements the transactions RLS policies EXACTLY, and is
-- authorized against the EXISTING row (not the payload) so it is impossible to:
--   * write as anon (EXECUTE revoked),
--   * spoof `created_by` on insert (must equal auth.uid()),
--   * edit another member's transaction unless you are the household owner,
--   * overwrite/corrupt a transaction in a DIFFERENT household by supplying its
--     id with your own household_id (household_id is immutable + re-checked).
-- (research.md D2 preferred `security invoker`; we use definer because the RLS
-- model in this project does not grant base-table DML to the authenticated role,
-- so invoker would fail even for legitimate members. The guard below reproduces
-- the RLS policies so authorization is identical.)
create or replace function public.upsert_transaction(
  p_tx     jsonb,   -- transaction fields (see contracts/upsert_transaction.md)
  p_shares jsonb    -- array of {person_id, amount_cents}
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id               uuid   := (p_tx->>'id')::uuid;
  v_hh_id            uuid   := (p_tx->>'household_id')::uuid;
  v_amount           bigint := (p_tx->>'amount_cents')::bigint;
  v_created_by       uuid   := (p_tx->>'created_by')::uuid;
  v_uid              uuid   := auth.uid();
  v_existing_hh      uuid;
  v_existing_creator uuid;
  v_shares_sum       bigint;
begin
  -- Look up the existing row (if any) so UPDATEs are authorized against ITS
  -- ownership, not the caller-supplied payload.
  select household_id, created_by
    into v_existing_hh, v_existing_creator
    from public.transactions
   where id = v_id;

  -- Auth guard — mirrors the transactions RLS policies. Skipped only for the
  -- trusted service-role connection (auth.uid() NULL AND anon is revoked from
  -- EXECUTE, so a NULL uid here is never an unauthenticated web caller).
  if v_uid is not null then
    if not public.is_household_member(v_hh_id) then
      raise exception 'UNAUTHORIZED: not a member of household %', v_hh_id
        using errcode = 'insufficient_privilege';
    end if;
    if v_existing_hh is null then
      -- INSERT path: transactions_insert requires created_by = auth.uid().
      if v_created_by is distinct from v_uid then
        raise exception 'UNAUTHORIZED: created_by must be the calling user'
          using errcode = 'insufficient_privilege';
      end if;
    else
      -- UPDATE path: transactions_update requires creator OR household owner,
      -- evaluated on the existing row. household_id is immutable.
      if v_existing_hh <> v_hh_id then
        raise exception 'UNAUTHORIZED: household_id is immutable'
          using errcode = 'insufficient_privilege';
      end if;
      if v_existing_creator is distinct from v_uid
         and not public.is_household_owner(v_existing_hh) then
        raise exception 'UNAUTHORIZED: only the creator or a household owner may edit this transaction'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  -- Validate: shares must be a non-empty array (NULL / non-array / [] all reject,
  -- so a share-less transaction — the exact anomaly this migration prevents —
  -- can never be written, even for amount_cents = 0).
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) < 1 then
    raise exception 'NO_SHARES: transaction must have at least one owner share'
      using errcode = 'check_violation';
  end if;

  -- Validate: sum(shares.amount_cents) must equal the transaction amount.
  select coalesce(sum((s->>'amount_cents')::bigint), 0)
    into v_shares_sum
    from jsonb_array_elements(p_shares) as s;

  if v_shares_sum != v_amount then
    raise exception 'SHARES_MISMATCH: shares sum % != transaction amount %', v_shares_sum, v_amount
      using errcode = 'check_violation';
  end if;

  -- Upsert the transaction row.
  -- Immutable columns (id, household_id, created_by, created_at) are excluded
  -- from the DO UPDATE set so re-upserts cannot change ownership or creation time.
  insert into public.transactions (
    id, household_id, merchant, category, kind, amount_cents,
    source, date, created_by, paid_by, updated_at
  ) values (
    v_id,
    v_hh_id,
    p_tx->>'merchant',
    (p_tx->>'category')::transaction_category,
    (p_tx->>'kind')::transaction_kind,
    v_amount,
    coalesce(p_tx->>'source', ''),
    (p_tx->>'date')::timestamptz,
    v_created_by,
    nullif(p_tx->>'paid_by', '')::uuid,
    now()
  )
  on conflict (id) do update set
    merchant     = excluded.merchant,
    category     = excluded.category,
    kind         = excluded.kind,
    amount_cents = excluded.amount_cents,
    source       = excluded.source,
    date         = excluded.date,
    paid_by      = excluded.paid_by,
    updated_at   = now();

  -- Replace share rows atomically (delete-then-insert within this function call;
  -- Postgres guarantees all three DML statements commit together or not at all).
  delete from public.transaction_shares
   where transaction_id = v_id;

  insert into public.transaction_shares (transaction_id, person_id, amount_cents)
  select v_id,
         (s->>'person_id')::uuid,
         (s->>'amount_cents')::bigint
    from jsonb_array_elements(p_shares) as s;
end;
$$;

-- Restrict EXECUTE to authenticated web users + the service-role CLI, matching
-- every other SECURITY DEFINER function in this schema. Without this, PostgreSQL's
-- default EXECUTE-to-PUBLIC grant would let the `anon` role call it — and since
-- the guard above is skipped for a NULL auth.uid(), that would be an
-- unauthenticated, RLS-bypassing write path into any household.
revoke all     on function public.upsert_transaction(jsonb, jsonb) from public;
grant  execute on function public.upsert_transaction(jsonb, jsonb) to authenticated, service_role;
